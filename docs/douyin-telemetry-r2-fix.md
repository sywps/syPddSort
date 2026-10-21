# 抖音 A 槽 dev 埋点修复 r2

本次修复实验事件误发、关卡加载诊断拒收、内部构建标识误记 browser-dev，以及盛也 SDK 错将 real_openid 和 dy_openid 要求相等。

## 你需要做的顺序

1. 在抖音云选择 `env-nvk6FNcrq5`，服务 `pdd-v2-cloudfunc`，确认 **dev**。打开已有 `analyticsCommon.js`，用 `artifacts/douyin-telemetry-dev-r2/functions/analyticsCommon.js` 全文替换并保存。
2. 点击发布到 **dev**。备注可填：`修复关卡加载埋点事件校验 r2`。其他七个函数、package.json、环境变量及四条授权路径无需修改；不必重跑 analyticsSetup。
3. 抖音开发者工具导入 `build/bytedance-mini-game-a-telemetry-dev-r2`。这是新目录，不要继续预览旧目录。构建标识：`douyin-a-telemetry-dev-20261010-r2`。
4. 使用真机预览二维码打开游戏，完成“启动 → 玩一关并通关 → 下一关 → 返回首页 → 切后台再回来”。无需清手机缓存或删除隔离记录。
5. 在这次手机的调试控制台运行下面的只读检查，把输出复制为文字发给我。普通模拟器读不到手机队列。

```js
(() => {
  const read = key => {
    const raw = tt.getStorageSync(key);
    return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  };
  const key = 'pdd.analytics.delivery.douyin_dev.v1';
  const buildId = globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId;
  const rows = read(key + '.quarantine');
  console.log(JSON.stringify({
    buildId,
    sdk: globalThis.__PDD_DOUYIN_SYSDK__?.getDiagnostics?.(),
    pendingThisBuild: read(key).filter(x => x.data?.clientBuildId === buildId).length,
    quarantinedThisBuild: rows.filter(x => x.data?.clientBuildId === buildId).map(x => ({
      functionName: x.name, eventName: x.data?.eventName, reason: x.reason
    })),
    historicalQuarantineCount: rows.filter(x => x.data?.clientBuildId !== buildId).length
  }, null, 2));
})();
```

预期：buildId 是 r2；SDK loginReady 为 true、loginError 为空；正常联网等待上报后 pendingThisBuild 为 0、quarantinedThisBuild 为空。历史隔离条数可能仍不为 0，这是保留证据，不能据此判定新包失败；pending 为 0 单独也不能证明云端入库。

6. 再在云函数控制台执行 `analyticsReport`，传入 `{"date":"2026-10-10"}`（若已跨天则填手机测试的北京时间日期），把结果发来。随后对新会话导出核对：加载开始/成功已入库，experiment 事件未发，顶层及 extra 的 clientBuildId 均为 r2。当天摘要可能混有旧包数据，不能把摘要总量当成本次测试量。

## 验证边界

助手负责本地修复、回归、构建及产物核对；你负责 dev 发布和真机预览。未代为部署云端，未正式发布，未上传 CDN。本次未修改关卡/皮肤等资源。

合作/PVP/回放埋点仍暂停。正式环境采集仍关闭。历史隔离数据不自动删除或重放；截图截断的其余记录仍需完整文本才能逐条判断。

`pch_level3_first_action_after_guide` 的旧命名与实际触发范围问题不属于这次拒收/登录修复，本轮未更改其统计含义；不能按名称当成第三关专属事件。
