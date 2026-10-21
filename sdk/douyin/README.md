# 盛也抖音 SDK 接入

供应商版本 1001.1.9，文档更新日期 2026-06-08。原始 `vendor/sysdk-wxapp.js` 的 SHA256：
`7fe581299892ee562cd487d2b9553e2c686db51f1a08ef413b312081acdd0630`。
文件名含 wx，但该文件实际使用 tt 和 MiniGameTt。原文件保留不改，构建生成静态 CommonJS 工厂；不使用 eval。

`sysdk-conf.js` 只含供应商允许公开的 APP_ID / GAME_KEY。appsecret 只应进入服务端环境变量，本目录及构建过程不读取它。
抖音后处理只复制此 SDK 的三个运行文件，微信构建过滤本目录，微信 SDK 保持原接入。

`adapter.js` 修复本游戏所需的初始化、登录、广告、侧边栏接口。游戏通过 SySDKMgr 调用，抖音实例不写入微信的 Sygame 全局。

- game.js 最早初始化一次，保留原始 query/scene，同时捕获冷启动及单一 onShow。
- 登录单飞，10 秒总超时；网络、HTTP、空身份、失败或未知业务码明确失败；重复或迟到回调不能更改身份。
- 登录中 status/code 若存在，仅接受同后台约定的 1001（包含字符串）；文档未定义登录 code 完整范围，真实联调发现其他值必须向供应商确认后调整，禁止通过放宽规则掩盖登录失败。
- openid 为盛也身份；文档规定 dy_openid 为抖音身份，real_openid 单独保留，不互相替代或要求相等。两个可选字段均校验类型；首次和缓存登录分别返回 dyOpenid/realOpenid。身份和 session_key 不输出日志，客户端身份尚不具有云鉴权效力。
- 原生激励广告明确完成且 grant 成功后，以独立交易 ID 去重上报；grant 迟到成功仍上报。afterGrant 是后续 UI/跳转，不改变已发奖励。回执失败、拒绝或超时不重发奖励，不自动重试上报。当前只保证进程内同一交易一次请求，供应商服务端幂等仍待确认。
- 后台 iconShowStatus、设备能力、实际冷/热侧栏来源、每天已领状态分离。字符串 0 能关闭先前开启的入口。发起导航不产生资格；普通入口回前台清除资格。
- 原有入口和每日 12 金币保留，当前每日去重仍是设备本地记录；跨设备和可信服务端日期去重待云迁移。
- 引导按钮只在自身区域内接收 tt.onTouchStart；调用前/关闭后/场景销毁时移除监听。坐标转换与 Cocos 3.8.8 PAL 一致。
- 新 SDK 没有 syIaa* 接口，旧微信 IAA 上报不映射到猜测接口。自有数据统计仍待抖音云迁移。

联调需要配置 request 合法域名 `https://docater1.cn`。未接支付、订阅、客服等本轮未授权功能。
真实设备验证：冷启动买量参数、普通/侧栏冷暖启动、后台关闭 icon、原生复访弹窗、完整/提前关闭广告、断网/超时、重复点击、下一关/返回、云环境配置后存档与奖励。

本地回归：`node tests/douyin-sysdk-runtime.test.js`、`node tests/douyin-sidebar-runtime.test.js`、`node tests/rewarded-grant-transaction.test.js`、`node tests/dn-sdk-integration.test.js`。
