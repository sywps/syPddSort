# 非豆子图片压缩前备份（2026-10-19）

按用户确认，压缩 26 张 PNG 并将拼图大厅蓝色波纹背景转换为 JPEG。原图、原 Meta 及三个受格式变更影响的测试文件，均保存在 original-active 下；manifest.json 记录逐张前后哈希、体积、档位和验证结果。备份位于 assets 之外，不属于正式 Bundle。

- 不修改豆子图集，不修改任何图片尺寸、UUID、场景或 Prefab。
- 个人资料面板、通用弹窗底图、抖音第一步引导、通用蓝色次按钮采用 q80 减色，其余 22 张 PNG 采用 q100 减色；quality=100 也不是无损。
- 原 app_transition_loading_background.png 改为 app_transition_loading_background.jpg（JPEG q90），Meta 同名迁移，只将原生扩展名换为 .jpg、hasAlpha 改为 false；UUID、Texture/SpriteFrame 数据与大厅引用保留。
- 通用弹窗底图减色后 alpha=1 的调色板项恢复为 alpha=0，确保原透明留白继续完全透明；不改 RGB、IDAT 和文件长度。
- 27 张源文件总计 3,767,506 → 1,005,540 bytes，减少 2,761,966 bytes（约 2.63 MiB）。这是源文件收益，未重建微信或抖音包，未上传 CDN。
- 已通过全部目标独立解码、尺寸/透明留白检查、UUID/Meta/Bundle 收集器、大厅绑定、豆子/场景/Prefab/其他资源不变检查。验证报告在 .planning/image_remaining_audit_20261019/applied/。
- 有三个与本次图片替换无关的现有契约失败：旧 Profile 尺寸、Home 路由预期、排行榜标题纵坐标。没有改动这些布局或业务行为来让测试通过。

如需恢复，请先核对当前目标 SHA256 与 manifest.json 中的 after_sha256 一致，保留后续修改。JPEG 背景恢复时需成对恢复旧 PNG 与 Meta，并移出对应 JPG 与 Meta，避免 UUID 重复。测试文件备份也可能包含任务前已有改动，不要覆盖后续工作。
