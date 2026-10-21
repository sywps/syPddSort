# 抖音上传诊断（r6，dev A 槽）

r6 在游戏进入后台后继续记录和保存埋点，暂停新身份请求和新上传请求；回到前台后按原有重试间隔恢复发送。身份请求在后台返回时，也不会继续发起上传。已经发出的请求仍正常处理成功、失败和超时。沿用 r5 的 `retryOf` 数组兼容修正。

## 内容和边界

本次只调整抖音埋点发送时机，不改变云函数、埋点格式、超时阈值、退避间隔、奖励或旧隔离记录。无新增云访问路径，无需重新部署云函数或上传 CDN。微信未接入暂停开关。

快照新增 `uploadPaused`（是否暂停新请求）和 `pendingCount`（等待确认的事件数）。回到前台后应为 `uploadPaused: false`；后台期间队列增加是正常现象。后台前已发出的请求仍可能超时，本修改不承诺消除所有网络超时。

每次身份确认、事件上传记录：接口、起止时间、耗时、前后台状态及期间切换次数、事件 ID/名称、结果、固定错误分类和重试关联。耗时包含客户端等待/挂起，不等于服务器执行耗时。

身份确认成功用 identity_ready，队列检查用 validated；只有匹配云端逐条确认的事件才用 acknowledged。失败记录 retryResults 对应后续重试；recoveredEventIds 为确认补传成功的事件。rejectedIds 表示隔离拒收，不能算补传成功。身份成功不代表事件成功。

最多保留最近 100 次结束的操作、最近 20 次失败、1000 个待重试关联。仅当前运行内存保存，重启会清空诊断，不清除上传队列。未知前后台状态显示 unknown；有生命周期回调后更新，不猜测状态。droppedRetryLinks 非零说明关联记录达到上限。不要输出原始存档/凭证/平台用户 ID。

## 用户操作

1. 导入 `build/bytedance-mini-game-a-business-dev-r6`，通过抖音开发者工具预览，用手机扫码。版本应为 `douyin-a-business-dev-20261010-r6`。
2. 手机连接真机调试后，在对应手机的控制台执行以下代码，记录开始时间（勿用桌面模拟器代替）：

```js
(() => {
  const d = globalThis.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__;
  if (!d || d.getSnapshot().buildId !== 'douyin-a-business-dev-20261010-r6') {
    throw Error('请确认手机打开的是 r6 诊断包，并已完成启动');
  }
  globalThis.__PDD_UPLOAD_CHECK_START__ = Date.now();
  console.log('诊断开始', globalThis.__PDD_UPLOAD_CHECK_START__);
})();
```

3. 正常玩一局并打开一次激励广告，返回游戏；再把抖音切到后台约 20 秒，切回游戏等待约 20 秒。无需反复看广告或刻意制造超时。
4. 不重启游戏，执行下面代码，将输出复制给 Codex。重点检查后台是否新发起请求、回前台后是否补传。若队列尚未清空，再等约 60 秒取一次结果；不能仅凭待传数为零判定全部成功，还要核对隔离和逐条确认。

```js
(() => {
  const since = globalThis.__PDD_UPLOAD_CHECK_START__;
  const api = globalThis.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__;
  if (!since || !api) throw Error('请先记录测试开始时间，且不要重启游戏');
  const d = api.getSnapshot();
  const key = 'pdd.analytics.delivery.douyin_dev.v1';
  const read = k => {
    const raw = tt.getStorageSync(k);
    return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  };
  console.log(JSON.stringify({
    since, buildId: d.buildId, capturedAt: d.capturedAt,
    state: d.state, runtimeOnly: d.runtimeOnly,
    uploadPaused: d.uploadPaused, pendingCount: d.pendingCount,
    droppedRetryLinks: d.droppedRetryLinks,
    unresolvedRetryLinks: d.unresolvedRetryLinks,
    failures: d.failures.filter(x => x.endedAt >= since),
    retries: d.recent.filter(x => x.endedAt >= since && x.retryOf.length),
    newNetworkRequestsWhileBackgrounded: d.recent.filter(x => x.startedAt >= since
      && x.stateAtStart === 'background' && x.endpoint !== 'queue_validation'),
    pendingSinceTest: read(key).filter(x => x.data?.timestamp >= since).length,
    quarantinedSinceTest: read(key + '.quarantine')
      .filter(x => x.data?.timestamp >= since)
      .map(x => ({ eventName: x.data?.eventName, reason: x.reason }))
  }, null, 2));
})();
```

如需完整本地记录：`console.log(JSON.stringify(globalThis.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot(), null, 2))`。

## 验证

本地自动测试覆盖后台保存但不发请求、身份等待中进入后台、上传中进入后台、重复前后台回调、回前台时仍有请求在途、恢复后的账号核对、退避和逐条确认，以及 15 秒外层超时与迟到响应。真实手机后台挂起与网络异常仍需上述真机步骤确认。

新增诊断测试、douyin-telemetry、analytics-v2、level-analytics-session-lifecycle 均通过；类型检查修改前后均为 0 错误。旧 runtime-diagnostics-telemetry 测试缺少 BrowserLevelPreview 模拟依赖，修改前源码复跑也同样失败，本次未改动该旧测试。

实际编译代码回归命令：`node tests/douyin-upload-diagnostics.test.js build/bytedance-mini-game-a-business-dev-r6`。读取包内上传队列、诊断类和真实 Cocos Babel helper，执行同一套行为检查；手机验收由用户完成。

r6 已完成本地构建、上述实际编译代码回归、源码及复制产物哈希检查、A/dev/版本配置检查。主包1714KB，启动下载3625KB。手机验收待完成。
