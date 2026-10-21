# prod 手动初始化：当前执行方案

2026-10-11 用户选择手动方案。本说明替代此前的自动初始化建议和旧交付步骤。

## 这次改了什么

保留上线前管理员手动运行初始化、玩家登录只检查是否就绪的设计。现有管理密钥校验保持不变；补上中文失败原因和版本标记，避免所有失败只显示 ADMIN_CONSOLE_REQUIRED。统计函数在管理员验证通过后，错误的数据库配置会单独返回 CONFIG_NOT_READY。

管理密钥由操作者在本地操作页生成或使用已有值，不通过聊天传递、不放进游戏包。本地操作页不会联网、自动上传或保存密钥；关闭页面会丢失未保存的值。

## 操作顺序

1. 用 Chrome 打开交付目录的 `操作页.html`。按下拉框依次复制 **8 个完整文件**（包含 businessCommon 依赖的 chapterRewardSync.js），在 dev 同名文件中替换全部内容（缺少的文件新建），放在原同一目录。保留其他文件、dev 配置和后台原 package.json。
2. 一起发布，备注 `manual-prod-20261011`。dev 运行 businessSetup、analyticsSetup，Body 均为 `{}`，两项都返回 ok:true 后，记下成功版本号。
3. 操作页生成一份管理密钥或使用你已保存的有效值。切到 prod，选择刚验证的版本，在发布设置按下表配置并发布生效。
4. prod 依次调试 businessSetup、analyticsSetup，POST、Body `{}`；两项请求参数 Headers 都添加 `x-pdd-admin-token`，值使用操作页同一份密钥。

| prod 配置 | 值 |
|---|---|
| 环境 ID | env-XzE6JatzwX |
| 服务 ID | 1m0ub3f29wtv7 |
| CLOUD_ENV | 平台提供 PROD，不伪装成 DEV |
| BUSINESS_ENVIRONMENT | douyin_release |
| ANALYTICS_ENVIRONMENT | douyin_release |
| MONGODB_DB | pdd_douyin_prod |
| MONGODB_URI | prod 能访问的实际数据库连接信息，凭据仅在后台输入 |
| DOUYIN_ADMIN_TOKEN | 操作页生成或采用的同一份管理密钥 |

不迁移 dev 玩家数据，不猜测数据库连接信息，不覆盖平台的完整 package.json；依赖仍为 mongodb 4.17.2。

## 两项成功标准

- businessSetup：ok:true、transactionsVerified:true、businessEnvironment:douyin_release。
- analyticsSetup：ok:true、reason:INDEXES_READY、analyticsEnvironment:douyin_release。
- 两项均有 manualSetupRevision:manual-prod-20261011。没有标记时不能据此认定新版已生效。

初始化可重复执行；只清理本次随机命名的检查记录，不删除玩家数据。公共文件 adminAuth、businessCommon、analyticsCommon、businessRules 不能单独运行。

## 看返回结果即可，不必找代码

| 返回 | 含义与处理 |
|---|---|
| adminReason:ADMIN_TOKEN_NOT_CONFIGURED | prod 管理密钥未配置、格式不符或尚未发布生效 |
| adminReason:ADMIN_HEADER_REQUIRED | 请求参数 Headers 未带密钥 |
| adminReason:ADMIN_HEADER_INVALID | 重复请求头或格式不符 |
| adminReason:ADMIN_TOKEN_MISMATCH | 两处密钥不同，或配置还未生效 |
| CONFIG_NOT_READY | 管理员验证已通过，但数据库或环境配置不正确 |
| DATABASE_FAILED | 数据库操作失败，尚未通过初始化 |
| TRANSACTIONS_UNAVAILABLE | 数据库不支持所需事务，不能跳过该检查 |
| user forbidden / 13010 | 平台访问路径问题；保留原限制，提供结果后逐项处理 |

只提供返回结果，不提供密钥、请求头截图或连接串。不要为了调试关闭路径限制或添加通配路径；如确有网关拒绝，再核对最小管理路径授权。长期玩家访问路径保持原来的七条业务/统计路径。

## 验证边界

本地测试覆盖真实管理函数、缺失/错误/重复请求头、配置错误、密钥更换、DEV 兼容和登录不能自动初始化。数据库使用测试替身，真实 prod 权限、网络和事务尚未验证。

这次是服务端手动初始化交付。游戏客户端/打包仍限制 dev，初始化成功不代表正式游戏包已完成，之后仍需 prod 客户端适配与真机存档、奖励验证。

官方依据：[prod 在线调试调用已发布线上接口](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/cloud-service/cloud-function-service-manage/cloud-function-debug)。管理密钥是项目自身的保护方式，并非抖音官方规定的字段。
