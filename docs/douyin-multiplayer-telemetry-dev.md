# 合作/PVP 埋点 dev 更新（r7）

本轮仅接埋点，不迁移合作/PVP玩法服务，不开启回放上传，不发布 prod。

当前真实限制：CoopServiceMgr 仍限定微信服务；抖音业务云没有接入 pvpService。因此手机目前能验收大厅入口和真实服务失败记录；完整对局要等玩法服务迁移后才能验收，不能把本地自动测试当成抖音真机开局成功。

## 我已准备的内容

- 合作/PVP 局内事件允许进入现有埋点通路，并带各自 gameplayEntryMode，避免共用主题/主线代码导致归属错误。
- `multiplayer_lobby_open`：打开入口，不关联上一局；不计作开局。
- `multiplayer_service_result`：服务调用结果；当前未迁移导致的失败仍保持失败，仅记录动作名、成功与否和耗时，不带请求体或回放。
- `multiplayer_round_end`：本地对局结束观察。合作 completed；PVP win/lose/draw；`extra.resultSource=local_observation`。不是服务器确认的排名、奖励或主线通关。
- 退出局仍使用带模式的 level_record；局内过程/广告/结算沿用现有事件。主题和外部玩法仍不开放。
- 后台本地保存、前台补传保留；回放、逐步操作和时间线字段仍拒收；业务回放接口未开放。
- 本地报表新增 multiplayer.json，云摘要新增 funnelEventsByMode，主线漏斗继续单独统计。

## 你先做：更新 dev 服务两个文件

打开环境 **env-nvk6FNcrq5 → dev → 原函数服务**（服务 ID `1m0ub3f29wtv7`）。

在代码编辑区找到下列文件，分别全选替换为交付目录内同名文件的完整内容：

| 代码文件 | 完整替换内容 |
|---|---|
| analyticsCommon.js | [打开完整内容](D:/code/xyx/syPddSort/artifacts/douyin-multiplayer-telemetry-dev-r7/functions/analyticsCommon.js) |
| analyticsReport.js | [打开完整内容](D:/code/xyx/syPddSort/artifacts/douyin-multiplayer-telemetry-dev-r7/functions/analyticsReport.js) |

analyticsCommon.js 是共用代码文件，不是要新增授权路径的函数。两个文件保持与现有 analyticsIdentity.js、addFunnelEvents.js 等文件同层。

保存后，确认顶部仍为 **dev**，点击「发布」。备注：`dev 合作PVP埋点接入，回放上传保持关闭`。

无需更换 package.json、环境变量、MongoDB 配置或数据库索引；不新增访问路径；不部署 coopService/pvpService；不操作 prod。

## 你再做：确认云端版本

在函数控制台测试现有 `analyticsReport`，参数：

```json
{"date":"2026-10-10"}
```

日期可改为当天北京时间。返回必须包含：

```json
{
  "ok": true,
  "telemetryScopeVersion": 2,
  "acceptedGameplayModes": ["main", "coop", "pvp"],
  "replayUploadEnabled": false,
  "analyticsEnvironment": "douyin_dev"
}
```

这是完整返回中的部分字段，不是需要粘贴到游戏控制台的代码。版本字段来自共用校验文件，用来核对两个文件都已生效。若缺少字段或返回失败，先保留 r6 测试，不扫码 r7，把实际结果发给我。

## 云端确认后：手机测试 r7

1. 开发者工具导入 `D:\code\xyx\syPddSort\build\bytedance-mini-game-a-business-dev-r7`，预览并重新扫码。版本为 `douyin-a-business-dev-20261010-r7`，A 槽，dev 环境。
2. 正常进一局主线，再返回首页，分别打开合作和 PVP 入口。未接入服务的提示目前是预期限制；不用反复尝试匹配，也不要用模拟成功替代。
3. 切后台约 20 秒再回来，前台等待约 20 秒。不重启，在手机真机控制台执行：

```js
console.log(JSON.stringify(
  globalThis.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot(), null, 2
));
```

4. 把输出发给我。我核对新事件确认、后台请求、队列和错误；必要时用现有 analyticsExport 按 r7＋测试时间导出，确认合作/PVP 没有混入主线。

如果旧云端误收了 r7，拒收记录可能进入 quarantine。不要清空或手动重放旧记录，先发错误给我。

## 测试包范围与验证边界

r7 使用已验证的 r6 资源和代码基础，加本轮埋点改动。工作目录另有 DouyinSidebarGuidePanel.prefab 与 GameplayResultPanelController.ts 修改，这次隔离构建未纳入，也未覆盖它们。

本地测试覆盖实际 AnalyticsMgr→传输→Mongo接收器、真实服务失败调用、入口/终局调用、回放字段拒收、模式分离、账号隔离、逐条确认和前后台队列；接口数据库为测试替身。真机与真实云端仍需上述用户步骤。

既有 `coop-ui` 测试缺少 AnalyticsMgr 模拟依赖，`pvp-service-core` 有布局文本断言失败；已用修改前源码复现相同失败，本轮未改这些旧问题。相关 UI 绘制不能据此视为已完成验证。

最终 r7 已完成构建及产物核对：1117 个文件，25544841 字节，A/dev，prod 未开启；包内实际编译的玩法过滤与上传队列回归均通过。相关源码类型检查无错误。云端发布和手机验收尚未执行。
