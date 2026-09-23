# 当前章节奖励规则（2026-09-21 更新）

本节取代下方历史方案。
- 每章9关；第4关仅50金币。
- 第1/5/9/13章：豆豆皮肤2001/2002/2003/2004。
- 第2/6/10/14章：头像1009/1010/1011/1012。
- 第3/7/11/15章：头像框2006/2007/2008/2009。
- 第4/8/12/16章：背景皮肤1002/1003/1004/1006。
- 第17章起暂沿用100金币+清除1+磁铁1，等待补充装饰资源。
- 已选豆豆/背景改为章节解锁，其他装饰获取方式保留；已有资产不回收，不自动装备。
- 保留旧领取键v1，已经领取过的里程碑不重发、不追补差额；本地测试记录也保留。
- 浏览器选关测试资产独立存储，新增头像框/豆豆/背景拥有记录和皮肤选择存储隔离。
- 礼盒上方及奖励弹窗复用四类实际图标；金币气泡仅×50。

发布：重新构建客户端并部署整个 cloudfunctions/updateUserProfileAssets，包含 chapter-reward-policy.js、chapter-rewards.js、profile-customization.js、profile-catalog.json。无需部署 syncUserState。本次未部署。
规则生成：修改 ChapterRewardPolicy.ts 后运行 node scripts/sync-chapter-reward-policy.js。头像规则源修改后运行 node scripts/prepare-profile-assets.js --config-only。
验证：161组前后端进度一致；16章装饰发放/配置/图标；本地持久化与去重；头像/头像框客户端21项；并发金币；TypeScript通过。bean-skin-integration在既有构建脚本资源字符串断言处失败，尚未验收真机视觉。

---
以下为历史记录：

# 章节进度与奖励

## 2026-09-20 第一版实现

胜利页加入章节进度条与 4/9 两档宝箱，分享/下一关下移。条和宝箱来自已提取的旋转拼豆资源，导入为 gameAssets 内独立 PNG；奖励弹层使用现有黄色横幅光效、奖励图标和确定按钮，无奖励底板。

- 每章第 4 关：金币 25 + 清除 1。
- 第 1～4 章第 9 关：头像 1009 / 1010 / 1011 / 1012（通关条件 9 / 18 / 27 / 36）。已拥有头像不收回，不自动装备。
- 第 5 章起第 9 关：金币 100 + 清除 1 + 磁铁 1。
- 每章每档只发一次。已达标历史关卡在下一次普通主线结算时补齐；失败不清空章节进度。不把未到账奖励显示为已获得。
- 每关基础金币和分享奖励保持现有 25 / 额外 100，章节奖励独立发放。
- 通关结算启动发奖，不依赖 UI 动画或确定按钮。小游戏先同步通关进度，再调用 `updateUserProfileAssets` 的 `profileChapterClaim`，事务写入 `chapterRewardClaims` 与资产。使用现有累计奖励水位，防止延迟存档覆盖发奖。
- 浏览器使用持久化领取记录与现有资产写前日志，恢复中断时不重复增加资产。`?level=` 和工作台预览只显示章节进度，不发奖。
- 发奖失败在进度下方明确显示原因并可点击重试；下一次主线结算也会再次核对。当前不添加主页新奖励控件。

### 上线前置项
本次未发布云函数或修改线上数据库。真机启用前必须：
1. 更新 `updateUserProfileAssets` 云函数（包含新增 `chapter-rewards.js`）。
2. 头像 1009、1010、1011、1012 的通关条件 9、18、27、36 统一维护在 `config/profile-art-source/catalog.json`，运行 `node scripts/prepare-profile-assets.js --config-only` 同步客户端及云函数目录。本版已生成，不再读取数据库 `profile_config`。
3. 使用重新导入资源后的客户端验证 4、9、13、36、45 关及断网恢复。旧云函数或旧解锁配置会明确报错，不会模拟成功。

验证：101 组通关进度的前后端规则一致性、重复领取、后续章节奖励、头像拥有及不自动装备、浏览器写入中断恢复、资源引用和项目 assets TypeScript 检查通过。当前 Cocos 7456 预览仍提供旧脚本，新版实机/浏览器视觉效果尚未验收。

## 先前讨论记录

2026-09-17：用户要求先记录，后续再设计；本轮不实现。

讨论方向：主页和胜利界面共用章节进度与奖励记录。胜利界面显示刚完成关卡所属章节；普通通关播放进度增长，完成章节时自动发放奖励并展示。金币、道具、头像、头像框均可配置；不自动装备头像或头像框。

重点：连续跨章不能漏发；发放由通关结算触发，不依赖播放完动画、点击领取或返回主页。重复结算不得重复发奖；中途退出后核对未到账奖励。失败状态须明确，不能未成功就显示已获得。

主页用于查看当前章节进度、奖励预览与到账状态；自动发奖方向不再需要待领取数量和一键领取。用户可继续新增关卡，章节应按配置扩展。

待后续确认：最终交互、奖励表与经济数值、老玩家补发范围、存档/服务端幂等与同步方案。

### Reward UI revision (2026-09-20)
- Standalone editor-owned prefab: assets/GameAssetsBundle/UI/Prefabs/Panels/ChapterRewardPanel.prefab, instantiated under WinPanel/ChapterRewardMount. Confirmation only advances the display queue.
- Milestone previews use original white qp/jiao bubbles above gift boxes. Step4: coin25 + brush1; step9: matching avatar in chapters1–4, coin100 + brush1 + magnet1 thereafter. Claimed bubbles hide. Labels below boxes show completion thresholds only.
- Layout and art remain prefab-owned; dynamic rewards and visibility are rendered by ChapterRewardView.
- Automated checks passed; actual new UI rendering awaits Cocos reimport (preview server still returned older compiled code).

2026-09-21: Each reward now owns a 170px yellow glow behind its icon, rotating once per9seconds only while active. Original full-area glow removed. Three-slot spacing205px is prefab-owned and runtime uses the authored coordinates to center smaller reward sets. Title/count/detail/button spacing increased.
