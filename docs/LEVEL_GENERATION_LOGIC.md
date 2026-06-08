# 关卡生成逻辑总览

## 1. 这份文档解决什么问题

仓库里和“关卡生成”相关的脚本已经经历了几轮演进，现在同时存在：

- 早期直接写 `assets/Resources/LevelData` 的脚本
- 中期直接批量造 `guanka` 总库的脚本
- 后期从外部模板/旧包导入 `guanka` 的脚本
- 当前用于乱序、微调、分类、选关、发布的主链路

如果只看某一个脚本，很容易误判它是不是“当前主入口”。这份文档的目标就是把这些逻辑按时间和职责整理成一张图。

说明：

- `docs/PROJECT.md` 和 `docs/CONVERSATION_HISTORY.md` 更像历史记录，里面有不少阶段性信息，不能直接当成当前流程说明。
- 如果要看“历史对话里已经形成的口径、阶段性结果和上线决策”，看 `docs/LEVEL_GENERATION_HISTORY.md`。
- `docs/LAUNCH_LEVEL_GENERATION.md` 只覆盖“从 `guanka` 里选 200/300/600 关并发布”的后半段。
- 当前更完整的说明，以本文为准。

## 2. 目录角色

三套目录要先分清：

1. `guanka/`
   - 这是总关卡库。
   - 所有分析、微调、分类、最小步数、600 关选关，基本都以这里为源。

2. `tools/guanka`
   - 这是指向 `../guanka` 的符号链接。
   - 主要是为了让 `tools/guanka-refine.html`、本地预览工具和 `tools/server.py` 访问起来更方便。
   - 实际数据源还是根目录 `guanka/`。

3. `assets/Resources/LevelData/`
   - 这是运行时目录，游戏真正加载的是这里。
   - 这里不是总库，而是“上线版切片”。
   - 例如 600 关上线时，会把挑出来的 600 关按 `level_1.json ~ level_600.json` 顺序发布到这里。

一句话总结：

- `guanka/` 是总库
- `tools/guanka` 是工具访问入口
- `assets/Resources/LevelData/` 是线上运行目录

## 3. 逻辑演进

### 3.1 第一阶段：直接生成运行时关卡

相关脚本：

- `tools/generate-levels.js`

特点：

- 这是最早的一代批量生成逻辑。
- 目标不是维护总库，而是直接补 `assets/Resources/LevelData/`。
- 主要用于早期 `level_11 ~ level_99` 的几何图案关卡。

核心思路：

1. `generatePattern(levelId, boardSize, rng)`
   - 按几何图案模板生成 `correctColorArr`
   - 图案类型偏几何：圆、心、星、十字、箭头、月亮等

2. `shuffleGrid(grid, rng)`
   - 把目标图打乱为 `initRandomColorArr`
   - 核心目标是保证高位移率，同时保留形状空洞

3. 直接写入：
   - `assets/Resources/LevelData/level_N.json`

这一代的问题：

- 直接写运行时目录，不利于后面做总库管理
- 更像“补缺口工具”，不是长期维护总库的方案
- 图案来源比较固定，题材扩展能力弱

当前状态：

- 历史脚本
- 可以看思路，不建议再作为主入口使用

### 3.2 第二阶段：把关卡生成迁到 `guanka` 总库

相关脚本：

- `tools/generate-guanka.js`

特点：

- 这是第一代明确面向 `guanka` 总库的脚本。
- 顶部有固定的 `LEVEL_DATA`，每关写死：
  - `levelId`
  - `size`
  - `colorCount`
  - `theme`
  - `timeLimit`
  - `difficulty`
  - `isBoss`

核心思路：

1. `generatePattern(level, rng)`
   - 根据主题和若干绘制函数直接生成目标图
   - 这代更偏“中国风暖色拼豆图”

2. `shufflePattern(correct, difficulty, levelId)`
   - 用 `difficulty` 推导乱序强度
   - 本质还是“打乱颜色 + 打乱非空位置”
   - 会保留填充计数，但不追求现在这套更精细的“聚簇初始局”

3. `generate()`
   - 批量写出关卡 JSON

需要注意的一点：

- 这个脚本的输出目录是 `path.join(__dirname, 'guanka')`
- 因为 `__dirname` 是 `tools/`，所以它实际写的是 `tools/guanka`
- 而 `tools/guanka` 现在是 `guanka/` 的符号链接，这层历史差异很容易看混

这一代的问题：

- 规格全写死在脚本里，扩展成本高
- 图案仍以程序绘制为主，题材表达力有限
- 乱序逻辑相对粗

当前状态：

- 历史脚本
- 可以理解成“从运行时直生，进化到了先造总库”

### 3.3 第三阶段：模板 + 程序生成混合

相关脚本：

- `tools/generate-guanka-v2.js`

特点：

- 这是对 `generate-guanka.js` 的一次明显升级。
- 它把前 50 关做成了更明确的模板系统，后面的关卡再用程序生成补。

核心结构：

1. `TEMPLATES`
   - 前 50 关是字符模板
   - 每个模板用字母表示颜色区域，用 `.` 表示空白

2. `parseAndGenerateFromTemplate(...)`
   - 把字符模板转成 `correctColorArr`

3. `generateProceduralPattern(...)`
   - 51 关之后走程序生成
   - 使用椭圆、矩形、线段、多边形、局部细节块等组合造型

4. `shufflePattern(...)`
   - 仍然是简单乱序
   - 主要保证颜色数量和非空位置数量匹配

5. `generateSpecs()`
   - 把后续关卡的规格表组出来

这一代的价值：

- 比 v1 更能控制“前几十关长什么样”
- 让关卡从纯几何向“题材化拼豆图”迈了一步

这一代的问题：

- 模板和程序生成还割裂
- 还是偏脚本内内置资源，不适合持续扩库
- 乱序策略仍然落后于后期 `move_target_to_initial.py`

当前状态：

- 历史脚本
- 仍然是理解 `guanka` 早期结构的重要参考

### 3.4 第四阶段：v3 极简实验版

相关脚本：

- `tools/gen-v3.js`

特点：

- 这是一次“简化生成器”的实验。
- 它保留了 v2 的前 50 关模板，但把后续图形生成收缩成更少的基本图元。

核心思路：

1. `generateLevel(...)`
   - 只用椭圆、矩形、描边、少量细节色块组合

2. 通过正则 + `eval` 直接复用 `generate-guanka-v2.js` 的 `TEMPLATES`

3. 前 50 关仍优先走模板，其余走极简程序生成

这一代的问题：

- 更像“试验分支”
- 没有形成后续主链路
- 通过 `eval` 读模板，维护性一般

当前状态：

- 实验/历史脚本
- 不建议继续往这条线上加逻辑

## 4. 从“自己画”转向“导入外部图”

到了后面，主思路已经不再是“完全靠脚本造题材”，而是从外部资产导入，再统一转换成 `guanka`。

### 4.1 导入 hacked-level 旧包

相关脚本：

- `tools/convert-hacked-level-1.py`

作用：

- 读取 `hacked-level-1/*.json`
- 从旧的 MonoBehaviour 数据结构里提取 `_layout`
- 生成新的 `correctColorArr`
- 颜色重映射到当前项目统一的 `1..N`
- 写入 `guanka/level_xxx.json`
- 然后调用 `tools/generate_initial_shuffle.py` 生成 `initRandomColorArr`

这说明从这一阶段开始，“目标图生成”和“初始乱序生成”已经拆成两步了。

### 4.2 导入 MakeBead 模板

相关脚本：

- `tools/import_makebead_templates.py`

作用：

- 读取下载好的拼豆模板 bundle 和 PNG
- 把图片颜色量化到项目 20 色调色板
- 推断主题类别、命名、颜色偏好
- 生成 `correctColorArr`
- 用 `assign_initial_layout(...)` 反推聚簇型 `initRandomColorArr`
- 写入 `guanka/`

这条线的重要变化：

- 关卡来源从“脚本自己画”转成“外部模板导入”
- 关卡质量更依赖图案源质量和调色，而不是几何脚本本身

## 5. 当前主链路：目标图、乱序、微调、评分、发布分层

现在真正应该继续维护的，是下面这条链路。

### 5.1 目标图来源

可以来自三类入口：

1. 历史生成器产物
   - `generate-guanka*.js`
   - `gen-v3.js`

2. 外部导入
   - `convert-hacked-level-1.py`
   - `import_makebead_templates.py`

3. 手工/局部生成
   - 直接编辑 `guanka/level_xxx.json`
   - 或通过一些定制小脚本生成目标图

无论来源如何，最终统一落到：

- `guanka/level_xxx.json`

且至少包含：

- `levelId`
- `boardWidth`
- `boardHeight`
- `timeLimit`
- `slotTotalCount`
- `correctColorArr`

### 5.2 初始乱序生成

相关脚本：

- `tools/move_target_to_initial.py`
- `tools/generate_initial_shuffle.py`

这里是当前链路里非常关键的一层。

和早期简单洗牌不同，现在的目标是：

- 保证足够高的位移率
- 同时让初始局看起来更像真实可玩的“聚簇乱序”

核心思路：

1. `move_target_to_initial.py`
   - 把最终目标图中的颜色拆成若干 grow group
   - 为每种颜色选 seed
   - 按 quota 把颜色块长成若干初始团块
   - 这样生成的初始局不是均匀散点，而是更接近真实局面

2. `generate_initial_shuffle.py`
   - 对同一个目标图做多次尝试
   - 选位移率更好的那一版
   - 把 `filledCellCount`、`colorStats`、`displacementRatio`、`initShuffleSeed` 一并写回

这是当前推荐的乱序主逻辑。

### 5.3 配色和形状微调

相关脚本/工具：

- `tools/refine_guanka_level.py`
- `tools/batch_refine_guanka_levels.py`
- `tools/guanka-refine.html`
- `tools/server.py`

这一层是后期才补上的：

- 目标不是“从 0 生成关卡”
- 而是在已有 `guanka` 上做质量修正

当前微调逻辑重点：

1. 优先改配色
   - 拉开近似色
   - 提高轮廓/主体/点缀的色彩分工

2. 允许少量形状修边
   - 去毛刺
   - 补缺口
   - 形状漂移控制在预算内

3. 重建 `initRandomColorArr`
   - 保持候选关卡的乱序压力接近原关

如果现在说“继续做关卡生成质量”，大部分时候应该先想到的是这一层，而不是回头改 v1/v2/v3 生成器。

### 5.4 分类和评分

相关脚本：

- `tools/classify_guanka_levels.py`

作用：

- 扫描整个 `guanka`
- 产出结构化分类结果
- 计算 `complexityScore`、`difficultyTier`、题材分类、图案名、填充率、孔洞、对称性等指标

它是后续“600 关排关”的基础输入之一。

### 5.5 最小还原步数

相关脚本：

- `tools/calc_guanka_min_steps.py`
- `tools/build_minstep_reference.py`

职责分两层：

1. `calc_guanka_min_steps.py`
   - 给 `guanka` 每一关写回 `minStepCount`
   - 这是“玩法还原成本”的原始值

2. `build_minstep_reference.py`
   - 不直接拿原始 `minStepCount` 排 600 关
   - 会结合：
     - 原始步数百分位
     - 单位体量步数百分位
   - 生成 `minStepRefCoeff`
   - 这是现在更适合拿来做 600 关设计参考的系数

### 5.6 首发 200/300/600 关挑选

相关脚本：

- `tools/select_launch_levels.py`

作用：

- 从 `guanka` 总库里选出一套上线序列
- 关注：
  - `complexityScore`
  - `difficultyTier`
  - 颜色清晰度
  - 精选关比例
  - 题材节奏
  - 超高压数量

它的输入主要来自：

- `guanka/*.json`
- `tools/generated_levels/guanka_level_classification.json`

扩展后的 600 关参考还包括：

- `tools/generated_levels/launch_600_selection_with_minstep.json`
- `tools/generated_levels/launch_600_minstep_reference.json`

### 5.7 发布到运行时目录

相关脚本：

- `tools/publish_launch_selection_to_leveldata.py`

作用：

- 把 `launch_600_selection.json` 这类结果，顺序发布到：
  - `assets/Resources/LevelData/level_1.json ~ level_600.json`

它做的是“总库 -> 线上序号”的转换，不负责重新生成关卡本体。

## 6. 当前推荐工作流

如果现在要继续做关卡生产，建议按这个顺序理解和操作：

1. 先确定目标图来源
   - 导入外部模板
   - 或从已有历史生成器中拿基底
   - 如果是新做一批原创动物/拼豆关，优先走 `tools/generate_level_batch.py`
   - 产物统一进入 `guanka/`

2. 为目标图生成初始乱序
   - 用 `tools/generate_initial_shuffle.py`
   - 现在可以按难度预设或目标位移率筛选，不必再默认追求最高位移率

3. 做配色/局部形状微调
   - 单关：`tools/refine_guanka_level.py`
   - 批量：`tools/batch_refine_guanka_levels.py`
   - 可视化：`tools/guanka-refine.html`

4. 做总库分析
   - `tools/classify_guanka_levels.py`
   - `tools/calc_guanka_min_steps.py`
   - `tools/build_minstep_reference.py`

5. 排 200/300/600 关上线序列
   - `tools/select_launch_levels.py`

6. 发布到线上读取目录
   - `tools/publish_launch_selection_to_leveldata.py`

## 7. 哪些脚本现在应该继续用

### 推荐继续维护

- `tools/generate_initial_shuffle.py`
- `tools/generate_level_batch.py`
- `tools/move_target_to_initial.py`
- `tools/refine_guanka_level.py`
- `tools/batch_refine_guanka_levels.py`
- `tools/classify_guanka_levels.py`
- `tools/calc_guanka_min_steps.py`
- `tools/build_minstep_reference.py`
- `tools/select_launch_levels.py`
- `tools/publish_launch_selection_to_leveldata.py`
- `tools/import_makebead_templates.py`
- `tools/convert-hacked-level-1.py`

### 主要作为历史参考

- `tools/generate-levels.js`
- `tools/generate-guanka.js`
- `tools/generate-guanka-v2.js`
- `tools/gen-v3.js`

这些脚本现在仍然有价值，但价值主要是：

- 看老关卡最初是怎么造出来的
- 拆老参数和老生成风格
- 复用个别模板或主题数据

而不是继续把它们当成当前主入口。

## 8. 一句话版结论

“之前关卡生成的逻辑”可以概括成三代：

1. 早期：脚本直接写运行时关卡
2. 中期：脚本先批量造 `guanka` 总库
3. 现在：`guanka` 作为总库，重点转向导入、乱序、微调、分类、最小步数、选关和发布

也就是说，当前真正要维护的已经不是“如何再写一个新生成器”，而是“如何把总库生产链和上线链保持稳定”。
