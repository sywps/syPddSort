# 抖音合作与 PVP 接入

本轮不导入微信玩家或回放。仍使用已有 dev：`env-nvk6FNcrq5`，函数服务 `1m0ub3f29wtv7`。prod 不操作。

本轮测试包：`D:\code\xyx\syPddSort\build\bytedance-mini-game-a-dev-launch-20261012-mp1`。A 槽、Release 编译、连接 dev；已构建并核对实际产物，尚未上传审核或完成本轮真机验收。先发布下方云文件并执行初始化，再导入此目录扫码。

## 本轮功能

- 合作：20 张图，先拼自己的部分，分享邀请或发布到广场，其他账号独立完成后获得图鉴。只保存完成结果，中途退出后重新拼；切后台保留当前内存中的棋盘。
- PVP：排位匹配、确认入场扣费、对局记录、恢复、胜负及段位结算、战绩、排行榜、广告/分享补票。新库没有真人记录时使用明确标识的机器人；玩家勾选允许被挑战后，合格的抖音成绩逐步成为对手。
- 只增加游戏必需的操作记录；原来的统计回放导出仍关闭。
- 好友挑战入口保持原来未开放状态；段位奖品保持原来服务器开关，王者奖品尚未配置。不得把“核心流程接通”说成这些扩展功能已开放。

## 发布步骤

交付目录已经生成。打开 `artifacts/douyin-multiplayer-dev-v1/操作页.html`，里面可以逐个复制完整文件，无需自己找代码片段或运行本地命令。

1. 在抖音云打开上述 **dev** 函数服务。
2. 替换 `businessCommon.js`；新增 `chapterRewardSync.js`、`multiplayerCommon.js`、`multiplayerStore.js`、`multiplayerRuntime.js`、`coopService.js`、`pvpService.js`、`multiplayerSetup.js`、`multiplayerMaintenance.js`。九个文件放到现有业务文件同一层。`adminAuth.js`、`businessRules.js` 沿用现有文件，交付目录也包含依赖副本用于核对。
3. 现有 `package.json` 保留 `mongodb: 4.17.2`。不改连接信息、不重新开数据库、不填写新的管理密钥。`multiplayerRuntime.js` 包含规则及关卡，约 2.5 MB；无需手工创建几百个关卡文件。
4. 为游戏调用配置 `/coopService`、`/pvpService`，沿用现有 `/syncUserState` 的小游戏可信身份访问方式；不要开放数据库客户端直读写。`multiplayerSetup`、`multiplayerMaintenance` 仅供后台调试，游戏请求会被拒绝。
5. 发布到 **dev**。客户端网络等待为 15 秒；真实云端生成机器人、校验长对局的耗时还需要用下方流程验证，超时应检查云端日志。
6. 在后台选择 `multiplayerSetup`，请求参数填 `{}` 并调试。应返回 `ok:true`、`reason:"MULTIPLAYER_READY"`、`transactionsVerified:true`、`replaySource:"douyin-only"`。重复执行不会清空数据或重置进度。它只创建缺失索引并检查事务；不会由玩家登录自动触发。
7. 成功后再导入本轮游戏测试包扫码。旧包未包含合作的抖音适配，不能用于验收。

如果返回 `SETUP_REQUIRED`，表示旧的 `businessSetup` 未完成，先执行旧的业务初始化；如果返回 `MULTIPLAYER_SETUP_REQUIRED`，表示本轮第 6 步尚未完成。不要把这些失败改成假成功。

## 真机验收

| 场景 | 预期 |
|---|---|
| A 拼完自己的部分，B 从分享进入并完成 | A/B 获得同一图鉴；重试不重复发放 |
| C 加入同一合作 | C 的完成状态独立，A 不重复获奖 |
| 合作中途退出、完成时断网后重试 | 中途重开；完成保存未确认时不给出已保存结果 |
| 两台设备用同一账号进入同一排位 | 同一对局只扣一次体力和门票 |
| 首局匹配 | 空池显示机器人对手；数据库失败明确报错，不当作空池 |
| A 勾选允许挑战并完成完整对局，B 匹配 | 在同关卡、评分及其他条件符合时可匹配 A 的历史成绩；A 段位不受 B 结果影响 |
| 广告提前关闭、完整观看、重复补领 | 提前关闭不发；完整观看一次；重复请求不重复发 |
| 切后台/恢复、杀进程、超期 | 合法检查点可恢复；过期不当成仍在进行 |
| 旧设备继续上传旧余额 | 不能覆盖 PVP 已扣除的资产或已发放奖励 |

## 数据与维护

新建 `douyin_coop_users/posts/runs` 三类数据，以及 `douyin_pvp_profiles/matches/replays/settlements/checkpoints/ticket_claims/rank_reward_claims` 七类数据。资产继续使用 `douyin_user_profile`，和原存档共用版本保护及 Mongo 事务。

后台运行 `multiplayerMaintenance`、参数 `{}`，会标记过期对局及退出匹配池的过期回放，不删除玩家记录。如果 `hasMore:true` 可再次运行。当前没有自动配置定时任务；即使未手动运行，匹配/恢复查询也会排除已过期记录。历史数据的长期清理策略以后单独配置。

段位奖励默认关闭；六档已配置奖品的领取逻辑可以通过 `PVP_RANK_REWARDS_ENABLED=true` 开放，但应在本轮真实资产验收后再设置。未配置的王者奖励仍不可领取。好友挑战不在本轮开放范围。

## 本地验证与边界

开发时可执行 `node scripts/test-douyin-multiplayer.js`，修改规则后运行 `node scripts/build-douyin-multiplayer.js`，重新交付时运行 `node scripts/package-douyin-multiplayer.js`。测试涵盖真实客户端云请求格式、身份隔离、三账号合作、真实控制器操作生成的回放、机器人到抖音真人记录的匹配、重复扣费/补票、事务失败回滚、检查点及旧存档保护。数据库及 Cocos 展示接口使用测试替身，不代表已在抖音云发布或通过手机验收。

服务器规则从当前客户端源码生成；旧微信规则镜像已发现过期，本轮不部署或覆盖微信云服务。广告与分享沿用现有客户端完成回调，未新增平台服务器回执验证。
