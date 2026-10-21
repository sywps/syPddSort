# 抖音体力恢复提醒：DEV 接入

> 已取消，勿执行：2026-10-11 用户改用抖音官方版本更新提醒。下文仅保留历史记录，不再部署任何体力提醒函数、密钥或定时任务。新方案见 [版本更新提醒](douyin-version-update-reminder.md)。

模板：`MSG21797007137187693916468651772210`，关键词为「体力值」「温馨提示」。只做自然恢复满 10 点后的单次提醒，不做版本更新提醒。

当前是本地实现，未部署、未发送真实通知、未做手机验收。新包只有在后台发送服务就绪后才允许玩家订阅；后台未就绪会显示「体力提醒暂不可用」。不影响原有存档、体力奖励或广告。

## 游戏里的行为

- 补充体力面板底部：「自然恢复满10点时提醒我」。玩家点击后弹出抖音的订阅授权。
- 同意后，先确认云存档保存成功，再记录本次提醒。两步都成功才显示「已预约」。拒绝不会发奖励、扣资源或影响游戏。
- 自然恢复满 10 点后，由后台发送一次。看广告、分享、金币购买直接补满会取消待发送任务；部分补充或继续消耗体力会根据最新成功保存的体力调整时间。
- 同一账号最多一个待发送提醒。发送成功、失败或取消后，需要玩家再次主动订阅才能安排下一次。
- 玩家当前设备未成功上传的新变化，后台无法知道；此功能与现有云存档一致，以最近一次成功保存的体力为准。网络发送与玩家同时操作无法做到跨平台原子执行。
- 消息超时或响应不明确时标记 unknown，不自动重发；停机后过期超过 4 小时的提醒不补发。避免重复或过时提醒。

## 第一步：更新 DEV 云函数代码

运行本地打包脚本生成的 `artifacts/douyin-energy-reminder-dev-20261011/操作页.html` 提供每个文件的复制按钮。

在现有 `pdd-v2-cloudfunc` 服务、DEV 环境 `env-nvk6FNcrq5` 操作：

| 文件 | 操作 | 用途 |
|---|---|---|
| businessCommon.js | 替换原同名文件 | 存档同步时更新或取消待发送提醒 |
| energyReminderCommon.js | 新增 | 模板、后台凭证、官方发送接口 |
| energyReminder.js | 新增 | 游戏查询就绪状态和记录订阅 |
| energyReminderSetup.js | 新增 | 后台手动创建查询索引 |
| energyReminderTick.js | 新增 | 定时检查并发送到期提醒 |

保留原文件、MongoDB 配置与 mongodb 4.17.2 依赖。不要新增数据库，不改 PROD。发布后，在后台运行 `energyReminderSetup`，参数 `{}`。成功应返回 `ok:true, reason:ENERGY_REMINDER_SETUP_READY`。此步骤不发送消息、不重置存档。

为游戏新增 `/energyReminder` 授权访问路径，绑定 `energyReminder.js`，授权当前小游戏 AppID。辅助文件和 setup 不开放游戏/公网访问。

## 第二步：配置后台发送所需内容

这些只填在云函数环境变量中，不发到聊天、不写入小游戏：

| 变量名 | 内容 |
|---|---|
| DOUYIN_APP_SECRET | 本小游戏开发设置中的 AppSecret |
| DOUYIN_REMINDER_TIMER_TOKEN | 操作页点击「生成定时任务口令」得到的 64 位字符串 |
| DOUYIN_ENERGY_REMINDER_ENABLED | `1` |

AppSecret 是抖音官方服务端调用凭据。定时任务口令是本功能对公网定时入口的保护，防止其他人触发发送；与以前的管理员密钥不是同一个用途。口令只生成一次，在环境变量和定时任务参数中填同一个值。不要截图或分享含口令的页面。

使用官方稳定版 access_token 普通模式，不主动刷新使供应商服务的 token 失效。日志不输出、客户端不接收 AppSecret、token、OpenID。发送所需 OpenID 仅从已验证的平台请求头获取，保存在玩家自己的待发送任务内，发送终结或补满取消后移除。

## 第三步：接通定时任务（需先核对实际后台入口）

官方函数服务的「触发器」文档明确支持选择已部署服务、POST 接口、分钟间隔和 JSON 参数；接口文档说明通过公网 HTTP POST 调用。**本项目当前 DEV 服务的具体绑定入口尚未在实际控制台确认，不能把文档支持当作已经配置成功。** 若没有该入口，先停止此步骤，核对平台支持方式；不要自行添加开放匿名的管理入口，也不要转去改 PROD。

确认可用后，定时任务每分钟调用一次 `energyReminderTick.js` 对应的 HTTP POST 入口，JSON 参数为 `{"timerToken":"与云函数变量相同的定时任务口令"}`。代码会校验口令，不信任调用者自行传入的 trigger、来源标记或玩家账号。公网入口只用于这个发送函数。

先在后台手动测试 `energyReminderTick`，使用上述参数。刚初始化、尚无订阅时应返回 `ok:true, sent:0, failed:0, unknown:0, expired:0`。它会验证 AppSecret 并记录发送服务心跳，不会在没有玩家订阅的情况下发送消息。之后确认定时任务自动执行成功。定时任务超过 3 分钟未成功运行，游戏会停止接受新的订阅。

发送能力每日/每用户配额由抖音平台决定。当前单次最多处理 10 人，并设置处理时间预算；发布规模增大时需观察待发送队列延迟，再调整处理能力，不承诺精确到秒。

## 第四步：手机验收，再提交审核

1. 用新版包进入补充体力面板，低于 10 点时主动订阅，确认显示「已预约」。
2. 退出游戏，等自然恢复满，确认收到且仅收到一次消息，消息能打开游戏。
3. 再次主动订阅后看广告补满，确认不会再发本次提醒；部分补充时应改为新的回满时间。
4. 拒绝订阅，确认正常游戏且无通知；同账号换设备确认不重复安排。

首次真实发送还会验证模板关键词、平台额度和跳转行为；本地模拟测试不能替代这一步。模板关键字如果与「体力值」「温馨提示」不一致，需先修正服务端数据字段。

## 依据

- [小游戏订阅 API](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/subscribe-message/tt-request-subscribe-message)
- [服务端发送订阅消息](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/notify)
- [稳定版服务端凭证](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/interface-request-credential/gen-stable-access-token)
- [抖音云 HTTP 定时触发器](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/api-reference/trigger)
- [函数服务触发器配置指引](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/trigger)
