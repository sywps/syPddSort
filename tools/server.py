#!/usr/bin/env python3
"""Level editor server with save support."""
import http.server
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

PORT = int(os.environ.get('PORT', '8080'))
NL_API_BASE = os.environ.get('NL_API_BASE', 'https://doubao.zwchat.cn/v1')
NL_API_KEY = os.environ.get('NL_API_KEY', 'sk-4Oz0LSt9ruBO5W054NGYN2jD82dVyw3D8wmwAS62lNLfyzHn')
NL_MODEL = os.environ.get('NL_MODEL', 'gemini-3-flash-preview')
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

GAME_LEVEL_DATA_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'LevelData')
)
LEVEL_DATA_DIR = GAME_LEVEL_DATA_DIR
ONLINE_LEVEL_KEYS = (
    'levelId',
    'boardWidth',
    'boardHeight',
    'timeLimit',
    'slotTotalCount',
    'correctColorArr',
    'initRandomColorArr',
)


def build_game_level_filename(target_type, target_level_id):
    if target_type == 'theme':
        return f'zt_level_{target_level_id}.json'
    return f'level_{target_level_id}.json'


def normalize_online_level_payload(source_level_data, target_level_id):
    normalized = {key: source_level_data[key] for key in ONLINE_LEVEL_KEYS}
    normalized['levelId'] = target_level_id
    return normalized


LEVEL_FILENAME_RE = re.compile(r'^level_(\d+)\.json$')
JSONP_CALLBACK_RE = re.compile(r'^[A-Za-z_$][0-9A-Za-z_$]*$')


def path_to_project_rel(path):
    return os.path.relpath(path, PROJECT_ROOT).replace(os.sep, '/')


def resolve_level_dir(dir_value=None):
    if dir_value in (None, ''):
        resolved = LEVEL_DATA_DIR
    else:
        candidate = str(dir_value).strip().replace('\\', '/').lstrip('/')
        normalized = os.path.normpath(candidate)
        if normalized in ('', '.'):
            resolved = LEVEL_DATA_DIR
        else:
            if normalized.startswith('..') or os.path.isabs(normalized):
                raise ValueError('dir must stay inside the project root')
            resolved = os.path.abspath(os.path.join(PROJECT_ROOT, normalized))

    if os.path.commonpath([PROJECT_ROOT, resolved]) != PROJECT_ROOT:
        raise ValueError('dir must stay inside the project root')
    if not os.path.isdir(resolved):
        raise FileNotFoundError(f'directory not found: {path_to_project_rel(resolved)}')
    return resolved


def build_level_path(level_dir, level_id):
    return os.path.join(level_dir, f'level_{level_id}.json')


def resolve_project_file(path_value):
    if path_value in (None, ''):
        raise ValueError('path is required')

    candidate = str(path_value).strip().replace('\\', '/').lstrip('/')
    normalized = os.path.normpath(candidate)
    if normalized in ('', '.'):
        raise ValueError('path is required')
    if normalized.startswith('..') or os.path.isabs(normalized):
        raise ValueError('path must stay inside the project root')

    resolved = os.path.abspath(os.path.join(PROJECT_ROOT, normalized))
    if os.path.commonpath([PROJECT_ROOT, resolved]) != PROJECT_ROOT:
        raise ValueError('path must stay inside the project root')
    if not normalized.lower().endswith('.json'):
        raise ValueError('path must point to a .json file')
    if not os.path.isfile(resolved):
        raise FileNotFoundError(f'file not found: {path_to_project_rel(resolved)}')
    return resolved


def list_main_level_ids(level_dir):
    level_ids = []
    for name in os.listdir(level_dir):
        match = LEVEL_FILENAME_RE.match(name)
        if not match:
            continue
        level_ids.append(int(match.group(1)))
    level_ids.sort()
    return level_ids


def get_next_main_level_id(level_dir):
    existing = list_main_level_ids(level_dir)
    if not existing:
        return 1
    return existing[-1] + 1


def rebuild_level_payload(level_data, shuffle_attempts, max_groups_per_color, seed, target_ratio):
    from generate_initial_shuffle import (
        build_updated_payload,
        derive_seed,
        validate_grid,
    )
    from move_target_to_initial import assign_initial_layout, displacement_ratio

    correct = level_data.get('correctColorArr')
    if not correct:
        raise ValueError('levelData.correctColorArr is required')
    validate_grid(correct)

    base_seed = derive_seed(level_data, seed)
    attempts = max(1, int(shuffle_attempts))
    max_groups = max(1, int(max_groups_per_color))

    best_grid = None
    best_ratio = -1.0
    best_seed = base_seed
    best_key = None
    for attempt in range(attempts):
        current_seed = base_seed + attempt * 9973
        init_grid = assign_initial_layout(
            correct,
            seed=current_seed,
            max_groups_per_color=max_groups,
        )
        ratio = displacement_ratio(correct, init_grid)
        if target_ratio is None:
            key = (-ratio,)
        else:
            key = (abs(ratio - target_ratio), -ratio)
        if best_key is None or key < best_key:
            best_grid = init_grid
            best_ratio = ratio
            best_seed = current_seed
            best_key = key

    if best_grid is None:
        raise ValueError('Unable to rebuild initRandomColorArr')

    return build_updated_payload(
        payload=level_data,
        init_grid=best_grid,
        ratio=best_ratio,
        chosen_seed=best_seed,
    )


def parse_json_block(text):
    text = text.strip()
    if text.startswith('```'):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = '\n'.join(lines[1:-1]).strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    start_array = text.find('[')
    end_array = text.rfind(']')
    if start_array != -1 and end_array != -1 and end_array > start_array:
        return json.loads(text[start_array:end_array + 1])

    start_obj = text.find('{')
    end_obj = text.rfind('}')
    if start_obj != -1 and end_obj != -1 and end_obj > start_obj:
        return json.loads(text[start_obj:end_obj + 1])

    raise ValueError('Unable to parse JSON response from LLM')


def call_nl_model(command_text, level_data, original_level_data, has_candidate, params):
    prompt = f"""当前目标：对这个 guanka 关卡做微调。

页面状态：
- 当前展示的是 {'候选关卡' if has_candidate else '原始关卡'}
- 当前关卡ID: {level_data.get('levelId')}
- 棋盘尺寸: {level_data.get('boardWidth')}x{level_data.get('boardHeight')}
- 当前参数: shapeBudgetPct={params.get('shapeBudgetPct')} shuffleAttempts={params.get('shuffleAttempts')} maxGroupsPerColor={params.get('maxGroupsPerColor')} seed={params.get('seed')}
- 当前生成候选提示词: {params.get('instructionPrompt') or '未提供，使用页面默认提示词'}
- 原始关卡位移率: {original_level_data.get('displacementRatio')}
- 当前关卡位移率: {level_data.get('displacementRatio')}
- 当前 correctColorArr:
{json.dumps(level_data.get('correctColorArr'), ensure_ascii=False)}

要求：
- 改进配色，避免使用相近色和低对比的邻接配色
- 让图案更像、更形象、更可爱、更有质感
- 更符合当前流行拼豆豆风格：轮廓更清晰，主体更明快，点缀更讨喜
- 形状变化控制在 5% 以内
- 难度基本不变
- 优先调色，少量修边，不要大改轮廓

配色建议：
- 外轮廓/描边优先考虑较深、较稳的颜色：8棕 10海蓝 15靛 16锈 18绯
- 主体大色块优先考虑更明快、更可爱的颜色：3黄 5蓝 7粉 9白 11青绿 14金 19钢蓝 20桃
- 局部点缀优先考虑有辨识度的跳色：1红 7粉 12玫红 14金 18绯 20桃
- 尽量避免同时保留这些相近色组合：1红+18绯、2橙+20桃、4绿+17翠、5蓝+19钢蓝、6紫+15靛

只允许输出这些动作：
- {{"action":"load_level","levelId":1000}}
- {{"action":"generate_candidate"}}
- {{"action":"continue_generate"}}
- {{"action":"save_candidate"}}
- {{"action":"discard_candidate"}}
- {{"action":"set_param","name":"shapeBudgetPct"|"shuffleAttempts"|"maxGroupsPerColor"|"seed","value":数字}}
- {{"action":"replace_color","from":颜色ID,"to":颜色ID}}
- {{"action":"swap_colors","color1":颜色ID,"color2":颜色ID}}
- {{"action":"clear_color","color":颜色ID}}
- {{"action":"recolor_boundary","color":颜色ID}}
- {{"action":"recolor_interior","color":颜色ID}}
- {{"action":"flip","dir":"horizontal"|"vertical"}}
- {{"action":"rotate","dir":"clockwise"|"counterclockwise"}}
- {{"action":"mirror","dir":"left_to_right"|"right_to_left"|"top_to_bottom"|"bottom_to_top"}}
- {{"action":"paint_point","row":行号,"col":列号,"color":颜色ID}}
- {{"action":"paint_range","r1":行号,"c1":列号,"r2":行号,"c2":列号,"color":颜色ID}}

颜色ID映射：
1红 2橙 3黄 4绿 5蓝 6紫 7粉 8棕 9白 10海蓝 11青绿 12玫红 13青 14金 15靛 16锈 17翠 18绯 19钢蓝 20桃

动作偏好规则：
- 用户说“更像、更可爱、更萌、更精致、更有质感、更流行、避免相近色”，默认优先输出：
  1. recolor_boundary
  2. recolor_interior
  3. replace_color / swap_colors
  4. continue_generate
- 用户说“更像原图，但别改太多”，优先：
  1. set_param(shapeBudgetPct)
  2. replace_color / recolor_boundary / recolor_interior
  3. continue_generate
- 用户说“继续优化、再来一版、再试试、继续生成”，优先输出 continue_generate
- 用户说“把边缘/描边/外轮廓...”优先输出 recolor_boundary
- 用户说“把内部/主体里面/肚子/脸里面/大面积主体...”优先输出 recolor_interior
- 用户说“把红色改成蓝色...”优先输出 replace_color
- 用户说“交换红和白...”优先输出 swap_colors
- 用户说“保存”输出 save_candidate
- 用户说“丢弃/不要这版”输出 discard_candidate
- 用户说“加载第X关”输出 load_level

约束：
- 只返回 JSON 数组
- 不要输出解释
- 不要输出 markdown
- 不要编造不存在的动作
- 如果是调色或局部微调，输出最少必要动作

用户指令：
{command_text}
"""

    payload = {
        'model': NL_MODEL,
        'messages': [
            {
                'role': 'system',
                'content': (
                    '你是一个拼豆豆关卡微调动作规划器。'
                    '你的唯一任务是把用户中文修改意图转换成 JSON 动作数组。'
                    '你服务的是 guanka 微调工作台。'
                    '核心目标：改进配色，避免相近色，让图更像、更形象、更可爱、更有质感，更符合流行拼豆豆风格；'
                    '形状变化控制在 5% 以内；难度基本不变；优先调色，其次局部修边，禁止大改轮廓。'
                    '无论如何只返回 JSON 数组。'
                )
            },
            {
                'role': 'user',
                'content': prompt,
            },
        ],
        'stream': False,
        'google': {
            'thinking_config': {
                'thinking_level': 'low',
            }
        },
    }
    req = urllib.request.Request(
        f'{NL_API_BASE}/chat/completions',
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {NL_API_KEY}',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    content = (
        data.get('choices', [{}])[0]
        .get('message', {})
        .get('content', '')
    )
    actions = parse_json_block(content)
    if isinstance(actions, dict):
        actions = [actions]
    if not isinstance(actions, list):
        raise ValueError('LLM did not return a JSON array')
    return actions


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()
        self.wfile.write(body)

    def _send_javascript(self, status_code, source):
        body = source.encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/javascript; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()
        self.wfile.write(body)

    def _resolve_level_dir_or_send(self, dir_value):
        try:
            return resolve_level_dir(dir_value)
        except FileNotFoundError as exc:
            self._send_json(404, {'ok': False, 'error': str(exc)})
            return None
        except ValueError as exc:
            self._send_json(400, {'ok': False, 'error': str(exc)})
            return None

    def _load_project_level_file_payload(self, path_value):
        filepath = resolve_project_file(path_value)
        with open(filepath, 'r', encoding='utf-8') as f:
            level_data = json.load(f)
        return {
            'ok': True,
            'path': path_to_project_rel(filepath),
            'levelData': level_data,
        }

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/list-levels':
            query = urllib.parse.parse_qs(parsed.query)
            dir_value = query.get('dir', [''])[0]
            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return

            self._send_json(200, {
                'ok': True,
                'dir': path_to_project_rel(level_dir),
                'levelIds': list_main_level_ids(level_dir),
            })
            return

        if parsed.path == '/api/load-level':
            query = urllib.parse.parse_qs(parsed.query)
            dir_value = query.get('dir', [''])[0]
            level_id_raw = query.get('levelId', [''])[0]
            try:
                level_id = int(level_id_raw)
            except Exception:
                self._send_json(400, {'ok': False, 'error': 'levelId must be an integer'})
                return

            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return

            filepath = build_level_path(level_dir, level_id)
            if not os.path.exists(filepath):
                self._send_json(404, {
                    'ok': False,
                    'error': f'level_{level_id}.json not found in {path_to_project_rel(level_dir)}',
                })
                return

            with open(filepath, 'r', encoding='utf-8') as f:
                level_data = json.load(f)

            self._send_json(200, {
                'ok': True,
                'dir': path_to_project_rel(level_dir),
                'path': path_to_project_rel(filepath),
                'levelData': level_data,
            })
            return

        if parsed.path == '/api/load-level-file':
            query = urllib.parse.parse_qs(parsed.query)
            path_value = query.get('path', [''])[0]
            try:
                payload = self._load_project_level_file_payload(path_value)
            except FileNotFoundError as exc:
                self._send_json(404, {'ok': False, 'error': str(exc)})
                return
            except ValueError as exc:
                self._send_json(400, {'ok': False, 'error': str(exc)})
                return
            self._send_json(200, payload)
            return

        if parsed.path == '/api/load-level-file.js':
            query = urllib.parse.parse_qs(parsed.query)
            path_value = query.get('path', [''])[0]
            callback = query.get('callback', [''])[0].strip()
            if not JSONP_CALLBACK_RE.fullmatch(callback):
                self._send_javascript(400, 'console.error("Invalid callback");')
                return

            try:
                payload = self._load_project_level_file_payload(path_value)
            except FileNotFoundError as exc:
                payload = {'ok': False, 'error': str(exc)}
            except ValueError as exc:
                payload = {'ok': False, 'error': str(exc)}

            self._send_javascript(200, f'{callback}({json.dumps(payload, ensure_ascii=False)});')
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/save-level':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body)
            if isinstance(payload.get('levelData'), dict):
                data = payload['levelData']
                dir_value = payload.get('dir')
            else:
                data = payload
                dir_value = data.pop('dir', None)

            level_id = data.get('levelId', 1)
            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return
            filepath = build_level_path(level_dir, level_id)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self._send_json(200, {'ok': True, 'path': filepath})
        elif parsed.path == '/api/save-level-game':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body)
            if isinstance(payload.get('levelData'), dict):
                data = payload['levelData']
                target_type = payload.get('targetType', 'main')
            else:
                data = payload
                target_type = payload.get('targetType', 'main')

            if target_type not in ('main', 'online', 'theme'):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'targetType must be main, online or theme'},
                    ensure_ascii=False,
                ).encode())
                return

            level_id = data.get('levelId', 1)
            filepath = os.path.join(
                GAME_LEVEL_DATA_DIR,
                build_game_level_filename('theme' if target_type == 'theme' else 'main', level_id)
            )

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self._send_json(200, {'ok': True, 'path': filepath, 'targetType': target_type})
        elif parsed.path == '/api/import-level':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body)
            level_data = payload.get('levelData')
            level_dir = self._resolve_level_dir_or_send(payload.get('targetDir') or payload.get('dir'))
            if level_dir is None:
                return

            if not isinstance(level_data, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'levelData is required'},
                    ensure_ascii=False,
                ).encode())
                return

            target_level_id = payload.get('targetLevelId')
            if target_level_id in (None, '', 0):
                target_level_id = get_next_main_level_id(level_dir)
            else:
                try:
                    target_level_id = int(target_level_id)
                except Exception:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(
                        {'ok': False, 'error': 'targetLevelId must be an integer'},
                        ensure_ascii=False,
                    ).encode())
                    return

            if target_level_id < 1:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'targetLevelId must be >= 1'},
                    ensure_ascii=False,
                ).encode())
                return

            filepath = build_level_path(level_dir, target_level_id)
            if os.path.exists(filepath):
                self.send_response(409)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {
                        'ok': False,
                        'error': f'level_{target_level_id}.json already exists',
                        'exists': True,
                        'path': filepath,
                    },
                    ensure_ascii=False,
                ).encode())
                return

            base_payload = dict(level_data)
            base_payload['levelId'] = target_level_id
            base_payload.setdefault('online', False)
            base_payload.setdefault('isFeatured', False)
            base_payload.setdefault('levelCategory', '')
            base_payload.setdefault('levelName', '')

            try:
                updated = rebuild_level_payload(
                    level_data=base_payload,
                    shuffle_attempts=payload.get('shuffleAttempts', 12),
                    max_groups_per_color=payload.get('maxGroupsPerColor', 4),
                    seed=payload.get('seed'),
                    target_ratio=payload.get('targetDisplacementRatio'),
                )
            except Exception as exc:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': str(exc)},
                    ensure_ascii=False,
                ).encode())
                return

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(updated, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(
                {
                    'ok': True,
                    'path': filepath,
                    'levelId': target_level_id,
                    'levelData': updated,
                },
                ensure_ascii=False,
            ).encode())
        elif parsed.path == '/api/rebuild-level':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            level_data = data.get('levelData')
            if not isinstance(level_data, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(
                    json.dumps({'ok': False, 'error': 'levelData is required'}, ensure_ascii=False).encode()
                )
                return

            try:
                candidate = rebuild_level_payload(
                    level_data=level_data,
                    shuffle_attempts=data.get('shuffleAttempts', 16),
                    max_groups_per_color=data.get('maxGroupsPerColor', 4),
                    seed=data.get('seed'),
                    target_ratio=data.get('targetDisplacementRatio'),
                )
            except Exception as exc:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(
                    json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False).encode()
                )
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(
                json.dumps({'ok': True, 'candidate': candidate}, ensure_ascii=False).encode()
            )
        elif parsed.path == '/api/nl-edit':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            command_text = data.get('text', '').strip()
            level_data = data.get('levelData')
            original_level_data = data.get('originalLevelData')
            params = data.get('params') or {}
            has_candidate = bool(data.get('hasCandidate'))

            if not command_text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'text is required'}, ensure_ascii=False).encode())
                return
            if not isinstance(level_data, dict) or not isinstance(original_level_data, dict):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'levelData and originalLevelData are required'}, ensure_ascii=False).encode())
                return

            try:
                actions = call_nl_model(
                    command_text=command_text,
                    level_data=level_data,
                    original_level_data=original_level_data,
                    has_candidate=has_candidate,
                    params=params,
                )
            except Exception as exc:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(
                    json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False).encode()
                )
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(
                json.dumps({'ok': True, 'actions': actions}, ensure_ascii=False).encode()
            )
        elif parsed.path == '/api/refine-level':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            level_id = data.get('levelId')
            level_data = data.get('levelData')
            temp_path = None

            if level_data is not None:
                temp_file = tempfile.NamedTemporaryFile(
                    mode='w',
                    suffix='.json',
                    delete=False,
                    encoding='utf-8',
                )
                with temp_file as f:
                    json.dump(level_data, f, ensure_ascii=False, indent=2)
                    f.write('\n')
                    temp_path = f.name
                input_path = temp_path
            else:
                filepath = os.path.join(LEVEL_DATA_DIR, f'level_{level_id}.json')
                if not os.path.exists(filepath):
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': 'File not found'}).encode())
                    return
                input_path = filepath

            script_path = os.path.join(os.path.dirname(__file__), 'refine_guanka_level.py')
            cmd = [
                sys.executable,
                script_path,
                input_path,
                '--shape-budget-pct',
                str(data.get('shapeBudgetPct', 5)),
                '--shuffle-attempts',
                str(data.get('shuffleAttempts', 16)),
                '--max-groups-per-color',
                str(data.get('maxGroupsPerColor', 4)),
            ]
            if data.get('seed') is not None:
                cmd.extend(['--seed', str(data['seed'])])
            if data.get('instructionPrompt'):
                cmd.extend(['--instruction-prompt', str(data['instructionPrompt'])])

            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                    cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), '..')),
                )
                if proc.returncode != 0:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(
                        json.dumps(
                            {'ok': False, 'error': proc.stderr or proc.stdout or 'refine failed'},
                            ensure_ascii=False,
                        ).encode()
                    )
                    return
                result = json.loads(proc.stdout)
                result['ok'] = True
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.unlink(temp_path)
        elif parsed.path == '/api/toggle-featured':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            level_id = data.get('levelId')
            level_dir = self._resolve_level_dir_or_send(data.get('dir'))
            if level_dir is None:
                return
            filepath = build_level_path(level_dir, level_id)

            if not os.path.exists(filepath):
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'File not found'}).encode())
                return

            with open(filepath, 'r', encoding='utf-8') as f:
                level_data = json.load(f)

            level_data['isFeatured'] = not level_data.get('isFeatured', False)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(level_data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'isFeatured': level_data['isFeatured']}).encode())
        elif parsed.path == '/api/toggle-online':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            level_id = data.get('levelId')
            level_dir = self._resolve_level_dir_or_send(data.get('dir'))
            if level_dir is None:
                return
            filepath = build_level_path(level_dir, level_id)

            if not os.path.exists(filepath):
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'File not found'}).encode())
                return

            with open(filepath, 'r', encoding='utf-8') as f:
                level_data = json.load(f)

            level_data['online'] = not level_data.get('online', False)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(level_data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'online': level_data['online']}).encode())
        elif parsed.path == '/api/copy-level':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            source_level_id = data.get('sourceLevelId')
            target_type = data.get('targetType')  # 'online' | 'theme'
            target_level_id = data.get('targetLevelId')
            overwrite = bool(data.get('overwrite', False))
            source_level_dir = self._resolve_level_dir_or_send(data.get('sourceDir') or data.get('dir'))
            if source_level_dir is None:
                return

            if source_level_id is None or target_level_id is None:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'sourceLevelId and targetLevelId are required'},
                    ensure_ascii=False,
                ).encode())
                return

            try:
                target_level_id = int(target_level_id)
            except Exception:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'targetLevelId must be an integer'},
                    ensure_ascii=False,
                ).encode())
                return

            if target_type not in ('online', 'theme'):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'targetType must be online or theme'},
                    ensure_ascii=False,
                ).encode())
                return

            source_path = build_level_path(source_level_dir, source_level_id)
            if not os.path.exists(source_path):
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {
                        'ok': False,
                        'error': (
                            f'source level_{source_level_id}.json not found '
                            f'in {path_to_project_rel(source_level_dir)}'
                        ),
                    },
                    ensure_ascii=False,
                ).encode())
                return

            target_filename = build_game_level_filename(target_type, target_level_id)
            target_path = os.path.join(GAME_LEVEL_DATA_DIR, target_filename)
            if os.path.exists(target_path) and not overwrite:
                self.send_response(409)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(
                    {'ok': False, 'error': 'target file exists', 'targetPath': target_path, 'exists': True},
                    ensure_ascii=False,
                ).encode())
                return

            with open(source_path, 'r', encoding='utf-8') as f:
                level_data = json.load(f)

            if target_type == 'online':
                level_data = normalize_online_level_payload(level_data, target_level_id)
            else:
                level_data['levelId'] = target_level_id
                level_data['isFeatured'] = True
                level_data['sourceLevelId'] = source_level_id

            with open(target_path, 'w', encoding='utf-8') as f:
                json.dump(level_data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(
                {
                    'ok': True,
                    'targetPath': target_path,
                    'targetFilename': target_filename,
                    'targetLevelId': target_level_id,
                    'targetType': target_type,
                },
                ensure_ascii=False,
            ).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        # Enable CORS for local dev
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        # Prevent browser caching for JSON files
        if self.path.endswith('.json'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def translate_path(self, path):
        # Serve from project root so ../assets/ works from /tools/
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        path = path.split('?', 1)[0]
        parts = path.strip('/').split('/')
        return os.path.join(project_root, *parts)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
        print(f'Level editor server at http://localhost:{PORT}')
        print(f'Serving from: {os.path.abspath(os.curdir)}')
        print(f'Level data dir: {LEVEL_DATA_DIR}')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down.')
