# 第一关 A / B / C 试玩

- A：当前正式第一关，沿用 `assets/BootstrapBundle/LevelData/level_1.json`，不复制、不更改原版数据。
- B：拼豆天才第一关，`assets/BootstrapBundle/LevelData/B.json`。
- C：这不是挑战第一关，`assets/BootstrapBundle/LevelData/C.json`。

三者逻辑关卡号均为 1，下一关仍为正式第 2 关。浏览器未指定时使用 A；微信正式实验已完成本地接入，待部署发布，详见 [实验接入说明](first-level-experiment.md)。

## 试玩

Cocos 预览启动后，在预览 URL 添加 `?level=1=A`、`?level=1=B` 或 `?level=1=C`。已有其他参数时使用 `&`。更换版本后重新加载页面。原来的 `?level=1&firstLevelContent=B` 写法仍兼容。

微信开发者工具的启动参数同样支持 `level=1=B` / `level=1=C`。使用重新编译的包；本次没有重新构建微信包。选择结果在当前运行会话固定，保证首关预加载与正式进入使用同一份内容。非法内容值明确报错。

## 引导与资源

B/C 的原始目标图案保持不变。B 将红蓝两色全部互换，24 个有效格子的错位率为 100%，两色各 12 个；C 保留来源初始布局。时间、传送带容量、槽位数、自动结算加速与胜利广告奖励设置沿用正式 A。B 引导为蓝色→红色，C 为粉色→蓝色；A/B/C 引导文案均不包含“发光的”。

引导配置随对应关卡 JSON 保存：`tutorialGuide.openingColors` 指定两步颜色，`guideCopies` 指定对应文案。复用现有手指、发光圈和输入限制，手指按实际棋盘节点定位；无需新增美术。缺失可操作颜色或文案时停止入场并明确报错。A 未配置该字段，保留原有引导行为。

B/C 位于 BootstrapBundle，发布资源收集会包含它们；微信构建末端额外检查 `LevelData/B` 和 `LevelData/C`，缺失时构建失败。废弃的 gameAssets 提取脚本不在当前构建调用链中，未修改。

验证：`node tests/first-level-abc.test.js` 覆盖来源布局、实际本地加载、浏览器/微信参数、会话固定、共用豆子图集、引导文案及两步操作后的回填通关。实际画面与微信包大小须在 Cocos 预览/构建后验证。
