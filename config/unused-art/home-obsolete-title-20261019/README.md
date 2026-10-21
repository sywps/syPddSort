# 首页旧标题备份（2026-10-19）

用户确认清理不再显示的主页标题。这里保存移出时的当前 PNG、Meta 和修改前 Home.scene，哈希见 manifest.json。备份位于 assets 之外，不进入正式 Bundle。

- 原图片：assets/HomeAssetsBundle/GameUI/主页标题.png，41,081 bytes，UUID f7446f73-3160-35a9-ff10-9a1c6940e181。
- 当前 Home.scene 的 TitleLayer 已关闭，未找到脚本/动画重新启用旧标题。仅将其子节点 TitleArt 的 SpriteFrame 引用清空，保留原节点索引、层级和布局。
- 原 PNG 和 Meta 已备份移出，Bundle 的源资源收集器不再收录它；构建输入没有额外硬编码标题白名单。生成包的资源表通过重新构建更新，不能直接删包内索引。
- 截图中的爱心框.png 和金币框 (2).png 仍被 TopHud.prefab 序列化引用，上一轮据此保留。后续追查确认：当前首页实际使用 home_hud_heart/home_hud_gold_frame；TopHudModule 虽保留加载/同步实现，但未找到当前外部调用入口，不能把 Prefab 引用等同于运行时正在显示。若继续清理，应连旧 Prefab 引用和相关依赖一起处理，不能只删图片。
- 构建和最终清单验证结果见 .planning/home_obsolete_title_hud_20261019/。
- 已重新构建微信 A 槽位 Release，构建/包内回归/回传/工位清理均成功（退出码 0）。独立扫描 build/wechatgame 和 staging：主页标题文件、UUID、依赖和原图哈希全部无命中，两个 HUD 框仍在包内。
- 新包包含此前已授权的图片压缩与 JPEG 大厅背景；未上传 CDN，未重建抖音包。既有 WinPanel HUD 状态测试在修改前已失败，本次未改动相关布局或业务逻辑。

恢复时请先确认原 PNG/Meta 路径未被新资源占用；恢复图片和 Meta 后，仅恢复旧 TitleArt 的 SpriteFrame 字段，不要用整份备份场景覆盖后续修改。
