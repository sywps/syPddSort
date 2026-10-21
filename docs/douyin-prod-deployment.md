# 抖音 dev → prod：先发布兼容两个环境的云函数

> 2026-10-11 已确定手动初始化。当前操作请以 [prod 手动初始化](douyin-prod-manual-setup.md) 和 `artifacts/douyin-prod-manual-20261011/操作页.html` 为准；以下保留为历史部署说明。

> 更新：prod 在线调试会以线上请求调用，旧版管理判断会报 ADMIN_CONSOLE_REQUIRED。已准备管理员密钥修复，请按 `docs/douyin-prod-admin-fix.md` 部署新增 adminAuth.js 及两个公共模块。本文直接调试 prod 管理函数的步骤须同时携带该文档要求的请求头。

## 当前进度

已确认 prod 环境 ID：`env-XzE6JatzwX`。用户截图确认平台自动提供 `CLOUD_ENV=PROD`，prod 只能选择 dev 已发布成功的版本。当前版本 29 仍是原 dev 专用代码，不应直接选它作为本轮正式部署版本。

本轮完成服务端环境适配与本地测试，没有发布云端、开通数据库、迁移数据或构建生产游戏包。客户端仍限制 dev，暂不可提交正式上线。PK 对战入口的源码隐藏保持不变。

## 第一步：你在 dev 替换三个文件

回到 **dev 环境**、原函数服务的代码页面。替换以下同名文件的全部内容，其他函数保留：

- `artifacts/douyin-prod-cloud-preparation/functions/businessCommon.js`
- `artifacts/douyin-prod-cloud-preparation/functions/analyticsCommon.js`
- `artifacts/douyin-prod-cloud-preparation/functions/analyticsReport.js`

它们仍放在原代码目录，与已有 `businessRules.js`、各业务/埋点入口函数同一层。交付目录同时包含完整的 14 个业务/埋点函数文件，供核对，不需要新增同名函数。

**dev 原来的环境变量和连接串保持不变。** 新代码继续识别 `CLOUD_ENV=DEV`、`BUSINESS_ENVIRONMENT=douyin_dev`、`ANALYTICS_ENVIRONMENT=douyin_dev`。`pdd_douyin_prod` 作为生产专用数据库名，dev 禁止使用。

在 dev 发布，备注填写：

> dev/prod 云函数环境隔离，存档与埋点生产配置适配

记下本次发布成功的新版本号。不要假定一定是 30，以后台实际版本号为准。

## 第二步：你验证 dev 仍然正常

在后台测试运行：

1. `businessSetup`，参数 `{}`：应返回 `ok:true`、`transactionsVerified:true`、`businessEnvironment:"douyin_dev"`。
2. `analyticsSetup`，参数 `{}`：应返回 `ok:true`、`reason:"INDEXES_READY"`、`analyticsEnvironment:"douyin_dev"`。
3. `analyticsReport`，参数 `{"date":"2026-10-10"}`（日期换成实际测试当天）：应返回 `ok:true` 和 `analyticsEnvironment:"douyin_dev"`，仍能读取原测试数据。

两项 Setup 都可重复执行，不清空玩家数据。businessSetup 会写入、回滚并清理本次临时验证记录。任一失败时停止发布 prod，把 JSON 结果发给我。

## 第三步：你核对 prod 数据库和服务

切换到 **prod**，查看 MongoDB 页面是否有可用实例，以及该函数服务是否能通过私网连接。prod 其他资源尚未配置，不能假设 dev 私网连接串可直接使用。先提供页面状态和 prod 函数服务 ID，不需要密码或完整连接串。

本方案使用逻辑数据库名 `pdd_douyin_prod`。这是 MongoDB 实例里面的库名，并不等于必须再购买一台数据库；是否需要单独开通实例，取决于后台 prod 的可用资源和网络。连接账户需要具有该库的读写、创建索引及所需事务权限。

数据库就绪后，只在后台填写其实际连接信息。不复制 dev 测试数据到正式库。

## 第四步：你发布到 prod（数据库就绪后）

在用户截图的 prod 发布页面，选择**第一步刚发布并验证成功的版本**。打开「发布设置」，核对：

| 环境变量 | prod 值 |
|---|---|
| `CLOUD_ENV` | 平台自动填写 `PROD`，不要手工改成 DEV |
| `BUSINESS_ENVIRONMENT` | `douyin_release` |
| `ANALYTICS_ENVIRONMENT` | `douyin_release` |
| `MONGODB_DB` | `pdd_douyin_prod` |
| `MONGODB_URI` | prod 服务可访问的 MongoDB 实际完整连接串，凭据仅在后台填写 |

`douyin_release` 是代码中正式环境的数据标识，控制台环境名仍叫 prod。不能填成 `douyin_prod`。旧 dev 标识、错误库名或未知运行环境都会明确拒绝读写。

沿用 dev 已验证的运行时/依赖配置（此前 Node 14.21.3、mongodb 4.17.2），以后台当前服务配置为准，不要用 `package.dependencies.json` 覆盖完整 `package.json`。本轮这些业务/埋点函数使用平台网关身份，不需要额外填写 App Secret。若其他保留的函数需要密钥，应单独核对它的用途，不要把密钥发送到聊天。

发布备注：

> prod 首次部署：存档、资产与埋点，PK 暂停

发布不是小游戏正式上线。按页面完成部署/流量生效流程，之后再做下面的初始化。未通过初始化前不交付连接 prod 的游戏包。

## 第五步：你配置 prod 的小游戏访问路径

到当前 **prod** 服务「访问控制 → 外网流量 → 授权访问路径」，核对/添加以下精确路径，并授权当前小游戏 `ttf45082ed6a36c15802`。如果平台已同步，核对即可，不要重复创建。

| 路径名称 | 访问路径 | 对应文件 |
|---|---|---|
| businessIdentity | `/businessIdentity` | businessIdentity.js |
| syncUserState | `/syncUserState` | syncUserState.js |
| profile-assets | `/updateUserProfileAssets` | updateUserProfileAssets.js |
| analyticsIdentity | `/analyticsIdentity` | analyticsIdentity.js |
| addBehaviorData | `/addBehaviorData` | addBehaviorData.js |
| addFunnelEvents | `/addFunnelEvents` | addFunnelEvents.js |
| saveLevelRecord | `/saveLevelRecord` | saveLevelRecord.js |

不要配置通配路径 `/*`，不要给 Setup、Report、Export、公共模块或旧测试探针开游戏访问路径。保留小游戏授权方式，管理函数只在控制台运行。

## 第六步：你在 prod 初始化并把结果发给我

确认顶部仍是 **prod**，依次后台测试：

1. `businessSetup`，参数 `{}`。预期 `ok:true`、`reason:"BUSINESS_READY"`、`transactionsVerified:true`、`businessEnvironment:"douyin_release"`。
2. `analyticsSetup`，参数 `{}`。预期 `ok:true`、`reason:"INDEXES_READY"`、`analyticsEnvironment:"douyin_release"`。
3. `analyticsReport`，参数为当天日期。预期 `ok:true`、`analyticsEnvironment:"douyin_release"`；首次部署还没有生产客户端上报，事件为空、人数为零是正常的，不应出现 dev 的测试记录。

只发返回 JSON，不发密码。`CONFIG_NOT_READY` 先检查环境变量和数据库名；数据库/事务失败结合实际错误处理，不改成功条件绕过。

## 后续由我完成，当前仍待做

- 确认 prod 服务 ID，再接客户端 prod 环境与返回校验。
- 隔离客户端埋点队列、检查点和本地存档绑定，防止测试数据自动上传到 prod。
- 核对抖音正式运行版本识别，保留模拟器/预览与正式采集的边界。
- 构建包含 PK 入口隐藏的 A 槽生产候选包；云端和手机验收通过前不声明正式上线完成。

这份交付只完成云函数准备。服务端本地测试使用 Mongo 替身，真实网络、数据库事务、生产权限和手机流程尚未验证。
