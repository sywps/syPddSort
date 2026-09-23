# 微信小游戏礼包接入

> 已按用户要求暂停微信平台礼包功能：`config.json` 的 `enabled` 为 `false`，即使环境变量 `WECHAT_GIFT_ENABLED=true` 也返回 503，不进入发奖逻辑。下文是保留的接入资料，不是当前待执行部署指令。章节奖励已复用累计资产同步，相关共用代码保留。未确认注册卡片能力前，不开启配置、不继续部署。

## 当前状态

本地实现和自动化测试已完成；尚未部署、切换消息回调或完成真机领取。后台配置礼包本身不会给游戏存档增加资产，必须部署发货回调并发布兼容客户端。

目标 AppID：`wxbb6160c828f380ca`；云环境：`cloud1-d5gzq8ia0c404ee3e`。礼包 ID 已写入 `cloudfunctions/wechatMessageCallback/config.json`。

商品映射：`jinbi → gold`、`qingcao → brushCount`、`citie → magnetCount`、`dongjie → freezeCount`。数量取经过验签、解密的微信发货消息，未知商品拒绝发货。

依据：[官方礼包文档](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/game-gift.html)、[消息推送文档](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/message-push.html)。该实现负责礼包到账，不承诺主动发送“微信游戏”会话中的注册礼包卡片。

## 实现

- `wechatMessageCallback` 校验微信签名、AES 安全模式、AppID、礼包、预览白名单和数量；支持 XML/JSON。普通云函数调用不能直接发奖。
- `wechat_gift_orders` 以 AppID 和 OrderId 的 SHA-256 为主键，与玩家资产在同一事务入账。重复订单返回成功，同订单不同内容拒绝处理。
- 玩家必须已同步 `wechatGiftProtocol: 1`。未注册玩家返回指定子错误码；不兼容客户端明确失败。
- `wechatGiftTotals` 为服务端累计发放量。新客户端同步未接收的增量，保留同步期间的本地消耗，并用本地日志恢复中断写入。旧客户端不能在已有礼包时覆盖资产。
- PVP、个人装扮返回的资产快照携带累计量；过期的完整资产快照拒绝应用。

## 部署顺序

1. 在目标环境创建 `wechat_gift_orders` 集合，客户端读写权限均禁止，仅由云函数访问。确认 `user_profile` 同样不允许客户端绕过云函数写入资产。
2. 部署 `syncUserState`、`pvpService`、`updateUserProfileAssets`；保留这些目录已有的其他业务变更，实际发布前按项目既有发布流程审阅完整版本。
3. 构建并发布本次兼容客户端，确认测试用户同步出 `wechatGiftProtocol: 1`。客户端不放 Token、AES Key 或发奖权限；无需在 game.json 填礼包 ID。
4. 在 `cloudfunctions/wechatMessageCallback` 执行 `npm ci --omit=dev`，部署为同名云函数。使用 lock 文件锁定依赖。
5. 云函数环境变量：`WECHAT_MESSAGE_TOKEN`、`WECHAT_MESSAGE_AES_KEY`（43 位 EncodingAESKey）、`WECHAT_GIFT_PREVIEW_OPENIDS`（逗号分隔测试用户 OpenID）、`WECHAT_GIFT_ENABLED`。默认未配置开关即返回 503，不发奖。密钥仅在后台填写，不提交源码。
6. 在已开通的 HTTP 网关增加 `/wechat/message` 路由指向该函数，允许 GET/POST；微信无法提供 CloudBase 登录凭据，因此入口使用函数内部微信签名鉴权。确认网关传入原始 `httpMethod/queryStringParameters/body/isBase64Encoded` 并返回函数的 HTTP 状态和正文。
7. 候选 URL：`https://cloud1-d5gzq8ia0c404ee3e-1429995216.ap-shanghai.app.tcloudbase.com/wechat/message`。这是待配置地址，尚未验证可访问。
8. **切换前必须解决现有 `kfreply.docater1.cn` 回调的归属和共存。** 微信只有一个消息回调；本函数不实现客服消息转发，不能直接替换仍在使用的客服服务。可让原服务按事件转交礼包，或确认原服务停用后切换。不能把不支持的事件伪装成处理成功。
9. 入口和兼容客户端就绪后设置 `WECHAT_GIFT_ENABLED=true`，以后台相同 Token/AES Key 配置 XML 安全模式，完成 URL 验证及白名单账号预览发货。未通过真实测试之前不开放正式领取。

## 线上验收

- GET URL 验证成功；无签名 POST 被拒绝；普通云函数调用被拒绝。
- 预览账号领取：订单仅一条，金币/道具准确，重发同一订单不重复到账。
- 游戏前台消耗道具同时领取、后台领取后回前台、退出重进，资产都正确；离线消耗后同步不覆盖礼包。
- 真机确认新安装账号注册和首次同步后可领；未注册/旧版账号明确失败。
- 验证原有客服消息仍按选定共存方案工作。

## 本地验证与限制

通过 `tests/wechat-gift.test.js`，覆盖重复/冲突订单、事务失败、非法商品、预览限制、验签解密、同步并发、本地写入中断和旧快照。
通过存档并发、PVP 客户端/服务端、关卡进度及个人装扮回归；项目实际脚本的隔离 TypeScript 检查通过。
完整项目 TypeScript 检查受已有第三方声明及 temp 内重复声明影响未通过。未执行 Cocos 打包、云端部署和真机测试；内存数据库测试不能代替真实 CloudBase 事务与 HTTP 网关验证。

紧急停发设置 `WECHAT_GIFT_ENABLED=false`；这不会撤回已发资产。发货后不要回退兼容存档逻辑或删除订单，否则可能重复发放或丢失资产。
