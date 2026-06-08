# 首发关卡生成逻辑

详细版请优先查看：[线上关卡选取与发布详解.md](/Users/shengyemac80-202504/claude/pindoudou/docs/%E7%BA%BF%E4%B8%8A%E5%85%B3%E5%8D%A1%E9%80%89%E5%8F%96%E4%B8%8E%E5%8F%91%E5%B8%83%E8%AF%A6%E8%A7%A3.md)

说明：

- 这份文档只覆盖“从 `guanka` 总库里挑选 200/300/600 关并发布”的后半段。
- 如果要看更完整的历史演进和当前主链路，请先看 `docs/LEVEL_GENERATION_LOGIC.md`。

## 1. 目标

这套逻辑用于从 `guanka` 总库里挑出一套适合首发上线的关卡顺序，并发布到线上读取目录 `assets/Resources/LevelData`。

目标分成两层：

1. 选关层：
   - 生成一套 200/300/600 关的首发顺序。
   - 优先使用 `isFeatured=true` 的精选关。
   - 前段更易理解，中后段逐步提压。
   - 节奏上更贴近当前抖音休闲小游戏的线性关卡设计：
     - 前段快速建立信心
     - 中段稳定留存
     - 固定位置放小高潮/休息关
     - 定期穿插强识别题材和内容关
   - 过滤掉只用一个颜色的关卡。
   - 前 `100` 关尽量避开颜色过近的关卡组合。

2. 发布层：
   - 按上线顺序把结果写入 `assets/Resources/LevelData/level_1.json ... level_300.json`。
   - 严格保持线上关卡格式。
   - 复制原始 `initRandomColorArr`，不重新生成上线乱序。
   - 如果选中的源关是单色关，发布时再兜底替换一次。

相关脚本：

- 选关脚本：[tools/select_launch_levels.py](/Users/shengyemac80-202504/claude/pindoudou/tools/select_launch_levels.py:1)
- 发布脚本：[tools/publish_launch_selection_to_leveldata.py](/Users/shengyemac80-202504/claude/pindoudou/tools/publish_launch_selection_to_leveldata.py:1)

## 2. 输入和输出

### 2.1 输入

选关阶段主要依赖两类数据：

1. 分类结果：
   - `tools/generated_levels/guanka_level_classification.json`
   - 里面提供每关的分类信息和评分，例如：
     - `category`
     - `generatedName`
     - `complexityScore`
     - `difficultyTier`
     - `filled`
     - `holes`
     - `secPerCell`

2. 原始关卡：
   - `guanka/level_xxx.json`
   - 用于补充真实关卡属性：
     - `isFeatured`
     - `online`
     - `correctColorArr`
     - `initRandomColorArr`

### 2.2 输出

选关输出：

- `tools/generated_levels/launch_600_selection.json`
- `tools/generated_levels/launch_600_selection.md`
- `tools/generated_levels/launch_300_selection.json`
- `tools/generated_levels/launch_300_selection.md`
- 200 关模式也有对应的 `launch_200_selection.*`

发布输出：

- `assets/Resources/LevelData/level_1.json ... level_300.json`
- `tools/generated_levels/launch_300_publish_mapping.json`

## 3. 配置结构

脚本支持三套 profile：

- `600` 关长线版
- `200` 关保守版
- `300` 关首发版

profile 配置定义在 `PROFILE_CONFIGS` 中，核心包含：

- 标题
- 默认输出路径
- 分段定义 `stages`
- 固定小高潮位置 `peaks`
- 固定休息关位置 `rests`
- 前段/中段/尾段的复杂度硬限制
- 超高压关开放区间与目标数量
- 精选关分段目标比例
- 精选/强识别题材的最大断档长度
- showcase 位置集合
- 前 `100` 关颜色辨识度阈值

600 关版本的分段如下：

| 分段 | 位置 | 目标 |
|---|---|---|
| 教学建立信心段 | 1-12 | 快速上手 |
| 轻提升段 | 13-40 | 轻微提压 |
| 稳定留存段 | 41-100 | 尽量保证颜色清晰与识别成本低 |
| 主体消耗段上半 | 101-180 | 主干内容区起量 |
| 主体消耗段下半 | 181-280 | 持续消耗 |
| 中高压段上半 | 281-380 | 进入稳定高压 |
| 中高压段下半 | 381-480 | 提高挑战密度 |
| 版本尾段 | 481-560 | 展示感增强 |
| 深度展示段 | 561-600 | 尾段秀强度 |

300 关版本的分段如下：

| 分段 | 位置 | 目标 |
|---|---|---|
| 教学建立信心段 | 1-10 | 快速上手 |
| 轻提升段 | 11-30 | 轻微提压 |
| 稳定留存段 | 31-80 | 保持消耗与新鲜感 |
| 主体消耗段 | 81-160 | 主干内容区 |
| 中高压段 | 161-240 | 明显提压 |
| 版本尾段 | 241-280 | 展示感增强 |
| 深度展示段 | 281-300 | 尾段秀强度 |

## 4. 选关流程

### 4.1 读库并补全元数据

`load_levels()` 会：

1. 读取分类文件里的 `levels`。
2. 回查每个 `guanka/level_xxx.json`。
3. 写回这些运行时属性：
   - `isFeatured`
   - `online`
   - `colors`
   - `colorIds`
   - `colorMinDistance`
   - `nearColorPairsSoft / Hard / Critical`

其中：

- `colors` 不是直接用分类结果，而是从源关卡的 `correctColorArr` 真实统计颜色种类数。
- `colorIds` 是源关卡实际使用到的颜色编号集合。
- `colorMinDistance` 是该关所有颜色对里最小的调色板距离，用来评估“颜色是否太接近”。

### 4.2 过滤单色关

如果 `colors <= 1`，选关阶段直接丢弃。

这样做的原因：

- 单色关几乎没有拼豆识别和颜色切换的游戏性。
- 会破坏上线节奏。
- 之前发布阶段已经加了兜底，但现在在选关源头就会先过滤一次。

### 4.3 为每个上线位置定义目标分数

`target_score(pos)` 会给每个上线位置算一个目标 `complexityScore`。

它的来源不是简单线性递增，而是叠了几层节奏信号：

1. 当前分段的 `min_score / max_score / center`
2. 段内进度插值
3. 一个 6 步循环微扰
4. `peaks` 位置提高目标分
5. 小高潮后两关略降
6. `rests` 位置略降

结果是：

- 整体难度向上走
- 但不会变成完全机械的直线升高

### 4.4 前 100 关颜色清晰度约束

脚本会基于固定调色板计算颜色距离，对前 `100` 关额外施加一层“颜色辨识成本”控制。

做法分两层：

1. 硬排除：
   - 前 `100` 关不允许最小色距低于 `COLOR_CLARITY_HARD_DISTANCE` 的关卡进入。
   - 前更早的一小段还会再排掉更极端的近色组合。

2. 软惩罚：
   - 即使没有被硬排除，只要 `colorMinDistance` 偏低，`candidate_weight()` 也会额外扣分。
   - 同时会统计近色对数量，近色对越多，前段惩罚越重。

这样能尽量把：

- 红 / 深红
- 蓝 / 钢蓝
- 亮绿 / 深绿

这类视觉上容易混淆的组合压到前 `100` 关之外，或者至少减少到极低数量。

### 4.5 给每个位置打角色标签

`tag_role()` 会给上线位打一个角色：

- `教学关`
- `休息关`
- `小高潮关`
- `内容关`
- `常规关`

这个角色只是一层描述，但会反向影响候选打分和最终节奏。

### 4.6 先算精选关目标

精选关不是固定死写数量，而是按当前库实时计算。

`resolve_featured_targets()` 的逻辑：

1. 从当前可用库中取出所有 `isFeatured=true` 的关卡。
2. 对每个分段计算：
   - 理论目标数：`分段槽位数 * featured_stage_ratios`
   - 实际可容纳能力：考虑 score 匹配范围、硬排除、少量跨段借位
3. 给每个精选关找一个最适合归属的分段。
4. 结合精选池总量和 `FEATURED_TARGET_BUFFER` 留出缓冲。
5. 产出每个分段的精选目标 `FEATURED_TARGETS`，以及全局 `FEATURED_TARGET_TOTAL`。

这一步的意义：

- 精选优先，但不能盲目把精选塞满前段
- 目标数量始终受真实精选池供给约束

### 4.7 硬排除

`hard_excluded(level, pos)` 负责一票否决：

- 前 30 关超过 `STRICT_EASY_MAX`
- 前 80 关超过 `STRICT_MID_MAX`
- 超高压关过早出现
- 前中段出现过高 `complexityScore`
- 前 50 关过硬
- 前 100 关存在明显近色组合

这一步解决的是“再高分也不能出现在这个位置”的问题。

### 4.8 候选打分

核心函数是 `candidate_weight()`。

它会综合这些因素：

1. 与该位置目标分数的距离
2. 当前分段是否过轻/过重
3. 颜色数、填充量、孔洞数、单位格耗时
4. 是否是精选关
5. 是否是强识别题材：
   - 动物/卡通动物
   - 动物/蝴蝶
   - 图标/简笔轮廓
   - 图案/普通拼豆图
6. 是否是纹样类题材
7. 是否位于 showcase 位置
8. 是否位于小高潮/休息关位置
9. 最近 10/20 关的类别多样性
10. 最近精选/特殊题材断档长度
11. 分类重复惩罚
12. 前 `100` 关颜色清晰度惩罚
13. 微量随机扰动

### 4.9 候选池构建

`pick_candidates()` 不是直接全库取最高分，而是分几步收缩：

1. 先应用 `hard_excluded`
2. 再按 `RELAX_STEPS` 逐步放宽分数区间
3. 对所有可用候选计算 `candidate_weight`
4. 额外处理这些强制场景：
   - 当前分段精选缺口较大
   - 精选断档过长
   - showcase 位需要精选或强识别题材
   - 超高压数量已经接近上限

最终每个位置通常只保留前 `12` 个左右候选，再从前 `6` 个里按权重随机抽样。

这意味着算法不是死板贪心，而是：

- 有明确偏好
- 但允许同等级候选产生变体

### 4.10 构建整条上线序列

`build_selection()` 会从 `1..SELECTION_COUNT` 顺序生成。

当前有一个强制位：

- `launchOrder=1` 固定使用 `levelId=1`

其余位置流程：

1. 从未使用关卡中挑候选
2. 根据精选缺口、showcase、题材断档决定是否强推某类候选
3. 在候选里按权重随机选出 1 关
4. 写入这些附加字段：
   - `launchOrder`
   - `sourceLevelId`
   - `stageName`
   - `stageLabel`
   - `targetScore`
   - `role`
   - `selectionReason`

其中 `sourceLevelId` 用来明确记录这关最初来自哪个 `guanka/level_xxx.json`，避免后续发布或替换后混淆“上线序号”和“原始关卡序号”。

### 4.11 多次尝试后选成本最低结果

`choose_best()` 会多次生成整条序列，默认用不同种子尝试多轮。

每一轮都调用 `evaluate()` 算综合成本，最后留下成本最低的一版。

## 5. 评价函数

`evaluate()` 的作用是给整条 200/300/600 关序列打总成本。

主要检查：

1. 每关与 `targetScore` 的偏差
2. `score > 92` 的关卡数量
3. `超高压` 的数量和位置
4. 前段是否过硬
5. 前 50 关颜色数是否过高
6. 精选总数是否低于目标
7. 是否连续 3 关同类
8. 任意 10 关内类别数是否少于 3
9. 任意 20 关内强识别题材是否少于 2
10. 前 `SPECIAL_WINDOW` 关内强识别题材是否过少
11. 每个分段的精选完成度
12. 前 `100` 关是否仍有近色软/硬告警

同时还会产出：

- `stageSummaries`
- `riskNotes`
- `violations`
- `earlyColorAvgMinDistance`
- `earlyColorSoftCount`
- `earlyColorHardCount`

所以最终结果除了能拿来上线，还能拿来人工复查。

## 6. 备选关生成

`build_alternates()` 会从未入选的关卡里再挑 30 个备选。

排序偏好：

1. 精选优先
2. 分数更接近可替补区间
3. 填充量较小的优先

备选会给出：

- `recommendedStage`
- `replacementUse`

它主要服务两个场景：

1. 人工替换当前首发序列
2. 发布时给单色关兜底替换

## 7. 发布流程

发布脚本：[tools/publish_launch_selection_to_leveldata.py](/Users/shengyemac80-202504/claude/pindoudou/tools/publish_launch_selection_to_leveldata.py:1)

### 7.1 目标

把 `launch_300_selection.json` 里的顺序，发布成线上真正读取的：

- `assets/Resources/LevelData/level_1.json`
- ...
- `assets/Resources/LevelData/level_300.json`

### 7.2 线上格式标准化

`normalize_online_level()` 只保留 7 个线上字段：

- `levelId`
- `boardWidth`
- `boardHeight`
- `timeLimit`
- `slotTotalCount`
- `correctColorArr`
- `initRandomColorArr`

其中：

- `levelId` 会改成上线顺序号 `1..300`
- `initRandomColorArr` 直接复制源关卡内容

不会把 `guanka` 的扩展字段带进线上目录。

### 7.3 发布阶段再次过滤单色关

虽然选关阶段已经过滤过单色关，但发布阶段还有第二层保险：

1. 读取源关卡 `correctColorArr`
2. 统计真实颜色数
3. 如果 `<=1` 色，则从 `alternates` 中找替代

`pick_replacement()` 的优先级：

1. `recommendedStage` 与当前分段一致
2. `complexityScore` 与目标分数接近
3. 精选关优先
4. 没被使用过

### 7.4 写出产物

发布脚本会生成：

1. 线上 `level_1..300.json`
2. 缺失时补 `level_xxx.json.meta`
3. `launch_300_publish_mapping.json`

映射表里会记录：

- `launchOrder`
- `sourceLevelId`
- `requestedSourceLevelId`
- `replacementReason`
- `targetPath`

## 8. 常用命令

### 8.1 生成 300 关候选

```bash
python3 tools/select_launch_levels.py --count 300 --tries 12
```

### 8.2 生成 600 关候选

```bash
python3 tools/select_launch_levels.py --count 600 --tries 8
```

### 8.3 生成 200 关候选

```bash
python3 tools/select_launch_levels.py --count 200 --tries 12
```

### 8.4 发布 300 关到线上目录

```bash
python3 tools/publish_launch_selection_to_leveldata.py
```

### 8.5 基础校验

```bash
python3 -m py_compile tools/select_launch_levels.py
python3 -m py_compile tools/publish_launch_selection_to_leveldata.py
```

## 9. 当前规则的关键设计取舍

### 9.1 为什么精选不是越多越好

因为精选池本身也有难度分布问题：

- 如果前段硬塞太多精选，容易把教学段做硬
- 如果把精选集中在尾段，又会让中段显得平

所以脚本用“分段目标 + 实时供给 + 缓冲”的方式控制精选占比。

### 9.2 为什么要保留随机性

如果每个位置都直接取最高分候选：

- 序列会很机械
- 容易过拟合到某几类题材
- 很难通过多轮尝试找到更低整体成本的组合

所以当前做法是：

- 先把候选范围收窄
- 再在高质量候选中做加权随机
- 最后全局多次尝试取最优

### 9.3 为什么发布时还要再做一次单色过滤

这是为了防止：

- 旧结果文件残留
- 手工替换后混入单色关
- 上游分类结果和源关卡不一致

也就是选关时做一次，发布时再兜底一次。

## 10. 后续维护建议

如果后面继续调这套逻辑，优先从这些地方下手：

1. `PROFILE_CONFIGS`
   - 调分段难度区间
   - 调 showcase / peak / rest 位置
   - 调精选比例

2. `candidate_weight()`
   - 调前段识别成本
   - 调精选奖励
   - 调题材疲劳惩罚

3. `evaluate()`
   - 把人工最在意的坏模式变成成本项
   - 例如某类题材连用、尾段过硬、前段过花等

4. `pick_replacement()`
   - 如果发布阶段替补效果不稳定，可以提高 stage/score 匹配权重

如果要继续做更细的版本，建议下一步把“为什么某关被判为精选/内容/休息/小高潮”的可解释信息进一步结构化输出到 JSON，而不是只保留一段 `selectionReason` 文本。
