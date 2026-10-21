# 抖音业务云 dev 接入：按顺序操作

本次处理「资料云服务不可用」「通关进度暂时无法同步，章节奖励待确认」。已完成本地适配和测试；后台部署、真实 MongoDB 事务及手机验收需要按下列步骤完成。不要把本地测试通过当作线上已修好。

## 这次用哪个环境

| 项目 | 填写内容 |
|---|---|
| 环境 | dev，`env-nvk6FNcrq5` |
| 服务 | 原服务 `pdd-v2-cloudfunc`，服务 ID `1m0ub3f29wtv7` |
| AppID | `ttf45082ed6a36c15802` |
| 新包 buildId | `douyin-a-business-dev-20261010-r1` |
| 本地包目录 | `D:\code\xyx\syPddSort\build\bytedance-mini-game-a-business-dev` |
| 云端文件目录 | `D:\code\xyx\syPddSort\artifacts\douyin-business-dev\functions` |

沿用已经配置好的 MongoDB、`MONGODB_URI`、`MONGODB_DB` 和 `mongodb: 4.17.2` 依赖，不需要把密码发给我。保留原埋点文件、环境变量和访问路径。

## 第一步：你添加云端文件

在原服务的函数代码编辑页面，按**完整文件名**新增以下 6 个 JavaScript 文件。打开本地同名文件，复制全部内容到后台，保存。不要在外面再包一层 `exports.main`，也不要省略文件末尾。

| 文件名 | 用途 | 是否开放游戏访问路径 |
|---|---|---|
| `businessRules.js` | 存档合并、装扮、章节奖励规则 | 否，只被其他文件引用 |
| `businessCommon.js` | 身份验证、MongoDB 事务读写 | 否，只被其他文件引用 |
| `businessIdentity.js` | 游戏登录身份与业务云就绪检查 | 是 |
| `syncUserState.js` | 读取/保存关卡进度和资产 | 是 |
| `updateUserProfileAssets.js` | 资料、头像/框、购买、广告解锁、章节奖励 | 是 |
| `businessSetup.js` | 后台创建索引并验证事务 | **否，仅后台测试运行** |

它们和 `analyticsCommon.js` 等原文件放在相同代码目录。此次不替换原埋点文件，也不替换整个 `package.json`。

## 第二步：你添加一个环境变量

到之前设置 `MONGODB_URI` 的同一个配置位置，新增：

| 变量名 | 变量值 |
|---|---|
| `BUSINESS_ENVIRONMENT` | `douyin_dev` |

保持原 `ANALYTICS_ENVIRONMENT=douyin_dev`、MongoDB 变量不变。代码还会检查平台提供的 `CLOUD_ENV` 必须为 `DEV`，因此必须发布在 dev 环境。

## 第三步：你配置三条访问路径

到之前配置 `/analyticsIdentity`、`/addFunnelEvents` 的同一个「授权访问路径」页面，新增：

| 路径名称（备注名） | 访问路径 | 对应函数 |
|---|---|---|
| 业务云身份验证 | `/businessIdentity` | `businessIdentity.js` |
| 玩家存档同步 | `/syncUserState` | `syncUserState.js` |
| 资料与章节奖励 | `/updateUserProfileAssets` | `updateUserProfileAssets.js` |

「路径名称」分别填 `businessIdentity`、`syncUserState`、`profile-assets`（名称最多 20 个字符）。访问路径严格按表填写，前面带 `/`，后面不带 `.js`；资料路径仍是 `/updateUserProfileAssets`。授权当前小游戏 AppID。保持与已验证的埋点路径相同的小游戏授权方式，不新增公网匿名访问。

不要开放 `/businessSetup`、`/businessCommon`、`/businessRules`。

## 第四步：你发布 dev，再运行初始化检查

确认顶部仍是 **dev**，点击「发布」。发布备注可填：

> 抖音业务云 dev：存档、资料装扮及章节奖励接入 r1

等待发布成功，选中 `businessSetup.js`，使用和之前 `analyticsSetup` 一样的后台测试运行入口，参数填：

```json
{}
```

成功结果应包含：

```json
{
  "ok": true,
  "reason": "BUSINESS_READY",
  "transactionsVerified": true,
  "collections": [
    "douyin_user_profile",
    "douyin_profile_requests",
    "douyin_business_meta"
  ],
  "businessEnvironment": "douyin_dev",
  "businessSchemaVersion": 1
}
```

这一步自动创建业务集合/索引，用临时记录验证事务回滚及跨集合提交，然后清理自己的临时记录。可以重复执行，不重置玩家存档、旧埋点或历史隔离队列。

**先把这一步返回的 JSON 发给我。** 如果 `ok:false`，先停在这里，不导入新包、不删除数据库。只需发错误码/返回 JSON，不发连接串或密码。`SETUP_REQUIRED` 表示还没完成这一步；`CONFIG_NOT_READY` 表示检查环境或变量；`TRANSACTIONS_UNAVAILABLE` 表示需要检查副本集事务支持；`DATABASE_FAILED` 结合 `databaseErrorCode` 进一步定位事务/连接配置。

## 第五步：你导入新包，手机扫码验收

第四步成功后，在抖音开发者工具导入新目录：

```text
D:\code\xyx\syPddSort\build\bytedance-mini-game-a-business-dev
```

不要继续使用 `...a-telemetry-dev-r2` 旧包。这个包是 release 编译方式的 **dev 联调包**，业务云/埋点只连 dev，不能当成正式生产版发布。

保持当前测试账号，不清缓存，不清原 17 条隔离记录。按下面顺序扫码测试：

1. 进入游戏，打开个人资料。确认没有「资料云服务不可用」。选择一个已拥有的头像/头像框，退出资料页再打开，选择应保留。
2. 通关一关，进入结算。确认没有「通关进度暂时无法同步」。到达章节第 4/9 关奖励节点时检查对应奖励；再次打开结算不能重复发放。第一次接通会按已有存档补领符合条件且未领过的章节奖励，这是现有奖励规则。
3. 金币足够时购买一件可购买装扮：只扣一次金币，解锁后可使用；余额不足应明确失败、不解锁。
4. 测试一件广告解锁装扮：看完且 SDK 成功回调后进度增加；中途关闭广告不增加。广告步骤需要真实广告可用，预加载成功不能代替完整领奖验收。
5. 彻底退出，再进入游戏，检查进度、金币、道具、皮肤、头像/框是否恢复。保持网络可用完成首轮；弱网/退出重试是第二轮专项，不能清缓存掩盖失败。

本次明确暂停的合作/PVP 埋点与回放上传继续暂停。未迁移其在线业务接口。内部字段 `pvpEconomyRevision`、`wechatGiftTotals` 是复用的资产防覆盖协议，不代表启用了 PVP 或连接了微信云。

## 分工与验证边界

- 我负责：本地代码、规则生成校验、接口及回归测试、A 槽 dev 构建、部署文件、收到你实际结果后定位问题。
- 你负责：上面第 1–4 步后台部署及测试运行，第 5 步手机操作。无需再购买数据库，也不用提供密钥。
- 本地 Mongo/网络替身测试验证了业务规则、原子失败处理和调用格式；实际数据库事务是否可用以第四步为准，真实操作效果以第五步为准。
- SDK 原有的 `cloudIdentityVerified` 调试字段不是这次业务云的健康状态；不要仅凭它为 `false` 判定此次接入失败。
- 同一小游戏账号的数据放在本次新的业务集合，和微信数据隔离；不自动迁移微信存档。首次接入保留当前抖音本地进度。发现账号切换时停止上传共享本地存档，避免串号；不要直接删绑定键绕过。
- 广告奖励沿用现有 SDK 成功回调及服务端请求记录防重；本次没有新增广告平台服务端验签，也没有把全部关卡计算改成服务器判定。
- CDN 地址与资源没有变化，此次不需要上传 CDN。正式生产环境仍未接入，不在本次 dev 验收范围。
