# r3 云端校验补丁，客户端继续使用 r2

真机确认：timer_started 有局次但未列入名单；level_data_load_start / first_level_json_loaded / first_level_content_load 均在局次建立前发送，被统一的主线局次检查拒收。r2 SDK 登录已成功。

## 你需要操作

1. 环境 `env-nvk6FNcrq5` → 服务 `pdd-v2-cloudfunc` → **dev**，打开已有 `analyticsCommon.js`。
2. 使用 `artifacts/douyin-telemetry-dev-r3/functions/analyticsCommon.js` 全文替换，保存并发布 dev。备注：`r3 修复计时事件及建局前加载埋点校验`。
3. 无需修改其他函数、环境变量、授权路径或依赖。继续导入 `build/bytedance-mini-game-a-telemetry-dev-r2`，无需构建新包。
4. 手机打开 r2，先在真机调试控制台执行：

```js
globalThis.__PDD_R3_CHECK_START__ = Date.now();
```

5. 在同一调试会话内完成“进入关卡 → 操作触发计时 → 通关 → 下一关 → 返回首页”。随后执行以下只读检查并复制输出给我：

```js
(() => {
  const since = globalThis.__PDD_R3_CHECK_START__;
  if (!since) throw Error('请先记录测试开始时间，再执行一轮操作');
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

正常联网等待上报后，应没有本次新增隔离记录。若关闭/重启游戏，需重新记录开始时间并重做操作。这个检查不覆盖记录时间以前的冷启动事件；完整核验仍须用云端 analyticsReport 和导出记录核对本次会话的 timer_started、加载事件及通关记录。

旧 r2 的 4 条隔离记录仍保留，客户端 buildId 仍是 r2；不能继续以“本构建隔离总数必须为 0”判定本次补丁。历史隔离记录不会自动恢复上传，也没有删除。

## 范围及验证

仅补 timer_started 名单，并对 addFunnelEvents 中来源、页面、正整数关卡均匹配的明确加载事件允许没有 roundId；不补造局次，也不把加载次数当成局数。其他主线事件、saveLevelRecord、身份及回放边界保持校验。

本地测试复现了旧代码拒收，并验证补丁后的加载成功/失败、结算后加载、bootstrap 无 page 加载、重复上报去重、错误来源/页面/关卡和无局次结算拒收。使用网络与数据库替身，云端发布后仍需上述手机与数据库对账。

“章节奖励待确认”属于独立业务云未接通问题，本补丁不修改章节发奖或宣称奖励已到账。合作/PVP/回放埋点仍暂停。
