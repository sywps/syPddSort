"""Call the project's existing initial-layout generator; no custom shuffle."""
import json
import sys
from pathlib import Path
from collections import Counter

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parents[1]
sys.path.insert(0, str(TOOLS))
from generate_initial_shuffle import choose_best_init, build_updated_payload

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

manifest = read(HERE.parent / 'retention-v2/manifest.json')
results = []
for old in manifest['levels']:
    level_id = old['id']
    level = read(HERE.parent / f'retention-v2/level_{level_id}.json')
    desired = {3: .83, 4: .855, 5: .88}[level_id]
    chosen = choose_best_init(level['correctColorArr'], base_seed=20260909 + level_id * 7919,
        attempts=32, min_groups_per_color=1, max_groups_per_color=3,
        target_displacement=desired, min_displacement=.8, max_displacement=.9,
        minstep_mode='off')
    updated = build_updated_payload(level, chosen['init_grid'], chosen['displacement_ratio'],
        chosen['seed'], chosen['group_count'])
    before = [c for row in level['correctColorArr'] for c in row]
    after = [c for row in updated['initRandomColorArr'] for c in row]
    assert Counter(before) == Counter(after)
    assert all((a == 0) == (b == 0) for a, b in zip(before, after))
    misplaced = sum(a != b for a, b in zip(before, after))
    rate = misplaced / sum(c > 0 for c in before)
    assert rate >= .8, 'Existing generator did not reach required 80%'
    item = {k: v for k, v in old.items() if k not in ['runs', 'passes', 'attempts', 'mode']}
    item.update(displaced=misplaced, activeColors=len({a for a, b in zip(after, before) if a != b}),
        reason=f'项目正式初始乱序工具生成；错位率{rate:.1%}，保持图案外形和颜色数量',
        seed=chosen['seed'], groups=chosen['group_count'], displacement=rate)
    results.append(item)
    write(f'level_{level_id}.json', updated)
    write(f'original_{level_id}.json', read(HERE.parent / f'retention-v2/original_{level_id}.json'))
    if level_id == 3:
        write('level_3_expanded.json', dict(updated, conveyorCapacity=84))
write('manifest.json', dict(algorithm='generate_initial_shuffle.choose_best_init -> move_target_to_initial.assign_initial_layout', levels=results))
print(json.dumps([dict(id=x['id'], ratio=x['displacement'], count=x['displaced']) for x in results]))
page = (HERE.parent / 'retention-v2/index.html').read_text(encoding='utf-8')
page = page.replace('retention-v2', 'retention-v3').replace('第二版', '第三版')
page = page.replace('从现有关卡预览选图，按识别、局部交换、颜色轮换递进。', '使用项目初始乱序脚本生成，三关错位率均超过80%。')
page = page.replace('../retention-v1/', '../retention-v2/')
page = page.replace('已生成独立试玩稿，正式关卡尚未替换。', '已替换正式第3—5关；旧图案保留用于对照。')
page = page.replace('主线引导免费+12后为84', '第三关沿用旧开局引导，免费+12后为84；4—5关剩余不超过12格时显示一次扩容气泡')
(HERE / 'index.html').write_text(page, encoding='utf-8')
