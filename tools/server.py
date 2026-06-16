#!/usr/bin/env python3
"""Level editor server with save support."""
import http.server
import datetime
import hashlib
import json
import os
import re
import shutil
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
COMPETITOR_TOOLS_DIR = os.path.join(PROJECT_ROOT, 'tools', 'competitors')
IMPORT_MAP_FILENAME = 'official_import_map.json'
IMPORT_TARGET_TYPES = ('online', 'theme')

GAME_LEVEL_DATA_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'LevelData')
)
LEVEL_DATA_DIR = GAME_LEVEL_DATA_DIR
DAILY_REPORT_DIR = os.path.join(PROJECT_ROOT, 'artifacts', 'cloudbase-daily-report')
ONLINE_LEVEL_KEYS = (
    'levelId',
    'boardWidth',
    'boardHeight',
    'timeLimit',
    'slotTotalCount',
    'correctColorArr',
    'initRandomColorArr',
)
LEVEL_FINGERPRINT_VERSION = 1
LEVEL_FINGERPRINT_KEYS = tuple(key for key in ONLINE_LEVEL_KEYS if key != 'levelId')


def build_game_level_filename(target_type, target_level_id):
    if target_type == 'theme':
        return f'zt_level_{target_level_id}.json'
    return f'level_{target_level_id}.json'


class ApiError(Exception):
    def __init__(self, status_code, payload):
        super().__init__(payload.get('error', 'api error'))
        self.status_code = status_code
        self.payload = payload


def build_level_swap_backup_dir(level_a_id, level_b_id, target_type='online'):
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    prefix = 'zt_level' if normalize_import_target_type(target_type) == 'theme' else 'level'
    return os.path.join(
        PROJECT_ROOT,
        'temp',
        'level_swap_backups',
        f'{stamp}_{prefix}_{level_a_id}_{prefix}_{level_b_id}',
    )


def normalize_online_level_payload(source_level_data, target_level_id):
    required_keys = [key for key in ONLINE_LEVEL_KEYS if key != 'levelId']
    missing_keys = [key for key in required_keys if key not in source_level_data]
    if missing_keys:
        raise ValueError(f'missing online level fields: {", ".join(missing_keys)}')
    normalized = {key: source_level_data[key] for key in required_keys}
    normalized['levelId'] = target_level_id
    return normalized


def load_level_json(filepath):
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        return json.load(f)


def build_level_content_fingerprint(level_data):
    missing_keys = [key for key in LEVEL_FINGERPRINT_KEYS if key not in level_data]
    if missing_keys:
        raise ValueError(f'missing level fingerprint fields: {", ".join(missing_keys)}')
    canonical = {key: level_data[key] for key in LEVEL_FINGERPRINT_KEYS}
    body = json.dumps(
        canonical,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')
    return hashlib.sha256(body).hexdigest()


def read_level_content_fingerprint(filepath):
    return build_level_content_fingerprint(load_level_json(filepath))


def build_formal_level_fingerprint_index():
    index = {}
    for name in os.listdir(GAME_LEVEL_DATA_DIR):
        match = LEVEL_FILENAME_RE.match(name)
        if not match or match.group(1) != 'level':
            continue
        filepath = os.path.join(GAME_LEVEL_DATA_DIR, name)
        level_id = int(match.group(2))
        fingerprint = read_level_content_fingerprint(filepath)
        index.setdefault(fingerprint, []).append({
            'targetLevelId': level_id,
            'targetPath': path_to_project_rel(filepath),
        })
    for matches in index.values():
        matches.sort(key=lambda item: item['targetLevelId'])
    return index


LEVEL_FILENAME_RE = re.compile(r'^(level|lv|daily|zt_level)_(\d+)\.json$')
REPORT_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
JSONP_CALLBACK_RE = re.compile(r'^[A-Za-z_$][0-9A-Za-z_$]*$')


def path_to_project_rel(path):
    return os.path.relpath(path, PROJECT_ROOT).replace(os.sep, '/')


def list_report_dates():
    if not os.path.isdir(DAILY_REPORT_DIR):
        return []

    dates = []
    for name in os.listdir(DAILY_REPORT_DIR):
        if not REPORT_DATE_RE.fullmatch(name):
            continue
        summary_path = os.path.join(DAILY_REPORT_DIR, name, 'combined_summary.json')
        if os.path.isfile(summary_path):
            dates.append(name)
    dates.sort()
    return dates


def normalize_level_kind(kind_value=None):
    kind = str(kind_value or 'main').strip().lower()
    if kind in ('theme', 'zt', 'zt_level'):
        return 'theme'
    return 'main'


def level_filename_matches_kind(prefix, kind='main'):
    kind = normalize_level_kind(kind)
    if kind == 'theme':
        return prefix == 'zt_level'
    return prefix in ('level', 'lv', 'daily')


def get_competitor_import_map_path(path_value):
    rel_path = path_to_project_rel(os.path.abspath(path_value))
    parts = rel_path.split('/')
    if len(parts) >= 3 and parts[0] == 'tools' and parts[1] == 'competitors':
        return os.path.join(COMPETITOR_TOOLS_DIR, parts[2], IMPORT_MAP_FILENAME)
    return None


def read_import_map(map_path):
    if not map_path or not os.path.exists(map_path):
        return {}
    if os.path.getsize(map_path) == 0:
        return {}
    with open(map_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f'import map must be an object: {path_to_project_rel(map_path)}')
    return data


def write_import_map(map_path, data):
    os.makedirs(os.path.dirname(map_path), exist_ok=True)
    with open(map_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def normalize_import_target_type(value):
    target_type = str(value or 'online').strip().lower()
    if target_type in ('theme', 'zt', 'zt_level'):
        return 'theme'
    return 'online'


def normalize_import_marker(source_path, marker):
    source_rel = path_to_project_rel(source_path)
    if not isinstance(marker, dict):
        return {'sourcePath': source_rel, 'targets': {}}, True

    changed = False
    if isinstance(marker.get('targets'), dict):
        normalized = dict(marker)
        targets = {}
        for raw_type, raw_target in marker.get('targets', {}).items():
            if not isinstance(raw_target, dict):
                changed = True
                continue
            target_type = normalize_import_target_type(raw_type)
            target = dict(raw_target)
            if target.get('targetType') != target_type:
                target['targetType'] = target_type
                changed = True
            targets[target_type] = target
        normalized['targets'] = targets
    else:
        target_type = normalize_import_target_type(marker.get('targetType'))
        target = dict(marker)
        target['targetType'] = target_type
        normalized = {
            'sourcePath': marker.get('sourcePath') or source_rel,
            'targets': {target_type: target},
        }
        if marker.get('importedAt'):
            normalized['importedAt'] = marker.get('importedAt')
        changed = True

    if normalized.get('sourcePath') != source_rel:
        normalized['sourcePath'] = source_rel
        changed = True
    return normalized, changed


def build_target_level_fingerprint_index(target_type='online'):
    target_type = normalize_import_target_type(target_type)
    filename_prefix = 'zt_level' if target_type == 'theme' else 'level'
    index = {}
    for name in os.listdir(GAME_LEVEL_DATA_DIR):
        match = LEVEL_FILENAME_RE.match(name)
        if not match or match.group(1) != filename_prefix:
            continue
        filepath = os.path.join(GAME_LEVEL_DATA_DIR, name)
        level_id = int(match.group(2))
        try:
            fingerprint = read_level_content_fingerprint(filepath)
        except Exception:
            continue
        index.setdefault(fingerprint, []).append({
            'targetLevelId': level_id,
            'targetPath': path_to_project_rel(filepath),
        })
    for matches in index.values():
        matches.sort(key=lambda item: item['targetLevelId'])
    return index


def repair_import_target_marker(source_path, target_type, marker, fingerprint_index):
    if not isinstance(marker, dict):
        return marker, False

    target_type = normalize_import_target_type(target_type)
    source_fingerprint = read_level_content_fingerprint(source_path)
    updated = dict(marker)
    changed = False

    if updated.get('targetType') != target_type:
        updated['targetType'] = target_type
        changed = True
    if updated.get('fingerprintVersion') != LEVEL_FINGERPRINT_VERSION:
        updated['fingerprintVersion'] = LEVEL_FINGERPRINT_VERSION
        changed = True
    if updated.get('contentFingerprint') != source_fingerprint:
        updated['contentFingerprint'] = source_fingerprint
        changed = True

    matches = fingerprint_index.get(source_fingerprint, [])
    if not matches:
        return updated, changed

    try:
        current_target_id = int(updated.get('targetLevelId'))
    except Exception:
        current_target_id = None

    chosen = next(
        (item for item in matches if item['targetLevelId'] == current_target_id),
        None,
    )
    if chosen is None:
        chosen = matches[0]
        if current_target_id is not None and current_target_id != chosen['targetLevelId']:
            updated['previousTargetLevelId'] = current_target_id
            updated['previousTargetPath'] = updated.get('targetPath')
            updated['repairedAt'] = datetime.datetime.now().isoformat(timespec='seconds')
            changed = True

    if updated.get('targetLevelId') != chosen['targetLevelId']:
        updated['targetLevelId'] = chosen['targetLevelId']
        changed = True
    if updated.get('targetPath') != chosen['targetPath']:
        updated['targetPath'] = chosen['targetPath']
        changed = True

    duplicate_count = len(matches)
    if duplicate_count > 1:
        if updated.get('targetDuplicateCount') != duplicate_count:
            updated['targetDuplicateCount'] = duplicate_count
            changed = True
    elif 'targetDuplicateCount' in updated:
        updated.pop('targetDuplicateCount', None)
        changed = True

    return updated, changed


def repair_import_map(import_map):
    if not import_map:
        return import_map, False

    repaired_map = dict(import_map)
    fingerprint_indexes = {}
    changed = False
    for source_rel, marker in list(import_map.items()):
        source_path = os.path.abspath(os.path.join(PROJECT_ROOT, source_rel.replace('/', os.sep)))
        if (
            os.path.commonpath([PROJECT_ROOT, source_path]) != PROJECT_ROOT
            or not os.path.isfile(source_path)
        ):
            continue

        repaired_marker, marker_changed = normalize_import_marker(source_path, marker)
        targets = dict(repaired_marker.get('targets') or {})
        for target_type in list(targets.keys()):
            if target_type not in IMPORT_TARGET_TYPES:
                continue
            if target_type not in fingerprint_indexes:
                fingerprint_indexes[target_type] = (
                    build_formal_level_fingerprint_index()
                    if target_type == 'online'
                    else build_target_level_fingerprint_index(target_type)
                )
            repaired_target, target_changed = repair_import_target_marker(
                source_path,
                target_type,
                targets[target_type],
                fingerprint_indexes[target_type],
            )
            if target_changed:
                targets[target_type] = repaired_target
                marker_changed = True
        repaired_marker['targets'] = targets

        if marker_changed:
            repaired_map[source_rel] = repaired_marker
            changed = True

    return repaired_map, changed


def build_import_target_marker(source_path, target_level_id, target_path, target_type, level_data=None):
    marker = {
        'targetLevelId': int(target_level_id),
        'targetPath': path_to_project_rel(target_path),
        'targetType': normalize_import_target_type(target_type),
        'importedAt': datetime.datetime.now().isoformat(timespec='seconds'),
    }
    if level_data is not None:
        marker['fingerprintVersion'] = LEVEL_FINGERPRINT_VERSION
        marker['contentFingerprint'] = build_level_content_fingerprint(level_data)
    return marker


def upsert_import_marker(import_map, source_path, target_type, target_marker):
    source_rel = path_to_project_rel(source_path)
    current, _ = normalize_import_marker(source_path, import_map.get(source_rel))
    targets = dict(current.get('targets') or {})
    targets[normalize_import_target_type(target_type)] = target_marker
    current['sourcePath'] = source_rel
    current['targets'] = targets
    current['updatedAt'] = datetime.datetime.now().isoformat(timespec='seconds')
    if 'importedAt' not in current:
        current['importedAt'] = target_marker.get('importedAt')
    import_map[source_rel] = current
    return current


def copy_level_to_game_target(source_level_dir, source_level_id, source_kind, target_type, target_level_id, overwrite=False):
    target_type = normalize_import_target_type(target_type)
    try:
        target_level_id = int(target_level_id)
    except Exception:
        raise ApiError(400, {'ok': False, 'error': 'targetLevelId must be an integer'})
    if target_level_id < 1:
        raise ApiError(400, {'ok': False, 'error': 'targetLevelId must be >= 1'})

    source_path = find_level_path(source_level_dir, source_level_id, source_kind)
    if not os.path.exists(source_path):
        raise ApiError(404, {
            'ok': False,
            'error': (
                f'source level {source_level_id} not found '
                f'in {path_to_project_rel(source_level_dir)}'
            ),
        })

    target_filename = build_game_level_filename(target_type, target_level_id)
    target_path = os.path.join(GAME_LEVEL_DATA_DIR, target_filename)
    if os.path.exists(target_path) and not overwrite:
        raise ApiError(409, {
            'ok': False,
            'error': 'target file exists',
            'targetPath': target_path,
            'targetFilename': target_filename,
            'targetLevelId': target_level_id,
            'targetType': target_type,
            'exists': True,
        })

    level_data = load_level_json(source_path)
    try:
        if target_type == 'online':
            level_data = normalize_online_level_payload(level_data, target_level_id)
        else:
            level_data['levelId'] = target_level_id
            level_data['isFeatured'] = True
            level_data['sourceLevelId'] = source_level_id
    except ValueError as exc:
        raise ApiError(400, {'ok': False, 'error': str(exc)})

    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(level_data, f, ensure_ascii=False, indent=4)
        f.write('\n')

    import_marker = None
    import_map_path = get_competitor_import_map_path(source_path)
    if import_map_path:
        import_map = read_import_map(import_map_path)
        target_marker = build_import_target_marker(
            source_path,
            target_level_id,
            target_path,
            target_type,
            level_data,
        )
        import_marker = upsert_import_marker(import_map, source_path, target_type, target_marker)
        write_import_map(import_map_path, import_map)

    return {
        'ok': True,
        'sourceLevelId': source_level_id,
        'sourcePath': path_to_project_rel(source_path),
        'targetPath': target_path,
        'targetFilename': target_filename,
        'targetLevelId': target_level_id,
        'targetType': target_type,
        'officialImport': import_marker,
    }


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


def build_level_filename_candidates(level_id, kind='main'):
    if normalize_level_kind(kind) == 'theme':
        return (f'zt_level_{level_id}.json',)
    return (
        f'level_{level_id}.json',
        f'lv_{level_id}.json',
        f'lv_{level_id:03d}.json',
        f'daily_{level_id}.json',
        f'daily_{level_id:03d}.json',
    )


def find_level_path(level_dir, level_id, kind='main'):
    level_id = int(level_id)
    kind = normalize_level_kind(kind)
    for filename in build_level_filename_candidates(level_id, kind):
        filepath = os.path.join(level_dir, filename)
        if os.path.exists(filepath):
            return filepath

    for name in os.listdir(level_dir):
        match = LEVEL_FILENAME_RE.match(name)
        if (
            match
            and level_filename_matches_kind(match.group(1), kind)
            and int(match.group(2)) == int(level_id)
        ):
            return os.path.join(level_dir, name)
    return build_level_path(level_dir, level_id)


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


def list_main_level_ids(level_dir, kind='main'):
    kind = normalize_level_kind(kind)
    level_ids = []
    for name in os.listdir(level_dir):
        match = LEVEL_FILENAME_RE.match(name)
        if not match:
            continue
        if not level_filename_matches_kind(match.group(1), kind):
            continue
        level_ids.append(int(match.group(2)))
    level_ids.sort()
    return level_ids


def list_level_entries(level_dir, kind='main'):
    kind = normalize_level_kind(kind)
    import_map_path = get_competitor_import_map_path(level_dir)
    import_map = read_import_map(import_map_path) if import_map_path else {}
    if import_map_path and import_map:
        import_map, import_map_changed = repair_import_map(import_map)
        if import_map_changed:
            write_import_map(import_map_path, import_map)
    entries = []
    for name in os.listdir(level_dir):
        match = LEVEL_FILENAME_RE.match(name)
        if not match:
            continue
        if not level_filename_matches_kind(match.group(1), kind):
            continue
        level_id = int(match.group(2))
        filepath = os.path.join(level_dir, name)
        source_path = path_to_project_rel(filepath)
        entry = {
            'levelId': level_id,
            'prefix': match.group(1),
            'filename': name,
            'path': source_path,
        }
        official_import = import_map.get(source_path)
        if isinstance(official_import, dict):
            entry['officialImport'] = official_import
        entries.append(entry)
    entries.sort(key=lambda item: (item['levelId'], item['filename']))
    return entries


def build_level_dir_label(rel_dir, kind='main'):
    game_rel = path_to_project_rel(GAME_LEVEL_DATA_DIR)
    if rel_dir == game_rel and normalize_level_kind(kind) == 'theme':
        return '主题关卡'
    if rel_dir == game_rel:
        return '正式关卡'
    parts = rel_dir.split('/')
    if len(parts) >= 5 and parts[0] == 'tools' and parts[1] == 'competitors':
        game_name = parts[2]
        if parts[-1] == 'main':
            return f'{game_name} 主线'
        if parts[-1] == 'daily':
            return f'{game_name} Daily'
    if rel_dir == path_to_project_rel(GAME_LEVEL_DATA_DIR):
        return '正式关卡'
    if rel_dir.endswith('/official20/main'):
        return '竞品主线'
    if rel_dir.endswith('/official20/daily'):
        return '竞品 Daily'
    name = rel_dir.rsplit('/', 1)[-1]
    parent = rel_dir.rsplit('/', 2)[-2] if '/' in rel_dir else ''
    return f'{parent}/{name}' if parent else name


def discover_level_dirs():
    scan_roots = (
        GAME_LEVEL_DATA_DIR,
        COMPETITOR_TOOLS_DIR,
    )
    dirs = []
    seen = set()
    game_rel = path_to_project_rel(GAME_LEVEL_DATA_DIR)

    for root in scan_roots:
        if not os.path.isdir(root):
            continue
        for current, child_dirs, files in os.walk(root):
            child_dirs[:] = [
                name for name in child_dirs
                if not name.startswith('.') and name not in ('__pycache__', 'node_modules')
            ]
            level_ids_by_kind = {'main': [], 'theme': []}
            for name in files:
                match = LEVEL_FILENAME_RE.match(name)
                if not match:
                    continue
                kind = 'theme' if match.group(1) == 'zt_level' else 'main'
                level_ids_by_kind[kind].append(int(match.group(2)))
            if not level_ids_by_kind['main'] and not level_ids_by_kind['theme']:
                continue
            rel_dir = path_to_project_rel(current)

            for kind, level_ids in level_ids_by_kind.items():
                if not level_ids:
                    continue
                seen_key = (rel_dir, kind)
                if seen_key in seen:
                    continue
                seen.add(seen_key)

                level_ids.sort()
                dirs.append({
                    'dir': rel_dir,
                    'kind': kind,
                    'label': build_level_dir_label(rel_dir, kind),
                    'count': len(level_ids),
                    'firstLevelId': level_ids[0] if level_ids else None,
                    'lastLevelId': level_ids[-1] if level_ids else None,
                    'isDefault': rel_dir == game_rel and kind == 'main',
                })

    dirs.sort(key=lambda item: (
        0 if item['isDefault'] else 1,
        0 if item['dir'] == game_rel and item.get('kind') == 'theme' else 1,
        0 if item['dir'].startswith('tools/competitors/') and item['dir'].endswith('/levels/main') else 1,
        0 if item['dir'].startswith('tools/competitors/') and item['dir'].endswith('/levels/daily') else 1,
        item['dir'],
    ))
    return dirs


def get_next_main_level_id(level_dir, kind='main'):
    existing = list_main_level_ids(level_dir, kind)
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
        if parsed.path == '/api/list-report-dates':
            try:
                dates = list_report_dates()
            except OSError as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
                return

            self._send_json(200, {
                'ok': True,
                'reportRoot': path_to_project_rel(DAILY_REPORT_DIR),
                'dates': dates,
                'latestDate': dates[-1] if dates else '',
            })
            return

        if parsed.path == '/api/list-level-dirs':
            self._send_json(200, {
                'ok': True,
                'defaultDir': path_to_project_rel(GAME_LEVEL_DATA_DIR),
                'dirs': discover_level_dirs(),
            })
            return

        if parsed.path == '/api/list-levels':
            query = urllib.parse.parse_qs(parsed.query)
            dir_value = query.get('dir', [''])[0]
            kind = normalize_level_kind(query.get('kind', ['main'])[0])
            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return
            try:
                level_ids = list_main_level_ids(level_dir, kind)
                levels = list_level_entries(level_dir, kind)
                next_level_id = get_next_main_level_id(level_dir, kind)
            except ValueError as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
                return

            self._send_json(200, {
                'ok': True,
                'dir': path_to_project_rel(level_dir),
                'kind': kind,
                'levelIds': level_ids,
                'levels': levels,
                'nextLevelId': next_level_id,
            })
            return

        if parsed.path == '/api/load-level':
            query = urllib.parse.parse_qs(parsed.query)
            dir_value = query.get('dir', [''])[0]
            kind = normalize_level_kind(query.get('kind', ['main'])[0])
            level_id_raw = query.get('levelId', [''])[0]
            try:
                level_id = int(level_id_raw)
            except Exception:
                self._send_json(400, {'ok': False, 'error': 'levelId must be an integer'})
                return

            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return

            filepath = find_level_path(level_dir, level_id, kind)
            if not os.path.exists(filepath):
                self._send_json(404, {
                    'ok': False,
                    'error': f'level {level_id} not found in {path_to_project_rel(level_dir)}',
                })
                return

            with open(filepath, 'r', encoding='utf-8') as f:
                level_data = json.load(f)
            level_data.setdefault('levelId', level_id)

            self._send_json(200, {
                'ok': True,
                'dir': path_to_project_rel(level_dir),
                'kind': kind,
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
                kind = normalize_level_kind(payload.get('kind'))
            else:
                data = payload
                dir_value = data.pop('dir', None)
                kind = normalize_level_kind(data.pop('kind', None))

            level_id = data.get('levelId', 1)
            level_dir = self._resolve_level_dir_or_send(dir_value)
            if level_dir is None:
                return
            filepath = find_level_path(level_dir, level_id, kind)

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
                f.write('\n')

            self._send_json(200, {'ok': True, 'path': filepath})
        elif parsed.path == '/api/save-level-file':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body)
            level_data = payload.get('levelData')
            path_value = payload.get('path')

            if not isinstance(level_data, dict):
                self._send_json(400, {'ok': False, 'error': 'levelData is required'})
                return

            try:
                filepath = resolve_project_file(path_value)
            except FileNotFoundError as exc:
                self._send_json(404, {'ok': False, 'error': str(exc)})
                return
            except ValueError as exc:
                self._send_json(400, {'ok': False, 'error': str(exc)})
                return

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(level_data, f, ensure_ascii=False, indent=4)
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
            kind = normalize_level_kind(data.get('kind'))
            level_dir = self._resolve_level_dir_or_send(data.get('dir'))
            if level_dir is None:
                return
            filepath = find_level_path(level_dir, level_id, kind)

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
            kind = normalize_level_kind(data.get('kind'))
            level_dir = self._resolve_level_dir_or_send(data.get('dir'))
            if level_dir is None:
                return
            filepath = find_level_path(level_dir, level_id, kind)

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
            source_kind = normalize_level_kind(data.get('sourceKind') or data.get('kind'))
            target_type = data.get('targetType')  # 'online' | 'theme'
            target_level_id = data.get('targetLevelId')
            overwrite = bool(data.get('overwrite', False))
            source_level_dir = self._resolve_level_dir_or_send(data.get('sourceDir') or data.get('dir'))
            if source_level_dir is None:
                return

            if source_level_id is None or target_level_id is None:
                self._send_json(400, {'ok': False, 'error': 'sourceLevelId and targetLevelId are required'})
                return

            try:
                result = copy_level_to_game_target(
                    source_level_dir,
                    source_level_id,
                    source_kind,
                    target_type,
                    target_level_id,
                    overwrite,
                )
            except ApiError as exc:
                self._send_json(exc.status_code, exc.payload)
                return
            except ValueError as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
                return

            self._send_json(200, result)
        elif parsed.path == '/api/batch-copy-levels':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            source_level_ids = data.get('sourceLevelIds')
            source_kind = normalize_level_kind(data.get('sourceKind') or data.get('kind'))
            target_type = normalize_import_target_type(data.get('targetType') or 'online')
            overwrite = bool(data.get('overwrite', False))
            source_level_dir = self._resolve_level_dir_or_send(data.get('sourceDir') or data.get('dir'))
            if source_level_dir is None:
                return

            if not isinstance(source_level_ids, list) or not source_level_ids:
                self._send_json(400, {'ok': False, 'error': 'sourceLevelIds must be a non-empty list'})
                return
            if target_type != 'online':
                self._send_json(400, {'ok': False, 'error': 'batch import currently supports online targets only'})
                return

            try:
                normalized_source_ids = [int(item) for item in source_level_ids]
                start_target_id = data.get('startTargetLevelId')
                if start_target_id in (None, '', 0):
                    start_target_id = get_next_main_level_id(GAME_LEVEL_DATA_DIR)
                else:
                    start_target_id = int(start_target_id)
            except Exception:
                self._send_json(400, {'ok': False, 'error': 'sourceLevelIds and startTargetLevelId must be integers'})
                return

            if start_target_id < 1:
                self._send_json(400, {'ok': False, 'error': 'startTargetLevelId must be >= 1'})
                return

            plan = []
            conflicts = []
            missing_sources = []
            for index, source_id in enumerate(normalized_source_ids):
                target_level_id = start_target_id + index
                source_path = find_level_path(source_level_dir, source_id, source_kind)
                if not os.path.exists(source_path):
                    missing_sources.append({
                        'sourceLevelId': source_id,
                        'sourcePath': path_to_project_rel(source_path),
                    })
                    continue
                target_filename = build_game_level_filename(target_type, target_level_id)
                target_path = os.path.join(GAME_LEVEL_DATA_DIR, target_filename)
                item = {
                    'sourceLevelId': source_id,
                    'sourcePath': path_to_project_rel(source_path),
                    'targetLevelId': target_level_id,
                    'targetPath': path_to_project_rel(target_path),
                    'targetFilename': target_filename,
                    'targetType': target_type,
                    'exists': os.path.exists(target_path),
                }
                plan.append(item)
                if item['exists']:
                    conflicts.append(item)

            if missing_sources:
                self._send_json(404, {
                    'ok': False,
                    'error': 'some source levels were not found',
                    'missingSources': missing_sources,
                })
                return

            if conflicts and not overwrite:
                self._send_json(409, {
                    'ok': False,
                    'error': 'target files exist',
                    'exists': True,
                    'batch': True,
                    'conflicts': conflicts,
                    'plan': plan,
                })
                return

            results = []
            try:
                for item in plan:
                    results.append(copy_level_to_game_target(
                        source_level_dir,
                        item['sourceLevelId'],
                        source_kind,
                        target_type,
                        item['targetLevelId'],
                        overwrite,
                    ))
            except ApiError as exc:
                self._send_json(exc.status_code, exc.payload)
                return
            except ValueError as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
                return

            self._send_json(200, {
                'ok': True,
                'targetType': target_type,
                'startTargetLevelId': start_target_id,
                'count': len(results),
                'results': results,
            })
        elif parsed.path == '/api/swap-formal-levels':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8-sig'))

            try:
                level_a_id = int(data.get('levelA'))
                level_b_id = int(data.get('levelB'))
            except Exception:
                self._send_json(400, {'ok': False, 'error': 'levelA and levelB must be integers'})
                return
            target_type = normalize_import_target_type(data.get('targetType') or data.get('kind') or 'online')

            if level_a_id < 1 or level_b_id < 1:
                self._send_json(400, {'ok': False, 'error': 'level ids must be >= 1'})
                return
            if level_a_id == level_b_id:
                self._send_json(400, {'ok': False, 'error': 'levelA and levelB must be different'})
                return

            path_a = os.path.join(GAME_LEVEL_DATA_DIR, build_game_level_filename(target_type, level_a_id))
            path_b = os.path.join(GAME_LEVEL_DATA_DIR, build_game_level_filename(target_type, level_b_id))
            missing = [
                path_to_project_rel(path)
                for path in (path_a, path_b)
                if not os.path.exists(path)
            ]
            if missing:
                self._send_json(404, {'ok': False, 'error': 'level file not found', 'missing': missing})
                return

            try:
                with open(path_a, 'r', encoding='utf-8-sig') as f:
                    payload_a = json.load(f)
                with open(path_b, 'r', encoding='utf-8-sig') as f:
                    payload_b = json.load(f)

                swapped_a = dict(payload_b)
                swapped_b = dict(payload_a)
                swapped_a['levelId'] = level_a_id
                swapped_b['levelId'] = level_b_id

                backup_dir = build_level_swap_backup_dir(level_a_id, level_b_id, target_type)
                os.makedirs(backup_dir, exist_ok=False)
                backup_a = os.path.join(backup_dir, os.path.basename(path_a))
                backup_b = os.path.join(backup_dir, os.path.basename(path_b))
                shutil.copy2(path_a, backup_a)
                shutil.copy2(path_b, backup_b)

                temp_a = os.path.join(backup_dir, f'.swap_{os.path.basename(path_a)}')
                temp_b = os.path.join(backup_dir, f'.swap_{os.path.basename(path_b)}')
                with open(temp_a, 'w', encoding='utf-8') as f:
                    json.dump(swapped_a, f, ensure_ascii=False, indent=4)
                    f.write('\n')
                with open(temp_b, 'w', encoding='utf-8') as f:
                    json.dump(swapped_b, f, ensure_ascii=False, indent=4)
                    f.write('\n')

                os.replace(temp_a, path_a)
                os.replace(temp_b, path_b)
            except Exception as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
                return

            self._send_json(200, {
                'ok': True,
                'targetType': target_type,
                'levelA': level_a_id,
                'levelB': level_b_id,
                'pathA': path_to_project_rel(path_a),
                'pathB': path_to_project_rel(path_b),
                'backupDir': path_to_project_rel(backup_dir),
            })
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        # Enable CORS for local dev
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        # Prevent browser caching for local preview tool files and JSON data.
        if self.path.endswith('.json') or self.path.endswith('.html'):
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
