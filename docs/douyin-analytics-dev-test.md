# 抖音测试埋点：dev 云函数部署

当前阶段只接一条 `analytics_dev_probe`，验证真机身份 → 云函数 → MongoDB。
合作/PVP相关埋点及回放上传暂不接入，保留玩法入口；不启用业务云环境，不改变微信正式采集、云存档和奖励。

## 1. 本地交付（助手负责）

完整代码：`cloudfunctions-douyin/cloudAnalyticsTest.js`。
这是抖音函数服务入口，不是微信 `exports.main` 云函数。
新函数与现有 `cloudIdentity.js` 同级，不覆盖 `index.js` 或已有诊断函数。

身份只从平台 `context.headers` 读取，校验 APP/online、AppID、环境及账号身份。
仅接受测试事件的六个字段；不接受客户端身份、任意属性、合作/PVP事件或回放。
用户身份以散列值 `subjectId` 存储；回包不暴露账号 ID、数据库连接串或密码。
以环境、应用、用户、eventId生成 MongoDB `_id`，利用默认唯一索引和 `$setOnInsert` 去重。
同 eventId 不同内容拒绝，重复内容回读确认后返回 duplicate=true。

## 2. 后台部署（用户现在做）

1. 打开抖音云，选择 **dev / env-nvk6FNcrq5**。
2. 进入现有函数服务 **pdd-v2-cloudfunc**（服务ID `1m0ub3f29wtv7`）的代码编辑页。
3. 在 `cloudIdentity.js` 所在根目录，新建 **cloudAnalyticsTest.js**；把本地同名文件全部内容复制进去保存。
4. 沿用之前通过 MongoDB 测试的 `MONGODB_URI`、`MONGODB_DB` 和 `mongodb: 4.17.2` 依赖；无需改密码、AppSecret或开放数据库公网。代码要求运行环境 `CLOUD_ENV=DEV`，这是此前诊断使用的环境条件，不要在正式环境手动伪装此变量。
5. 在之前添加 `/cloudIdentity` 的服务授权访问路径配置处，**新增精确路径 `/cloudAnalyticsTest`**，授权当前小游戏访问。保留 `/cloudIdentity`，不要换成公共 HTTP 入口或开放所有路径。身份校验依赖抖音网关可信上下文；本地测试不能证明网关的防伪造行为。
6. 确认仍为dev，点击发布，备注可填：**dev 单条测试埋点入库与去重联调**。
7. 等待发布成功后，将成功状态告诉助手；如果找不到对应设置，发当前页面截图。

不用在函数控制台粘贴 OpenID 模拟请求。云端“在线测试”缺少 APP 网关身份时返回 `APP_GATEWAY_REQUIRED` 是预期拒绝，不代表 MongoDB 故障。

## 3. 真机联调（部署后）

已交付独立A槽埋点测试包：`D:\code\xyx\syPddSort\build\bytedance-mini-game-a-analytics-dev`。
复用本轮用户已通过身份检查的Cocos产物，仅替换独立诊断入口，不重新编译游戏。原身份包保留。
用户在抖音开发者工具导入此目录，AppID使用 `ttf45082ed6a36c15802`，点击预览，用已登录抖音APP的手机扫码。
启动约2.5秒后开始测试：同一 eventId 和完全相同内容串行发送两次，每次请求最多等待16秒。
截图标题“埋点入库与去重通过”、结果 `ANALYTICS_TEST_OK`，同时保留弹窗中的事件编号用于数据库查询。
失败也截完整弹窗，不需要通关。模拟器提示 REAL_DEVICE_REQUIRED 是预期行为，没有写入数据库。
旧身份测试包只调用 `/cloudIdentity`，不会生成测试埋点。

无弹窗时，查看控制台 `[CloudAnalyticsTest]`；真机调试控制台可读取 `globalThis.__PDD_CLOUD_ANALYTICS_TEST_RESULT__`。
手动复测调用 `globalThis.__PDD_RUN_CLOUD_ANALYTICS_TEST__()`：同次启动保持原事件ID/时间戳，正在请求时不会再次发送。
重启游戏将生成新测试事件；不要按整个集合的记录总数判断本次去重，按本次eventId查询。

成功标准：首请求写入并回读；第二请求duplicate=true；数据库中该用户、该eventId只有一条记录。若首请求曾超时但实际已写入，后续确认会是duplicate=true，不能据此声称本次首次写入。

用户当前MongoDB页面只显示实例/账号管理，没有看到数据浏览入口。此前“MongoDB→数据管理”的导航未经核实，不再要求寻找该入口。
改用 `cloudfunctions-douyin/cloudAnalyticsVerify.js` 临时只读函数：回到dev现有函数服务，根目录新建同名文件、复制代码、保存发布；不添加该函数的外部授权路径、不打开数据库公网。
在右侧在线调试选 cloudAnalyticsVerify、POST、Body填 `{}`，点击调试。
函数固定查询手机截图的事件 `probe-mv1vt9ba-6fhj8bx3y430-tsxitt6152k0`，只读countDocuments/findOne，忽略参数；返回数量和字段匹配布尔值，不返回身份或连接串。
预期 `ok=true`、`reason=VERIFY_OK`、`matchingRecordCount=1`、`fieldsMatch=true`。
如果返回 `CONSOLE_ONLY`，先反馈结果核对平台调试上下文，不要删保护或增加公网授权。
如果返回 `EVENT_NOT_FOUND`，核对截图事件编号和当前MONGODB_DB，不认定是入库失败。
集合在第一次成功写入时自动创建；无需手动建表或新建索引。

这只证明测试链路，尚不代表正式游戏事件、运营报表或云存档完成。正式接入范围与正式环境启用另行落实。

## 错误定位

- DEV_ONLY：环境条件未满足，核对实际运行环境，不要删保护直接发布正式环境。
- APP_GATEWAY_REQUIRED / OPENID_MISSING：用手机抖音调用，勿以控制台模拟身份绕过。
- APP_MISMATCH / ENV_MISMATCH：核对应用/环境。
- INVALID_EVENT：测试包请求格式不匹配；合作/PVP/回放也会被拒绝。
- DATABASE_CONFIG_MISSING：核对已有变量是否随本次部署生效。
- DATABASE_FAILED：回传脱敏的stage与errorCode；18是认证失败，不发送完整URI。
- EVENT_ID_CONFLICT：同ID对应了不同内容，不能当成功；应检查客户端是否在重试时重建时间戳或修改事件。
- 13010：检查精确路径 `/cloudAnalyticsTest` 的小游戏访问授权。

诊断只用于dev。联调完成后再清理本函数、测试入口与测试集合；保留数据库配置和驱动。测试集合不会自动出现在原微信运营报表中。
