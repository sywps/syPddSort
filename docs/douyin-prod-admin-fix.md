# prod 管理函数鉴权修复

> 2026-10-11 已更新为完整文件复制、中文错误提示和本地密钥辅助操作页。当前请按 [手动初始化说明](douyin-prod-manual-setup.md) 操作，无需再执行下方旧版 PowerShell 生成步骤。

## 原因与边界

抖音官方「云函数如何调试」说明：PROD 在线调试调用的是线上接口。旧代码以 `trigger !== 'online'` 排除线上请求，因此控制台的 businessSetup 也会返回 ADMIN_CONSOLE_REQUIRED。

官方文档：https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/cloud-service/cloud-function-service-manage/cloud-function-debug

修复后，prod 的 businessSetup、analyticsSetup、analyticsReport、analyticsExport 必须携带独立管理员密钥，不能仅凭 test/console 标记绕过。dev 原有后台测试方式保持兼容。玩家登录、存档和埋点接口不使用这把密钥。

本地测试通过不代表已在云端部署或数据库验证成功。本轮不构建游戏包。

## 1. 你在 dev 新增/替换三个文件

切到 dev 原服务，在现有业务和埋点函数的同一目录：

| 操作 | 文件 | 完整内容位置 |
|---|---|---|
| 新增 | adminAuth.js | artifacts/douyin-prod-admin-fix/functions/adminAuth.js |
| 替换全部内容 | businessCommon.js | artifacts/douyin-prod-admin-fix/functions/businessCommon.js |
| 替换全部内容 | analyticsCommon.js | artifacts/douyin-prod-admin-fix/functions/analyticsCommon.js |

必须先添加 adminAuth.js，再替换两个公共模块，并将三个文件一起发布。无需修改 package.json，不添加依赖。不替换 businessSetup.js 等入口文件。

dev 环境变量保持不变。发布备注：`修复prod管理函数鉴权，使用独立管理员密钥`。发布后 dev 运行 businessSetup（Body `{}`）和 analyticsSetup（Body `{}`），都应 ok:true，环境仍是 douyin_dev。

## 2. 你在本机生成一次管理员密钥

打开 Windows PowerShell，执行以下命令（生成 32 随机字节，转成 64 位小写十六进制字符串并复制到剪贴板，不在终端打印）：

```powershell
$pddAdminBytes = New-Object byte[] 32
$pddAdminRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$pddAdminRng.GetBytes($pddAdminBytes)
$pddAdminRng.Dispose()
$pddAdminToken = ($pddAdminBytes | ForEach-Object { $_.ToString('x2') }) -join ''
Set-Clipboard -Value $pddAdminToken
```

将它保存到你自己的密码管理器中。后面的环境变量和 Headers 使用**同一串**，不要分别再生成一次。不要发送到聊天、放入客户端、代码或截图。代码要求精确的 64 位小写十六进制字符串，不包含引号和前后空格。

## 3. 你将新版本部署到 prod

切到 prod（env-XzE6JatzwX，服务 ID 已从截图确认是 1m0ub3f29wtv7），选择**本轮第 1 步发布的新 dev 版本**，不要仍选择 30。

保留原五项配置：CLOUD_ENV=PROD、BUSINESS_ENVIRONMENT=douyin_release、ANALYTICS_ENVIRONMENT=douyin_release、MONGODB_DB=pdd_douyin_prod、实际 MONGODB_URI。

新增环境变量：

| 名称 | 值 |
|---|---|
| DOUYIN_ADMIN_TOKEN | 粘贴第 2 步生成并保存的密钥 |

发布备注：`prod管理函数密钥鉴权修复`。完成发布并等待生效。

## 4. 你在 prod 在线调试填写 Headers

选择 businessSetup.js，POST，Body 填 `{}`。保留原调试来源选项，不需要绑定游戏账号来取得管理员权限。

点击 **请求参数区域**的 `Headers`（在 Body、Query 旁边，不是下方运行结果的 Headers），添加：

| 请求头名称 | 请求头值 |
|---|---|
| x-pdd-admin-token | 与 prod DOUYIN_ADMIN_TOKEN 完全相同的密钥 |

点击「调试」。成功应返回 ok:true、reason:BUSINESS_READY、transactionsVerified:true、businessEnvironment:douyin_release。

成功后使用同一请求头运行：

- analyticsSetup.js，Body `{}`：预期 ok:true / INDEXES_READY / douyin_release。
- analyticsReport.js，Body `{"date":"2026-10-10"}`（日期替换为实际当天）：预期 ok:true / douyin_release。
- 以后 analyticsExport 也需同一管理员请求头，原 Body 查询参数不变。

发给我的只有返回 JSON，不包含请求头和密钥。ADMIN_CONSOLE_REQUIRED 现在也表示缺少/错误的管理员凭据：先检查新版本、prod 环境变量是否生效、请求头填写区域和值是否一致。密钥放进 Body 不会生效。若通过鉴权后出现数据库错误，再按实际错误检查连接和事务，不能将鉴权通过当作数据库已验证。

## 5. 访问路径配置

正常游戏仍只长期开放七条路径：/businessIdentity、/syncUserState、/updateUserProfileAssets、/analyticsIdentity、/addBehaviorData、/addFunnelEvents、/saveLevelRecord；外网域名保持关闭。adminAuth、公共模块、旧测试函数不开放。

prod 在线调试是线上调用，因此路径授权开启后，管理调试也**可能**先被网关挡住。先使用第 4 步测试，不能把网关拒绝误判为密钥错误。如果明确返回路径未授权/forbidden：

1. 仅在需要时，临时添加精确路径 `/businessSetup`（名称 businessSetup），限定当前小游戏 AppID；不开放域名，不添加通配路径。
2. 必须仍携带管理员请求头。普通游戏请求没有密钥，仍会被函数拒绝。
3. 本次初始化完成后移除该临时授权路径。analyticsSetup 同理；查询时按需临时授权 analyticsReport 或 analyticsExport，操作后移除。

这与此前“绝不添加管理路径”的说明不同：现在管理函数已有独立密钥验证，临时精确授权只解决网关可达性，不授予普通玩家管理权限。是否需要这一步以实际网关返回为准，尚未实测。

不要为解决调试问题关闭路径限制或对所有路径放行，也不要删除鉴权代码。密钥可在 prod 环境变量中更换并使配置生效，旧密钥随后失效。

## 验证记录

已执行真实四个管理函数的本地授权测试：正确密钥可执行、缺少/错误/数组/重复请求头/Body 伪造均在读库前拒绝、prod test/console 标记不能绕过、更换密钥后旧值失效、业务接口仍要求正常网关身份、不回显或持久化密钥。另通过 dev 业务/埋点回归、prod 云适配及导出/调用方测试。MongoDB 使用测试替身，真实生产控制台和网络仍待上述操作验证。
