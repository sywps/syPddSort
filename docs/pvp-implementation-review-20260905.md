# 像素拼图异步 PvP 实现检查报告

检查日期：2026-09-05。范围：`game-pdd-v2` 当前本地客户端、`pvpService`、玩法文档和测试。

## 一、结论与验证边界

目前已经有可联调的异步 PvP 骨架，但不建议直接开放正式计分排位。最先要解决的是成绩可信、恢复完整、计时一致和回放可靠，而不是继续增加页面。

代码中的玩法入口已使用 `zt_level_ / theme / pvp-pixel-v2`，不是主线 `level_ / main`；真人历史优先、机器人补位、对手 HUD、段位结算等接口也已存在。但“有接口”与“满足正式竞技要求”之间仍有明显差距。

本轮只检查，没有修改游戏、云函数或数据库，也没有部署、提交或推送。

验证方式：

- 当前 `npm run test:pvp` 五组测试通过：PVP_MODE、PVP_SERVICE_CORE、PVP_FRIEND_LIFECYCLE、PIXEL_PUZZLE_LOBBY、PVP_PIXEL_ROUTE。
- 用项目既有测试的内存数据库替身执行真实云函数入口，增加异常成绩、重复请求、第三方提交、并发匹配、过期、隐藏分、检查点回退等隔离诊断。它验证代码路径，不等同于真实 CloudBase 并发压测。
- `localhost:7456` 当前无法加载 `/preview-app/index.js`。另用已有 Web 构建启动检查，30 秒内停留在加载 80%，未进入 PvP。因此本轮未完成浏览器内恢复、暂停、通关竞态的操作验证，也未用旧截图冒充新验证。
- 没有检查生产部署版本、数据库权限和索引的实际状态，没有完成微信真机及双账号验收。以下结论针对本地源码。

优先级：P0 为开放正式计分前必须解决的可信性问题；P1 为对局正确性与可靠性问题；P2 为规则完善、体验和运营能力。

## 二、P0：成绩与回放可信性

### F01：结构校验被当成有效成绩验证，非法结果能计分

证据：[core.js:146](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/core.js:146)、[index.js:597](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:597)、[index.js:416](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:416)。

现状：服务端检查动作数量、序号、时间递增、字段正值和摘要，但没有载入对应关卡并执行动作。`PASS`、用时、完成进度主要仍由客户端声明。通过结构校验后就结算星数/MMR，并写入 `verified: true`、可匹配回放。

隔离复现：一条不可能的越界动作、宣称 1 毫秒通关，被接受并判胜，回放同时进入可用池。

影响：不只是有人可以刷分；伪造记录还可能成为其他玩家的对手，进一步污染匹配、排行榜和训练数据。当前摘要只能说明提交内容自洽，不能证明真的玩过。

建议：

1. 服务端加载不可变关卡快照，用同版本像素拼图规则重放规范动作，自行得出棋盘、传送带、失败/通关和逻辑用时。
2. 区分 `received / structurally_valid / replay_verified / rejected`，只有 `replay_verified` 才能影响正式积分、进入对手池和训练集。
3. 未完成验证前限制为测试排位，并由服务端控制计分与奖励开关，不能只靠客户端隐藏。

验收：越界、凭空搬运、满带后继续操作、缺失动作、伪造终局、篡改速度或时间都明确拒绝；真实合法记录仍能重放通过。

### F02：已结算分支绕过参与者校验，可创建第三方回放

证据：[index.js:341](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:341)、[index.js:609](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:609)。

现状：`settleMatch` 先判断 `SETTLED` 并返回，然后才检查提交者是不是参与者；外层随后仍执行 `saveReplay`。

隔离复现：第三个账号向一个已知的已结算 matchId 提交，接口成功，生成第三方拥有的 `verified` 回放。此复现不代表第三方获得了原参与者的积分，而是参与关系被绕过且回放池被污染。

建议：所有对局接口都先验证参与者，再处理幂等返回；回放只能从已授权、已冻结的该方提交生成。补充“第三人访问进行中/已结束对局均拒绝”的测试。

## 三、P1：对局正确性与可靠性

### F03：结算防重了，但回放没有防重，重试会修改历史事实

证据：[index.js:345](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:345)、[index.js:405](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:405)。

现状：已结算请求返回旧结算，但仍用本次请求内容覆盖回放。覆盖还会重置 `useCount` 和有效期；结算事务与回放保存也不是同一个可靠交付流程。

隔离复现：同一局先提交 1 毫秒，再以 120000 毫秒重试；结算仍是原值，回放变成新值，使用次数从 15 重置到 0。

建议：按 `matchId + participant` 冻结提交和摘要。同内容重试返回同结果，不重复写入；不同内容返回冲突。验证后生成回放使用事务或可幂等重试的任务记录，覆盖“结算成功、回放写入失败”的恢复路径。

验收：重复提交、超时重试、进程中断后重试，不改变已冻结动作、回放、使用次数或奖励。

### F04：恢复只恢复了时间信息，棋盘和传送带没有恢复

证据：[PvpServiceMgr.ts:148](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/PvpServiceMgr.ts:148)、[PvpServiceMgr.ts:248](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/PvpServiceMgr.ts:248)、[PvpModeModule.ts:1044](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:1044)、[GameplaySessionController.ts:82](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameplaySessionController.ts:82)。

代码确认：检查点虽然带锁定格和时间线，但客户端恢复上下文只接收已耗时和展示时间线，重新创建初始棋盘、完整倒计时，并清空 `_pvpActions`。传送带内容、入口队列、速度等没有恢复。

此外，服务端只拒绝较小动作序号，相同序号允许逻辑时间倒退。隔离复现：同为序号 7，20 秒/40% 的检查点可被 5 秒/10% 覆盖。客户端也没有处理 `ignored: true`，会把忽略的检查点显示为保存成功。

影响：玩家点击“恢复”可能拿到重开的棋盘和继续推进的对手；动作序号也从 1 重新开始，后续保存和回放都不完整。本轮没有在浏览器实际操作复现，结论来自完整读写链路。

建议：

- 复用原玩法模型的导出/导入能力，保存当前颜色、锁定格、传送带、入口队列、待执行的逻辑阶段、速度、计时、随机状态和动作序号。不要保存逐帧动画或新增玩法暂存槽。
- 有效操作先写本地持久化动作日志，再增量上传；检查点加状态版本和 hash。按恢复策略处理正在入带/归位的逻辑转换。
- 服务端原子检查序号、逻辑时间和版本；客户端明确处理过期、冲突、忽略、缺片。

验收：在入带中、归位中、切后台、断网、刷新后恢复，完整逻辑状态和后续结果与不中断对局一致。

### F05：排位仍是 24 小时过期，不是已确认的 10 分钟

证据：[index.js:39](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:39)、[index.js:441](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:441)、[index.js:529](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:529)。

隔离复现：对局有效期 1440 分钟，11 分钟后仍返回 active match。超过期限后不再返回 active，但没有增加失败或对局次数。维护函数也只是标记 `EXPIRED`，历史列表不查询这个状态。

影响：长时间被未完成对局占住；直接离开并等待过期，与主动认输的后果不同，存在逃避败局的空间。

建议：排位恢复期限落地为 10 分钟，明确起算点并返回服务端截止时间，不能靠不断发心跳无限延期。区分“开始后弃赛判负”和“尚未开始、资源加载失败作废”；过期查询与定时维护走同一幂等终结逻辑。好友邀请有效期单独配置，不与排位恢复期限混用。

### F06：多套计时逻辑没有对齐，显示暂停时对手仍可推进

证据：[PvpModeModule.ts:1061](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:1061)、[PvpModeModule.ts:1081](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:1081)、[GameplayPlacementFxModule.ts:1215](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts:1215)、[SettingsPanelController.ts:198](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/Panels/SettingsPanelController.ts:198)。

代码确认：

- 对手时间从 PvP HUD 挂载后按 `Date.now()` 推进；自己的可见倒计时从首次操作开始。
- 设置弹窗暂停自己的倒计时，但对手时间仍推进。
- 同步连续失败后阻止自己的输入/传送带，显示“对局已暂停，等待同步”，对手仍可能达到终点并触发结算。
- 速度切换影响原玩法运行，但动作日志只记录点格子，没有记录速度变更，无法完整重建同一时间轴。

建议：竞技逻辑、对手回放、显示时间统一使用明确的比赛时钟。确定排位是否允许暂停：允许就双方逻辑一致冻结；不允许就不显示“已暂停”，也不能只冻结自己。墙上时间只用于 10 分钟恢复期限等服务端约束。将 `SET_SPEED`、开始和必要的暂停事件纳入规范动作。

补充风险：原玩法通关会等待归位/颜色特效完成才提交；PvP 对手终点判断只看 `isGameEnd`。棋盘已经完成但特效未完的窗口内，可能先收到“对手先通关”。应在规则判定完成时冻结胜负与用时，动画只负责表现。该竞态目前为代码风险，未完成真实帧序复现。

### F07：机器人没有实际玩关卡，缩略图不是它的真实进度镜像

证据：[core.js:233](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/core.js:233)、[PvpModeModule.ts:364](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:364)。

现状：机器人按 rating、种子生成胜负、完成时间、进度曲线和停顿。函数不接收棋盘，也不执行 PCH 合法动作。缺少真实棋盘时间线时，客户端按种子排序目标格，再根据百分比选择多少格已经完成。

因此“进度曲线带停顿”不等于“像人一样操作”；缩略图有变化，也不等于用户要求的真实操作镜像。机器人用时主要随 rating 变化，没有由具体关卡容量、布局和合法操作推导。

建议：不必先训练复杂 AI。先做使用同一规则引擎的合法启发式机器人，离线生成并验证完整 run，冻结其动作、耗时、失败和棋盘变化；线上只播放冻结记录。根据真实完成记录调整思考间隔、连点、选择偏好和失误率，不在对局中根据玩家表现偷偷改结果。真人、机器人共享同一回放和缩略图渲染路径。

验收：任意抽取一段机器人回放都能合法重放，缩略图逐事件对应真实锁定格；完成时间、超时和满带失败由实际规则产生。

### F08：对手隐藏分丢失，结算按默认 1200 分计算

证据：[core.js:295](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/core.js:295)、[index.js:241](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:241)、[index.js:367](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:367)。

现状：公开对手资料不含 rating，这是合理的；问题是服务端对局没有另存隐藏分快照，结算又从公开资料里读 rating。真人历史/机器人没有 `playerBOpenid` 可查档案，于是回退到 1200。

隔离复现：2000 分玩家战胜按 2000 分生成的机器人，隐藏分增加 0；按现有同水平 K=24 公式应增加 12。

建议：对局内部保存双方匹配时的 `ratingSnapshot`，真人历史取该 run 的评级快照；结算使用这些字段，缺失即报错。隐藏分仍不需要展示给玩家。

### F09：并发开始可以创建多局，active match 不是原子锁

证据：[index.js:207](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:207)。

现状：先查询 active、再搜索对手、再新增记录，中间没有事务级用户占位。前端按钮防连点无法覆盖多设备和请求重试。

隔离复现：同账号并发两次匹配，得到两个不同的 active match。此测试使用内存替身，并非生产负载测试；源码中的“检查后新增”缺少原子约束也已确认。

建议：玩家档案保存原子 `activeMatchId`/租约；创建用事务和客户端请求幂等键，重复请求返回同一局。历史回放的使用次数与匹配分配一起处理，避免创建失败仍消耗配额。

### F10：仅相同关卡编号，不足以保证相同棋盘；选关也缺少服务端约束

证据：[index.js:47](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:47)、[index.js:142](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:142)、[index.js:243](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:243)、[PvpModeModule.ts:675](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:675)。

现状：模式和规则命名空间已分离，但没有不可变关卡快照/hash。相同 `zt_level_N` 资源更新后，旧回放仍可能被用于新棋盘。服务端只检查关卡 ID 为正整数；隔离测试中不存在的 999999999 也能匹配成功。

此外，大厅把“下一未完成闯关关卡”作为排位关卡；排位又不推进闯关进度。因此只玩排位、不玩闯关的玩家会反复进入同一编号关卡，容易背板，也会缩小同关卡真人候选池。

建议：服务端从已发布的像素拼图竞技关卡池选关，返回不可变 `snapshotId + levelHash + rulesVersion + seed`。保留像素拼图原玩法，分离排位选关进度与闯关进度；用难度桶、近期关卡避重和可用回放量选关，不能由客户端任意指定计分关卡。

### F11：对战结束不等于个人 run 完整，当前会混入历史对手池

证据：[PvpModeModule.ts:1118](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:1118)、[index.js:405](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:405)、[core.js:114](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/core.js:114)。

现状：对手先过关时，自己被记为 `FORFEIT`；对手先死亡时，自己被记为 `SURVIVED_OPPONENT_DEATH`。这些描述的是对战结束原因，不一定是本人拼图真正通关或失败。但有动作就可能被保存成可匹配 run。

后果：这类记录未来成为对手时，客户端把非 PASS 终点统一视为“对手先失败”；上一场“因对手失败而获胜”的人，本场可能在同一时间被表现成自己失败。服务端还接受未证明已经等到对手死亡的 `SURVIVED_OPPONENT_DEATH` 声明，隔离测试中 1 毫秒声明即可战胜 50 秒死亡的对手。

建议：拆分 `duelOutcome / duelEndReason / personalRunTerminal / isCensored`。提前结束但本人未自然终局的 run 标记为截断，不进入需要完整成绩的历史对手池。可以保留为研究数据，但不得伪装成真实死亡；训练使用时也要显式处理截断标签。

普通 PASS 与真实死亡的比较并未发现“先死亡反而赢”的问题；需要重点统一的是主动认输、提前结束和特殊存活状态，不应误改正常胜负规则。

## 四、P2：规则、匹配体验和运营完善

### F12：段位显示和自身文档约定存在差异

证据：[PvpModeModule.ts:628](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts:628)、[index.js:307](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/cloudfunctions/pvpService/index.js:307)、[玩法文档:297](/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/docs/pixel-puzzle-async-pvp-gameplay-spec.md:297)。

- 大厅始终显示五颗星，青铜三颗、黄金四颗等配置未体现在 UI；王者超过五星也被截成五颗，宜显示数值“XX 星”。
- 自身文档写青铜失败不掉星，当前定位赛后只要有星就可能扣星；隔离复现为总星数 5 → 4。
- 文档的“满星再赢晋升至下一小段 1 星”和代码总星数取模模型不一致，需明确选哪套规则，不能前后端各用一套。
- 勇者积分只按 outcome 加分，没有区分主动认输、违规和有效完成。建议结合真实终局资格发放，不鼓励快速放弃刷保护分。
- 赛季 ID 固定 S01，尚没有完整的赛季切换、分榜和结算流程。

建议：维护一份前后端共用的段位规则配置，覆盖每档星数、升降段、青铜保护、定位、王者数值星级。这里比较的是项目已约定文档，不是宣称照搬某个时点外部游戏的全部规则。

### 其他建议

1. **匹配候选不要先截最近 40 条再过滤。** 当前可能漏掉更早但合法、分数接近的真人。把版本、快照、有效期、来源资格作为硬筛选；按隐藏分区间检索，再考虑近期对手避重、使用次数和多样性。机器人只在没有合格真人时补位，不能仅因最近一页没有而认定全池没有。
2. **冻结的异步对手不需要实时同步。** 赛前下发冻结轨迹，局中本地播放；网络主要上传自己的动作和检查点。保留云函数架构，不必为此搭建同步房间/WebSocket。
3. **同步改增量。** 当前每 5 秒上传累计锁定格和累计棋盘时间线，会重复传输；动作又集中在终局上传。使用顺序分片、确认水位和周期检查点，优先解决丢动作，再优化流量。
4. **机器人/真人缩略图只在逻辑变化时重建。** 当前每帧解析时间线或重新按种子生成格子后才比较 revision；可以缓存排序、推进时间线游标和新增格，降低大棋盘上的 CPU/GC 开销。
5. **训练授权和样本质量分开做。** 当前有训练授权字段和设置方法，但没有完整可见授权入口；不要把运营回放自动等同于训练许可。记录授权版本、规则版本、内容 hash、来源、验证结果、完整/截断标记、速度动作，并支持撤回后的派生样本处理。
6. **补齐“对局出了什么问题”的提示。** 明确区分加载失败、同步失败、保存被拒、已过期、弃赛、验证失败；过期对局在战绩可见，不能消失。恢复按钮显示剩余窗口，由服务器时间驱动。
7. **测试从文字结构转向行为。** 已有测试有价值，但此次五组全绿仍能复现核心缺陷。必须增加实际规则重放、异常链路、双账号权限、断网恢复和计时一致性测试；别以按钮名称和函数存在替代功能完成验收。
8. **统一文档状态。** 现有玩法文档同时保留目标设计和 MVP 状态，一些“已校验参与关系/幂等”的描述需要细化。后续按“已实现且验证 / 已实现未验证 / 未实现 / 已发现缺陷”维护覆盖矩阵。

## 五、建议实施顺序与验收门槛

### 第一阶段：先封住计分与数据污染

修 F01、F02、F03、F08、F09；同时引入 F10 的不可变竞技关卡清单。先有可信输入、原子对局、正确隐藏分和不可改写的提交，再开放正式积分。

验收门槛：非法成绩拒绝；第三人提交拒绝；重复请求结果稳定；同账号只有一局；同水平胜负的 MMR 符合公式；旧关卡回放不能跨 hash 使用。

### 第二阶段：让一局比赛从开始到结束都一致

修 F04、F05、F06、F11：完整恢复、10 分钟过期、唯一比赛时钟、逻辑完成时间、截断 run 分类。先冻结规范动作和快照协议，再依此实现恢复与验证，避免各自另造一套状态格式。

验收门槛：连续游玩与断线恢复的状态 hash/结果一致；自己的棋盘、对手进度和可见时间不矛盾；过期只处理一次；动画时长不影响胜负；截断回放不能作为自然失败对手。

### 第三阶段：提升对手质量和长期体验

用合法规则机器人替换比例模拟；优化真人池、关卡轮换、段位星数与保护规则，再补排行榜、赛季、训练数据处理和运营监控。好友入口可继续保持未解锁，避免扩大当前验收面。

建议至少监控：匹配成功率/耗时、合格真人命中率、机器人补位率、回放验证拒绝率、恢复成功率、超时弃赛率、重复结算拦截、每局同步量、分难度/分段位胜率与完成用时。阈值应根据真实样本确定，不用构造数据冒充运营效果。

## 六、本轮可复现诊断摘要

| 检查 | 隔离结果 |
|---|---|
| 不可能的 1ms PASS | 接受、判胜、verified=true、可匹配 |
| 同一局不同成绩重试 | 结算冻结，回放被改写，useCount 清零 |
| 非参与者提交已结算局 | 接受并生成第三方 verified 回放 |
| 同账号两次并发匹配 | 生成两个不同 active match |
| 2000 分玩家胜同水平机器人 | MMR +0，现有公式预期 +12 |
| 未完成对局 11 分钟 | 仍 active，实际期限 24 小时 |
| 超过对局期限 | active 查询不再返回，但未增加失败/对局数 |
| 不存在的正整数关卡 | 匹配成功 |
| 同序号检查点时间/进度倒退 | 接受覆盖 |
| 文档要求青铜保护 | 实际总星数 5 → 4 |

隔离脚本与原始结果保存在 `/tmp/pvp-review-20260905.J4p55H/`，不依赖真实账号或生产数据库；临时目录可能被系统清理。本报告记录关键证据与复验入口，不把隔离诊断等同于线上验证。
