# r4 云端加载诊断补丁

继续使用客户端 `douyin-a-telemetry-dev-20261010-r2`。

## 发布
在抖音云环境 `env-nvk6FNcrq5`、服务 `pdd-v2-cloudfunc` 的 **dev** 中，用 `artifacts/douyin-telemetry-dev-r4/functions/analyticsCommon.js` 全文替换同名文件并保存、发布。

备注：`r4 补齐启动加载诊断及贴图失败字段校验`。

不需修改其他函数、环境变量、授权路径或 package.json，不需重建客户端。

## 包含冷启动的复测
1. 当前手机真机调试 Console 执行下列语句。它仅写入一个独立的测试时间标记，不更改存档或清除隔离记录：

```js
tt.setStorageSync('pdd.analytics.r4.verifySince', Date.now());
```

2. 退出并重新打开同一个 r2 测试包（不要清理存储），重新连接真机调试，测试进入关卡、操作、通关、下一关、返回首页。
3. 执行以下检查，将输出复制给我。这个时间标记跨重启保留，因此包含本轮冷启动阶段，不会漏掉 startup_diagnostics。

```js
(() => {
  const since = Number(tt.getStorageSync('pdd.analytics.r4.verifySince'));
  if (!since) throw Error('请先记录 r4 测试时间，再重新打开游戏测试');
  const key = 'pdd.analytics.delivery.douyin_dev.v1';
  const read = k => {
    const raw = tt.getStorageSync(k);
    return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  };
  const rows = read(key + '.quarantine');
  console.log(JSON.stringify({
    since,
    buildId: globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId,
    sdk: globalThis.__PDD_DOUYIN_SYSDK__?.getDiagnostics?.(),
    pendingSinceTest: read(key).filter(x => x.data?.timestamp >= since).length,
    quarantinedSinceTest: rows.filter(x => x.data?.timestamp >= since).map(x => ({
      eventName: x.data?.eventName, reason: x.reason,
      source: x.data?.source, page: x.data?.page, hasRoundId: !!x.data?.roundId
    })),
    previousQuarantineCount: rows.filter(x => !(x.data?.timestamp >= since)).length
  }, null, 2));
})();
```

预期没有新增隔离，正常联网等待上报后 pending 为 0。历史隔离数量不要求为 0，本次不删除、不自动重放。该检查仍需配合云端 analyticsReport/导出确认本次事件已入库；仅队列清空不能证明完整成功。

## 修复与验证范围
- 新增 level_data_startup_diagnostics 到明确加载名单：仅对应 funnel 端点、level_data 来源、level_game 页面及正整数关卡允许无局次。
- 实际调用链的贴图加载失败携带 missingTextureNames 数组；仅这两个贴图失败事件允许最多 32 个、每项最多 80 字符的字符串，按 JSON 文本保存。其他数组、对象型条目、超限数据及回放依旧拒绝。
- 测试从 GameCtrlModules 的实际加载诊断调用点提取事件名，调用真实 FirstLevelRouteModule 上报函数，再经过 AnalyticsMgr、抖音传输和云端接收器。涵盖启动诊断、成功、失败和无局次加载，避免仅测试手写事件清单。
- 本地使用网络/数据库替身。telemetry 和 report 两项测试以及语法检查通过；线上效果待你发布 dev 后真机核对。
- 章节奖励的业务云问题不在本补丁中；合作/PVP/回放埋点继续暂停。
