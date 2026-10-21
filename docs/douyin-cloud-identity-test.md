# 抖音 dev 身份联调测试包

范围：只验证小游戏经抖音云网关调用现有 `/cloudIdentity` 时携带的身份字段。
本测试不连接MongoDB，不启用云存档、章节奖励、排行榜或业务埋点，不更改微信构建。

## 本次交付

- 导入目录：`build/bytedance-mini-game-a-identity-dev`。
- AppID：`ttf45082ed6a36c15802`。
- CDN：A槽，沿用已发布资源。
- 诊断环境：`env-nvk6FNcrq5`；函数服务：`1m0ub3f29wtv7`。
- 业务用 `__PDD_DOUYIN_CLOUD_ENV__` 保持空值，测试独立使用 `tt.createCloud`。

## 用户操作

1. 在抖音开发者工具导入上述目录，确认AppID匹配。不要导入旧的 `bytedance-mini-game` 或原A包。
2. 编译启动，约2.5秒后自动开始诊断。网络请求最多等待约16秒，完成后显示结果弹窗。
3. 开发者工具先确认请求能到达服务；“身份字段检查通过”只证明本次调用字段匹配，开发者工具结果不能替代手机验证。
4. 点击开发者工具“预览”，用已登录抖音App的手机扫码。启动后无需通关，等身份测试弹窗出现，将弹窗截图发回。
5. 没有弹窗时，查看Console中 `[CloudIdentityTest]` 日志；真机可使用开发者工具真机调试。可复制执行：

```js
JSON.stringify(globalThis.__PDD_CLOUD_IDENTITY_TEST_RESULT__, null, 2)
```

如需手动再测一次：

```js
globalThis.__PDD_RUN_CLOUD_IDENTITY_TEST__()
```

正在请求时重复点击不会重复发请求。超时之后的迟到回包不会把失败改成成功。

## 结果解释

- `IDENTITY_FIELDS_OK`：HTTP 200、约定回包结构、AppID/环境匹配、source=APP、trigger=online且hasOpenId=true。还需结合手机截图确认真机来源；不代表跨账号隔离或防伪造已经验证。
- `ACCESS_DENIED_13010`：将弹窗或诊断JSON发回，再检查dev服务的 `/cloudIdentity` 授权路径，不要打开数据库公网或放宽整个服务访问权限。
- `OPENID_MISSING`：本次没有账号身份；不能把匿名身份自动当作登录账号。保留日志继续定位。
- `APP_MISMATCH` / `ENV_MISMATCH`：回包对应的应用/环境不符合本测试目标。
- `CALL_SOURCE_UNCONFIRMED`：来源不是预期APP/online，不判为身份验证成功。
- `CREATE_CLOUD_UNAVAILABLE`：当前环境未提供 `tt.createCloud`。
- `REQUEST_TIMEOUT` / `REQUEST_FAILED` / `HTTP_FAILED`：截图提供失败原因和错误码后定位。

输出仅包含状态、布尔值和数值错误码，不打印openid、session_key、原始响应头/错误消息。

## 构建开关

在构建子进程中设置 `PDD_DOUYIN_IDENTITY_TEST=1`，然后执行 `node scripts/build-douyin.js --release --cdn-slot=A`。
业务云环境必须为空。安装器拒绝B槽和启用了业务云的诊断包。普通构建默认关闭该入口。
`--release` 是Cocos优化模式，不表示正式环境发布许可。本诊断包仅用于dev联调，不提交正式版本。

本次构建使用 `.planning/douyin-identity-test-20261010/build-snapshot.cjs`，避免覆盖正在使用的构建包和工作区缓存。
