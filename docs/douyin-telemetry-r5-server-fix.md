# r5 资料失败诊断补丁

截图中 profile_failed 被埋点拒收，是事件名单漏项。其原始失败为“资料云服务不可用，请稍后重试”：资料页调用业务云 init 失败，与当前独立埋点云是否可用是两件事。

## 你操作
1. 在环境 env-nvk6FNcrq5、服务 pdd-v2-cloudfunc 的 **dev** 中，将 analyticsCommon.js 全文替换为 artifacts/douyin-telemetry-dev-r5/functions/analyticsCommon.js。
2. 保存并发布 dev，备注：`r5 补齐资料失败诊断事件`。
3. 继续使用 r2 客户端，无需重新构建或修改环境变量、授权路径、依赖。
4. 按 docs/douyin-telemetry-r4-server-fix.md 复测：先在手机 Console 重新执行 `tt.setStorageSync('pdd.analytics.r4.verifySince', Date.now());`，退出并重新打开同一个测试包，操作关卡、通关/下一关/返回，并打开个人资料页。
5. 使用 r4 文档中的检查代码，复制输出给我。标记键名 r4 只是测试时间存储键，r5 补丁仍复用它。

预期本轮 profile_failed 不再进 INVALID_EVENT 隔离；服务器将其以 success=false、原错误阶段和原因如实入库。历史隔离继续保留、不自动重放。队列清空仍需结合云端报表/导出确认接收。

## 尚未修复的独立问题
资料同步与章节奖励需要业务云。当前包关闭业务云，只启用独立埋点；所以“资料云服务不可用”“通关进度暂时无法同步，章节奖励待确认”仍可能出现。此补丁只修复失败诊断被拒收，不伪造同步/发奖成功，也不启用未验证的业务后端。

SDK loginReady=true 表示供应商登录成功；cloudIdentityVerified=false 是适配器没有为业务云作认证背书的标记，不代表本轮 SDK 登录失败，也不是埋点身份请求的状态。

## 本地验证
新增真实 ProfileDiagnostics 上报函数的七种阶段测试，经真实 AnalyticsMgr/抖音传输/接收器，验证保留失败原因、公共事件不继承局次和一分钟去重。旧接收器复现拒收，新增明确事件名后通过。douyin-telemetry、douyin-telemetry-report、语法检查通过；使用网络/数据库替身，线上发布和真机验收待用户执行。
