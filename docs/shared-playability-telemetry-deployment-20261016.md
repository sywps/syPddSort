# 共用可玩性恢复与埋点部署（2026-10-16）

## 微信

本批故障/恢复事件仅改客户端，未修改 `cloudfunctions/addFunnelEvents/index.js`。
该接收器接受非空事件名，并保留 success、errorCode、errorMessage、extra.requestId 等字段，新增这些事件不要求新增云函数、集合或索引。

如果线上已是仓库这版通用接收器，无需为本批再次部署；需要重新构建并发布客户端包，新事件才会由玩家端发出。线上代码版本本轮没有读取比对，因此不能确认用户更早未部署的埋点变更是否也兼容。若线上仍是旧接收器，应先比对/同步 addFunnelEvents，不要把本批“无需改云端”等同于历史改动全部已上线。

## 抖音需要操作

本批客户端仍沿用已配置的独立埋点 dev 链路，不启用新的正式采集环境，不修改业务云或微信云。

1. 在抖音云环境 `env-nvk6FNcrq5`、服务 `pdd-v2-cloudfunc` 的 **dev** 中，先保留当前已发布版本作为回退版本。
2. 用 `artifacts/shared-playability-telemetry-20261016/functions/analyticsCommon.js` 更新同名文件。
3. 确认同目录有 `adminAuth.js`，且与交付目录中的文件一致；缺失或版本不一致时一并更新。这是当前接收器既有依赖，本批未更改其鉴权逻辑。
4. 保存并发布 dev，备注可填：`共用关卡恢复诊断：失败原因、请求号、目标关卡`。
5. 不改环境变量、MongoDB库、访问路径、package.json，不运行初始化/迁移，不部署到 prod。原 addFunnelEvents.js 等入口继续调用 analyticsCommon，无需替换入口。
6. 云端发布完成后，用重新构建、启用相同埋点配置的抖音客户端测试。旧客户端不会自动获得恢复逻辑；本轮未构建或上传任何客户端。

交付文件SHA256见同目录 `manifest.json`。不要用更早r5接收器覆盖此文件：旧白名单不接受本次新增事件。

## 验收

- 正常冷启动、开始游戏、连续过关、回首页；切后台再恢复；重复点击开始/下一关不应重复扣体力。
- 测试包制造关卡请求失败后恢复网络，检查仍进入目标原关；准备耗尽时原结算可重试，初始化失败返回首页并补偿一次。无有效缓存时持续离线无法保证目标关可玩。
- 模拟可选音频/特效失败时原关操作仍可用，失败事件 success=false。
- 服务端 `first_level_funnel` 应出现本次时间之后的新事件，核对客户端 buildId、source、errorCode/errorMessage、extra.requestId 和 extra.targetLevelId。
- 新恢复诊断使用 page=app，roundId为空，levelId/logicalLevelId/physicalLevelId为0；目标关卡放在 extra.targetLevelId，避免继承上一局的roundId。这些是技术诊断，不计作新一局或通关。
- 断网后恢复时检查重传回执、同一eventId不重复写入；检查隔离记录是否新增 INVALID_EVENT。队列清空本身不能证明服务端收到，应结合云端查询。
- level_resources_prepared 仅表示资源准备完成；level_recovery_playable 才表示发生失败之后恢复到可操作状态，两者不可混用。

本地已测试真实客户端上报器/AnalyticsMgr/持久队列/传输/接收器逻辑，网络与MongoDB使用替身。线上发布、真实云端回执、两端真机及构建验收尚未执行。
