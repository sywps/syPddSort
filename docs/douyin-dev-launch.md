# 当前上线候选：游戏连接 dev

2026-10-11 用户决定先完成 dev 上线测试，prod 暂缓。本页替代此前必须先完成 prod 的执行顺序。候选包不等于已验收或已上线。

## 已固定的配置

| 项目 | 当前值 |
|---|---|
| 游戏 AppID | ttf45082ed6a36c15802 |
| 游戏编译模式 | release（压缩、无源码映射）；不代表后端是 prod |
| 云环境 | dev / env-nvk6FNcrq5 |
| 云服务 | pdd-v2-cloudfunc / 1m0ub3f29wtv7 |
| 业务与统计数据标签 | douyin_dev |
| CDN | A 槽，remote_douyin，保持与微信分开 |
| 玩家存档和 SDK 角色 | 沿用当前编号，不清数据、不改绑定 |
| 数据库准备 | 用户已提供 businessSetup 与 analyticsSetup 成功结果，manual-prod-20261011 |

## 构建

最新包为 **r8**（设置面板新增真实「订阅版本更新提醒」入口，使用 MSG21797007137157690496699164461350；保留原首页、桌面、侧边栏、广告、存档）。本地功能测试、产物检查、图集依赖和 CDN 版本核对通过。共 1144 个文件，主包 1,751,414 字节。使用 `build/bytedance-mini-game-a-dev-launch-20261011-r8` 重新检测；尚未在用户 IDE/真机验证订阅。r7 只有后台方案、没有客户端调用，截图已证实订阅项仍黄色，已被 r8 替代。官方发送仍需后台提审配置，见 [版本更新提醒](douyin-version-update-reminder.md)。不部署体力提醒云函数，不添加插屏广告；插屏黄色建议可能继续显示。

2026-10-11 本次提审包使用 r3：去除 D1 排查入口，继续连接上述 dev 环境；正常资源校验仍保留。打包时剔除 SDK 未对游戏开放的钻石支付和订阅消息实现，厂商原文件保留。不会改变当前登录、广告上报或侧边栏接口。

r3 已完成本地构建和产物验证：1129 个文件，主包 1,751,414 字节；D1 和上述两个接口调用均未进入包内；图集依赖检查与远程关卡/皮肤版本核对通过。新包尚未真机复测，也未上传或提交审核。

鸿蒙边界：[官方适配指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/harmony/harmony-compatibility) 当前把 `tt.createCloud` 列入暂不支持的能力，而本游戏云存档使用该接口。消除 SDK 的两条静态警告不代表完成鸿蒙适配；本次不更换云后端。

```powershell
npm run build:douyin:dev-launch -- --cdn-slot=A --build-id=douyin-a-dev-launch-20261011-r5
```

生成 `build/bytedance-mini-game-a-dev-launch-20261011-r5`。后续构建使用新的 r6/r7 编号，脚本拒绝覆盖现有候选包。脚本复制当前源码到独立工位再构建，不使用旧包改名；保留构建日志、源码哈希和文件校验记录。若失败，不得交付半成品目录。

r1 真机启动发现首页图集依赖缺失（`1bf0b9ca5@6c48a`），不可继续作为上线候选。r2 在抖音构建后补齐首页引用的纹理、图片描述和 PNG，并检查图集依赖完整性；不改变首页布局或云数据。更换候选包后仍需手机重新验证首页加载。

云存档、统计必须同时启用并指向上述环境；与外部环境变量冲突时直接报错。保留域名校验，拒绝独立测试入口、错误 AppID、错误 CDN 槽位和超大主包。这个命令不发布云函数、不上传 CDN、不提交游戏。

## 后台需要核对的现有配置

- 正式访问路径应覆盖 `/businessIdentity`、`/syncUserState`、`/updateUserProfileAssets`、`/analyticsIdentity`、`/addBehaviorData`、`/addFunnelEvents`、`/saveLevelRecord`。这是游戏实际使用的七条路径。
- 管理函数、旧 cloudMongo/cloudIdentity/cloudAnalytics 测试函数不需要授权给游戏。不得为了排错添加 `/*` 或公开整个服务；保留后台调试能力。
- request 合法域名需核对 SDK 的 `https://docater1.cn`；CDN 使用 `https://game-pdd-v2.oss-cn-beijing.aliyuncs.com`，核对 request/downloadFile 对应白名单。以真机实际请求为准，不关闭域名校验通过测试。
- 真实广告需使用已配置并启用的广告位。当前激励广告 ID 为 `16c514i27srb2n52u4`。

当前后台配置尚未由助手读取，以上是核对项，不是已完成声明。此次没有修改后端文件，不必因更换候选游戏包而重复替换云函数或运行初始化。

## 手机验收，按顺序做

1. 导入新候选包，使用原账号正常预览；不要清缓存。确认首页、进入关卡、通关和返回首页无阻断错误。
2. 记下关卡进度、金币和装扮，完全退出并重进，确认恢复一致。仅本机恢复不能单独证明云保存，应结合云端读取结果或另一台设备的同账号恢复。
3. 完整观看一次激励广告，确认奖励只发一次；中途关闭广告，不应误发奖励。
4. 从侧边栏返回，检查引导与奖励；切到后台再回来，检查游戏和统计恢复。
5. 发布访问验证：开发者身份扫码成功不能证明普通玩家能访问 DEV。需在提审/正式访问场景核对平台权限，正式入口验证不能用本地模拟替代。未经验证不能称为可全面上线。

失败时提供控制台具体错误和发生步骤，不发 OpenID、密钥或数据库连接信息。不要将真实广告播放、正式访问等检查伪装成已完成。

## 数据维护约定

从接入真实玩家起，当前 dev 数据按正式玩家数据保护：不能继续清库或随意重置。保留数据库备份，修改云函数前先做本地验证。

统计仍标记 douyin_dev；新包使用独立 buildId 区分此前测试包，但同一候选包的预览、审核和上线数据仍可能混合，不能把该标签或 buildId 单独当作正式玩家数据。当前不更改统计采集范围、不伪造正式版本判断。

未来切 prod 必须另做玩家存档及 SDK 角色衔接。现有身份包含云环境，不能直接替换环境 ID；还需处理旧版本仍写 dev 的情况。本轮不实施迁移。

## 官方参考与边界

[云函数开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/cloud-service/cloud-function-service-manage/cloud-function-guide) 说明 DEV 可发布并通过 SDK 调用，官方推荐测试通过后部署 PROD。没有查到足以证明本小游戏正式流量可以访问 DEV 的明确保证；本地无拦截不等于平台已许可。

[小游戏网络请求](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/network) 说明域名白名单要求，开发调试的跳过校验不代表正式包可访问。
