# 关卡生成历史决策整理

## 1. 文档目的

这份文档不是代码级实现说明，而是根据历史对话，把“关卡生成”这条线里已经形成共识的目标、约束、阶段性结果和当前推荐做法整理出来。

它主要回答四件事：

1. 历史上关卡生成到底经历了哪些阶段
2. 后来为什么把重点从“继续写生成器”转到“维护总库生产链”
3. 600 关首发时，难度参考和上线同步是怎么定下来的
4. 现在如果继续扩关，应该沿哪条链路走

配套文档：

- `docs/LEVEL_GENERATION_LOGIC.md`
  - 偏当前实现和职责分层
- `docs/LAUNCH_LEVEL_GENERATION.md`
  - 偏 200/300/600 关选关与发布

一句话理解：

- 这份文档讲“历史决策和口径”
- 另外两份文档讲“当前脚本和流程”

## 2. 历史对话里逐步形成的共识

### 2.1 总库和运行时目录必须分开

后续所有操作都围绕这个前提展开：

- `guanka/`
  - 总关卡库
- `tools/guanka`
  - 指向 `../guanka` 的符号链接，方便工具访问
- `assets/Resources/LevelData/`
  - 运行时目录，只放真正上线顺序切片

也就是说：

- 先维护 `guanka/`
- 再从 `guanka/` 里挑关、排关、发布到 `assets/Resources/LevelData/`

这件事在历史对话里已经是明确口径，不再建议直接把新生成逻辑长期写死到运行时目录。

### 2.2 关卡微调的主目标，后来变成了“配色优先”

对话里对 `guanka/` 的微调要求，后来稳定成了这套口径：

- 改进配色
- 不要使用相近颜色
- 生成出来的图要更形象、更可爱
- 风格要更接近当地热门拼豆豆风格
- 形状变化尽量受控

其中形状约束分成两档：

1. 完整微调模式
   - 允许做少量轮廓圆润、补缺口、去毛刺
   - 单关形状改动控制在 `5%` 以内

2. 纯配色模式
   - `shape-budget-pct=0`
   - 只改颜色，不改形状

这也是后面为什么会同时保留“完整 refine”和“color-only refine”两种跑法。

### 2.3 600 关排关时，最小还原步数不能直接裸用

历史对话里，用户明确提出：

- 现在要设计 `600` 关
- 希望把“最小还原步数”做成一个难度参考系数

最终不是直接拿 `minStepCount` 排序，而是做了一层平滑系数：

`minStepRefCoeff = 0.72 * rawPct + 0.28 * densityPct`

其中：

- `rawPct`
  - `log1p(minStepCount)` 的全库百分位
- `densityPct`
  - `log1p(minStepCount / (filledCellCount / 100))` 的全库百分位

这么做的原因在历史对话里已经说清楚了：

- 不能让“大图因为体量大，最小步数天然更高”直接把难度判断带偏

### 2.4 首发 600 关的“线上”含义被明确拆开了

历史对话里，“同步到线上”最终拆成了两层：

1. 项目内线上目录
   - 把结果写入 `assets/Resources/LevelData/level_1.json ~ level_600.json`

2. 外部平台/后台发布
   - 这一步不在仓库内脚本范围里

也就是说，当前仓库里的“同步到线上”，指的是：

- 游戏运行时读取目录已经被发布映射覆盖
- `guanka/*.json` 里的 `online=true` 已和本次发布集合对齐

## 3. 历史对话里已经落地的结果

### 3.1 `guanka/` 全库做过一次完整微调

历史处理结果：

- 目标目录：`guanka/`
- 处理数量：`2471` 关
- 主目标：
  - 拉开配色
  - 避免近似色
  - 更可爱、更像拼豆豆风格
  - 形状变化压在 `5%` 内

结果报告：

- `tools/generated_levels/guanka_refine_report_20260428.json`
- `tools/generated_levels/guanka_refine_displacement_outliers_20260428.json`

当时确认过的结果口径：

- 平均形变：`1.8554%`
- 最大形变：`5.0%`
- 平均位移率差值：`-0.0036`

这一步的意义不是重新“生成”整库，而是把已有总库整体拉向统一的可爱拼豆风格。

### 3.2 `guanka/` 又做过一次“只改颜色”的全量微调

后面又明确跑过一轮纯配色修正：

- `shape-budget-pct=0`
- 只做颜色重映射
- 不改形状

结果报告：

- `tools/generated_levels/guanka_refine_color_only_20260428.json`

当时的统计口径：

- 处理数量：`2471`
- 平均形状变化：`0.0%`
- 平均配色变化：`0.1414%`
- 位移率差值：`0.0`

一个很重要的历史结论是：

- 这一轮真正发生颜色变化的关卡只有 `16` 关

这说明当时 `guanka/` 里的大部分关卡，在那套“保守纯配色微调”规则下已经接近目标状态。

### 3.3 600 关的最小步数参考系数已经建好

历史对话里这一步已经产出并确认：

- 全库系数表：
  - `tools/generated_levels/guanka_minstep_coefficients.json`
- 带系数的 600 关：
  - `tools/generated_levels/launch_600_selection_with_minstep.json`
- 600 关摘要：
  - `tools/generated_levels/launch_600_minstep_reference.json`
- 文档版摘要：
  - `tools/generated_levels/launch_600_minstep_reference.md`

当时给出的平滑后推荐系数窗如下：

- `1-12`: `11.63-23.7`
- `13-40`: `11.63-23.7`
- `41-100`: `11.63-24.98`
- `101-180`: `15.87-36.56`
- `181-280`: `20.45-45.39`
- `281-380`: `22.07-52.84`
- `381-480`: `47.21-66.52`
- `481-560`: `54.41-71.58`
- `561-600`: `65.64-75.27`

这组窗口在历史对话里被当成排 600 关时的难度节奏参考。

### 3.4 600 关已经同步到项目内线上目录

历史对话里已经完成过一次发布同步：

- `assets/Resources/LevelData/level_1.json ~ level_600.json`
  - 已按发布顺序重写

映射文件：

- `tools/generated_levels/launch_600_publish_mapping.json`

同时，对齐过这些状态：

- `guanka/*.json`
  - 正好 `600` 个 `online=true`
- `tools/generated_levels/launch_600_selection.json`
- `tools/generated_levels/launch_600_selection_with_minstep.json`
  - `selection` 集合同步为 `online=true`

历史结论是：

- 项目内运行时数据和总库在线标记已经对齐

## 4. 当前应当如何理解“关卡生成”

历史对话走到后面，已经把“关卡生成”这件事拆成了两层。

### 4.1 老含义：脚本直接画图并写关卡

这类脚本包括：

- `tools/generate-levels.js`
- `tools/generate-guanka.js`
- `tools/generate-guanka-v2.js`
- `tools/gen-v3.js`

它们的价值主要是：

- 看早期关卡是怎么造出来的
- 拆老模板和老绘制风格
- 给新关卡提供题材或结构参考

但它们已经不是当前主入口。

### 4.2 新含义：维护“总库生产链 + 上线链”

历史对话最后已经明确：

- 当前真正要维护的，不再是“继续写一个老式生成器”
- 而是“把总库生产链和上线链维护稳定”

也就是这条链：

1. 目标图来源
   - 外部模板导入
   - 历史脚本产物复用
   - 或新的批量生成入口

2. 初始乱序生成
   - 让 `initRandomColorArr` 满足目标难度和位移率

3. 配色/形状微调
   - 把风格统一到当前想要的拼豆豆视觉

4. 总库分析
   - 分类
   - 最小步数
   - 难度参考系数

5. 选关和排关
   - 200 / 300 / 600 关版本

6. 发布到运行时目录
   - `assets/Resources/LevelData/`

## 5. 当前推荐入口

历史对话最后已经进一步收敛出一个更新的方向：

- 不再继续往旧 JS 生成器里堆逻辑
- 优先沿当前 Python 主链路扩

### 5.1 新做一批原创关，优先走统一批量入口

当前建议优先使用：

- `tools/generate_level_batch.py`

它对应的是后期已经落下来的新方向：

- 统一规格输入
- 多候选目标图筛选
- 难度感知乱序
- 可选最小步数约束
- 最终批量落盘并产出报告

适合的场景：

- 想新做一批动物/卡通/拼豆风原创关
- 希望一开始就把难度和位移率控住
- 不想再维护多份临时定制脚本

### 5.2 初始乱序现在不该再只追求“位移率越高越好”

这也是历史对话后段新形成的一个关键口径。

现在更合理的做法是：

- 教学关、轻度关
  - 不需要天然追到极高位移率
- 中后段
  - 再把位移率和最小步数逐步抬高

也就是：

- 位移率只是难度的一部分
- 不能再把“最高位移率”直接当成唯一目标

### 5.3 配色微调仍然是总库维护的重要一环

即便新关是新生成的，后续仍然建议接上：

- `tools/refine_guanka_level.py`
- `tools/batch_refine_guanka_levels.py`

原因很直接：

- 新关生成时更容易解决结构和难度
- 总库统一风格，仍然往往要靠微调环节兜底

## 6. 当前推荐工作流

如果现在继续扩关，建议按这条顺序执行：

1. 先决定关卡来源
   - 外部模板导入
   - 历史生成器复用
   - 或 `tools/generate_level_batch.py` 新批量生成

2. 统一写入 `guanka/`
   - 不要把运行时目录当总库长期维护

3. 生成或重算 `initRandomColorArr`
   - 用 `tools/generate_initial_shuffle.py`
   - 按目标难度和位移率筛选

4. 批量微调总库
   - 以配色优先
   - 必要时允许少量轮廓修正
   - 形状变化预算受控

5. 做分类和难度分析
   - `tools/classify_guanka_levels.py`
   - `tools/calc_guanka_min_steps.py`
   - `tools/build_minstep_reference.py`

6. 生成 200/300/600 关首发版本
   - `tools/select_launch_levels.py`

7. 同步到运行时目录
   - `tools/publish_launch_selection_to_leveldata.py`

## 7. 与历史对话直接相关的主要脚本

### 7.1 总库微调

- `tools/refine_guanka_level.py`
- `tools/batch_refine_guanka_levels.py`
- `tools/guanka-refine.html`
- `tools/server.py`

### 7.2 乱序和目标图

- `tools/generate_initial_shuffle.py`
- `tools/move_target_to_initial.py`
- `tools/generate_cute_target.py`
- `tools/generate_level_batch.py`

### 7.3 难度和选关

- `tools/calc_guanka_min_steps.py`
- `tools/build_minstep_reference.py`
- `tools/classify_guanka_levels.py`
- `tools/select_launch_levels.py`
- `tools/publish_launch_selection_to_leveldata.py`

## 8. 一句话版结论

根据历史对话，当前“关卡生成”的真实含义已经不是：

- 再去维护一套新的老式单体生成器

而是：

- 围绕 `guanka/` 总库，持续维护“生成/导入 -> 乱序 -> 微调 -> 难度分析 -> 排关 -> 发布”这一整条生产链

其中已经确定下来的三条核心口径是：

1. 配色优先，避免相近色，整体更可爱、更像热门拼豆豆风格
2. 难度不要直接裸用最小步数，而要用平滑后的参考系数
3. 总库和运行时目录必须分离，发布只是最后一步
