# 抖音 A 槽 business dev r2：埋点归属修复

本轮修复资料页广告、通关结算分享的 INVALID_EVENT。SDK 4001 仅增加错误原因诊断，尚不能证明供应商拒绝原因已解决。

## 第一步：你替换一个云端文件并发布 dev

1. 打开抖音云，环境 `env-nvk6FNcrq5`，服务 `pdd-v2-cloudfunc`，确认顶部为 **dev**。
2. 找到已有的 **analyticsCommon.js**，用下面本地文件的全部内容替换：
   `D:\code\xyx\syPddSort\artifacts\douyin-business-dev-r2\functions\analyticsCommon.js`
3. 保存，点击「发布」。发布备注填：`business r2 修复资料广告及结算分享埋点归属`。等发布成功后再进行第二步。

本次只替换这个公共模块。无需新建云函数、增加访问路径、修改环境变量或 package.json。业务初始化已由你验证 BUSINESS_READY / transactionsVerified=true，无需重建集合或重跑初始化。业务路径 `/updateUserProfileAssets` 的路径名称使用 `profile-assets`（20 字符以内）；已配置成功则不必重配。

## 第二步：你导入新包并手机扫码

抖音开发者工具切换到新目录：

```text
D:\code\xyx\syPddSort\build\bytedance-mini-game-a-business-dev-r2
```

这是连接 dev 的联调包，不能作为正式生产包发布。预览并用同一抖音账号扫码；不清缓存、不删除历史隔离记录。手机真机调试 Console 执行：

```js
console.log(globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId);
```

应显示 `douyin-a-business-dev-20261010-r2`；若仍是 r1，先检查导入目录和预览二维码。

## 第三步：你记录时间后复测

在手机真机调试 Console 执行：

```js
tt.setStorageSync('pdd.analytics.businessR2.verifySince', Date.now());
```

退出再打开同一个包，重新连接真机调试，依次操作：

1. 打开资料页，对可广告解锁的头像、头像框各完成一次广告操作；真实广告可用时测试完整观看，再测试中途关闭。完整领奖应只计一次，关闭不增加解锁进度。
2. 主线通关，在结算页点击分享领奖，完成分享返回。检查奖励仅发一次，然后进入下一关。
3. 彻底退出再进入，检查装备的头像/框及金币、道具、关卡进度保留。
4. 保持网络可用，执行下面检查，把 JSON 输出发给我。

```js
(() => {
  const since = Number(tt.getStorageSync('pdd.analytics.businessR2.verifySince'));
  if (!since) throw Error('先记录 business r2 测试开始时间');
  const buildId = globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId;
  if (buildId !== 'douyin-a-business-dev-20261010-r2') throw Error('当前不是 business r2 新包');
  const key = 'pdd.analytics.delivery.douyin_dev.v1';
  const read = k => {
    const raw = tt.getStorageSync(k);
    const rows = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    if (!Array.isArray(rows)) throw Error('队列格式异常：' + k);
    return rows;
  };
  const current = x => x.data?.timestamp >= since && x.data?.clientBuildId === buildId;
  const pending = read(key), quarantined = read(key + '.quarantine');
  console.log(JSON.stringify({
    since, buildId,
    sdk: globalThis.__PDD_DOUYIN_SYSDK__?.getDiagnostics?.(),
    pendingSinceTest: pending.filter(current).length,
    quarantinedSinceTest: quarantined.filter(current).map(x => ({
      eventName: x.data?.eventName, reason: x.reason, source: x.data?.source,
      page: x.data?.page, hasRoundId: !!x.data?.roundId
    })),
    previousQuarantineCount: quarantined.filter(x => !current(x)).length
  }, null, 2));
})();
```

预期 pendingSinceTest 为 0、quarantinedSinceTest 为 []。历史 5 条 r1 及更早隔离记录会保留，不要求总数归零。本轮没有自动重放它们。SDK 若再次返回 4001，会出现 `lastAdReportRejection: {code:4001,message:...}`，记录经过截断和脱敏的供应商原因；缺少 msg 时 message 为空。该字段只表示当前运行期间最近一次拒绝，不代表每次都失败。不要复制 SDK 请求全文或密钥。

## 第四步：云端核对入库（我分析，你导出）

队列清空本身不足以证明完整成功。在 dev 的 `analyticsReport` 测试运行中填写实际测试日期，例如 `{"date":"2026-10-10"}`，把结果发给我。随后用 `analyticsExport` 导出 `user_behavior` 和 `first_level_funnel`，固定使用同一个 capturedAt，按 nextCursor 分页至 hasMore=false。

我会按本轮 since 和新 buildId 核对：
- 资料页广告 roundId 为空、关卡为 0，广告事务编号保留。
- win_bonus_reward 的 share_click / share_success 指向同一实际通关局，与 level_record 对得上。
- 旧 r1 缺少局次的分享若后续人工重放，会明确标为 `extra.roundAttribution=legacy_missing`，仅用于事件接收核对，不推断局次。当前不会重放。

本地报表已排除资料页广告和 legacy_missing 记录对局次指标的影响；事件总数仍如实保留。

## 边界与已有问题

本轮不改变发奖逻辑、SDK 请求参数、自动重试策略；合作/PVP 埋点和回放上传继续暂停。CDN 资源不因这次埋点修改而新增上传。线上效果以发布后的手机复测及云端记录为准。

类型检查还发现一处修复前就存在的独立问题：RewardedAdProvider 的广告加载超时分支调用已不存在的 shouldSimulateDevtoolsCompletion，可能在超时时抛错。本轮保留原有修改，未改动这个广告超时分支；它不属于这 5 条 INVALID_EVENT 的成因，需要单独处理。
