# DBT 风格 300 关筛选结果

- 来源：`assets/LevelData`（1643 关）
- 参考：`tools/dbt/dbt_level_analysis.json`（182 关）
- 结果：300 关，观看/关卡编号连续为 1–300
- 原始编号：保留在 `selection_manifest.json` 的 `sourceId` / `sourceFile` 字段中
- 去重：300 个源 ID，300 个布局图案哈希
- 选择标准：参考 `tools/dbt/dbt-level-design-report.html`，按八类关卡、四档压力和锯齿式节奏，把 182 关比例扩展为 300 个目标位。
- 匹配指标：体量、颜色数、密度、乱序、碎片度、时间压力和尺寸；禁止重复标准化配色图案。
- 明细：见 `selection_manifest.json`，包含新编号、源编号、DBT 参考关、类型、压力档、距离、指标及源/输出 SHA-256。
- 新乱序：`ControlledShuffle.learned-clustered-v1`，从 182 个 DBT 参考关按颜色数学习聚簇轮廓，再以固定种子生成。
- 乱序报告：见 `shuffle_report.json`，包含 300 关应用前后指标与每关种子；整体错位率 92.95%，轮廓保留率 100%。

除 `levelId` 按观看顺序改为 1–300、`initRandomColorArr` 使用新算法重建外，其余关卡内容字段沿用选中的源关卡。
