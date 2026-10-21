# 首页旧预览框备份

2026-10-19，按用户确认将 home_preview_frame.png 与对应 Meta 移出正式 HomeAssetsBundle。

- 备份位于 original-active/assets/HomeAssetsBundle/GameUI/，保存移出前的当前工作区版本：PNG 53,849 bytes（52.6 KiB）和 Meta 3,143 bytes。
- PNG UUID：2847651e-86a6-4f51-8b17-2595b2432ca8，Meta/图片 SHA256 见 manifest.json。
- 该目录位于 assets 之外，不属于 Cocos Bundle。请勿将备份放回 assets 中作为普通子目录，否则可能再次进入构建。
- 当前源码未发现用途；首页预览已走当前章节/图案预览渲染链。图片与 Meta 一同移出，未改首页布局或脚本。
- 如需恢复，先确认正式原路径仍不存在，再恢复这两个文件；不要覆盖后续新资源。
- 本次包体验证记录位于 .planning/home_preview_frame_remove_20261019/。
- 已重新构建微信 A 槽位 Release，并独立扫描 build/wechatgame 与 build/wechatgame-staging：均无该图片文件、UUID、资源条目或依赖引用；备份哈希一致。
- 构建、包内回归和产物回传完成后，临时工位清理遇到 EPERM，命令最终退出码为 1；复核确认不影响上述产物排除结果。未上传 CDN，未重建抖音包。
