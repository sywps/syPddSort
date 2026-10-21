# 旧公共 HUD 退役备份（2026-10-19）

按用户确认，清理没有当前调用入口的旧公共 HUD。original-active 保存移出前的当前文件，包含已有未提交修改；逐文件哈希与原打包文件证据见 manifest.json。

已成对移出正式 assets：

- HomeAssetsBundle/GameUI/爱心框.png 与 Meta。
- HomeAssetsBundle/GameUI/金币框 (2).png 与 Meta。
- GameAssetsBundle/UI/Prefabs/Panels/TopHud.prefab 与 Meta。
- Scripts/Core/GameCtrlModules/TopHudModule.ts 与 Meta。

已从 installGameCtrlModules.ts 移除旧模块 import/install 两行；适配四个受影响测试，使当前首页设置绑定、预热禁用旧加载器、结算金币独立资源及测试桩不再依赖旧套件。没有改动当前首页、游戏或结算场景/Prefab/图片；当前首页使用 home_hud_heart/home_hud_gold_frame，结算继续使用独立 settlement_gold_banner。

此目录在 assets 之外，不属于 Cocos Bundle。package 资源表由 fresh Release 构建重新生成，未手工删除生成包索引。最终结果见 .planning/legacy_top_hud_retire_20261019/final-audit.json；未上传 CDN，未提交/推送。

微信 A 槽位 Release 已完成，退出码 0，临时工位清理成功。独立核查正式产物和 staging：旧 Prefab、旧模块、两张图片的全量/压缩 UUID、路径、加载方法及依赖均无命中；当前首页两张 home_hud_* 和结算独立金币图仍在包内。两份产物逐字节一致，各 1678 文件 / 24,817,724 bytes，比上一份标题清理后的展开目录减少 152,256 bytes；这不是上传压缩包统计。

构建期间工作区另有头像相关脚本的并行改动，全部保留并单独记录于 external-source-drift.json。本次产物验证隔离构建开始时的清理快照，不保证包含这些后续头像修改；未重新构建抖音，未做真机交互验收。

改动前后完整测试结果保存在 baseline-tests.json / after-tests.json：存在六项既有失败，失败原因相同，没有为本任务修复无关逻辑。任务针对性的源文件/引用/collector/当前 UI 哈希和最终包核对单独记录，不把这些检查当作完整测试或真机验收。

若恢复，请先检查当前文件与 manifest 中的退役/改动状态，避免覆盖后续工作。原图/Meta、Prefab/Meta、模块/Meta 应成对恢复，并显式恢复模块注册；不要用备份覆盖整个活动场景或其他后来修改。
