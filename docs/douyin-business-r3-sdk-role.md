# 抖音 A 槽 dev r3：SDK 角色初始化与广告超时修复

## 这次改了什么

- 现有 businessIdentity 接口返回 sdkRoleId 和 sdkRoleIdVersion=1。规则固定为 SHA256 的 UTF-8 输入 `shengye-role-v1:` + 现有64位玩家身份，取十六进制结果前32位。现有玩家身份仍是 SHA256(JSON.stringify([环境ID, AppID, 可信网关OpenID]))，存档和埋点不换ID。没有新增数据库集合、迁移或清空数据。
- SDK 登录后后台初始化角色，广告统计发送前等待角色确认。调用 reportRoleInfo，成功标准为 HTTP 2xx 且 status=1001；不把仅请求完成视为成功。并发只发一个角色请求，成功后同一次运行不重复上报。总等待上限30秒，超时的迟到回调无效。
- 角色字段采用本游戏无RPG系统的固定映射：role_name=玩家、role_level=1、server_id=1、server_name=默认区服、role_vip=0、role_power=0，report_type=entergame。role_level不是主线关卡编号；没有伪造创建角色、升级、VIP或战力事件。真实供应商响应仍需要这轮手机验收。
- 角色失败会记录错误，下一次新的初始化调用可再尝试；同一广告事务无论失败还是超时都不自动重发，也不补发历史4001。上报失败不会重发游戏奖励。
- 广告加载超时统一返回 technical_error，移除对缺失方法的调用，不模拟播放完成、不发奖励。
- 保留r2资料广告/结算分享归属修复，合作/PVP埋点与回放上传继续暂停。

## 第一步：你更新一个云文件，发布 dev

1. 抖音云环境选 `env-nvk6FNcrq5`，服务 `pdd-v2-cloudfunc`，顶部确认是 **dev**。
2. 打开已有 **businessCommon.js**，用下面文件的全部内容替换并保存：

```text
D:\code\xyx\syPddSort\artifacts\douyin-business-dev-r3\functions\businessCommon.js
```

3. 点击「发布」，备注填写：`business r3 新增SDK固定角色编号`，等待发布成功。

不用新增函数文件，不用修改 businessIdentity.js 包装函数、package.json、环境变量或访问路径；不用重跑 businessSetup。r2 已发布的 analyticsCommon.js 保持即可。本次不上传CDN。

## 第二步：你导入新包并手机扫码

开发者工具导入：

```text
D:\code\xyx\syPddSort\build\bytedance-mini-game-a-business-dev-r3
```

用同一抖音账号预览扫码，保持网络可用，不清缓存。此包业务云和埋点都连接dev，不能作为生产包发布。

手机真机调试 Console 先执行：

```js
(() => {
  const build = globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId;
  if (build !== 'douyin-a-business-dev-20261010-r3') throw Error('请先导入并扫码 business r3 包');
  tt.setStorageSync('pdd.analytics.businessR3.verifySince', Date.now());
  console.log('已记录本轮开始时间', build);
})();
```

然后退出并重开同一个包，重新连接真机调试，等待登录完成。

## 第三步：你实际完成广告，再运行诊断

1. 打开资料页，选择一个可以广告解锁的头像或头像框，完成一次真实广告观看和领奖。
2. 再尝试一次广告，中途关闭，确认未增加领奖进度。
3. 完成一次结算分享领奖，确认只领取一次。
4. 在**退出游戏前**运行下列代码，把JSON结果发给我。SDK成功计数是当前运行期间的数据，重启会清零。随后退出重进，检查存档/装扮仍保留。

```js
(() => {
  const buildId = globalThis.__PDD_DOUYIN_ANALYTICS__?.buildId;
  if (buildId !== 'douyin-a-business-dev-20261010-r3') throw Error('当前不是business r3包');
  const since = Number(tt.getStorageSync('pdd.analytics.businessR3.verifySince'));
  if (!since) throw Error('请先记录本轮测试开始时间');
  const key = 'pdd.analytics.delivery.douyin_dev.v1';
  const read = k => {
    const raw = tt.getStorageSync(k);
    const rows = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    if (!Array.isArray(rows)) throw Error('队列格式异常');
    return rows;
  };
  const current = x => x.data?.timestamp >= since && x.data?.clientBuildId === buildId;
  const pending = read(key), quarantine = read(key + '.quarantine');
  console.log(JSON.stringify({
    since, buildId, sdk: globalThis.__PDD_DOUYIN_SYSDK__?.getDiagnostics?.(),
    pendingSinceTest: pending.filter(current).length,
    quarantinedSinceTest: quarantine.filter(current).map(x => ({
      eventName: x.data?.eventName, page: x.data?.page, reason: x.reason
    })),
    previousQuarantineCount: quarantine.filter(x => !current(x)).length
  }, null, 2));
})();
```

完成一次正常广告后应看到：

- loginReady=true，roleReady=true，rolePending=false，roleError为空。
- roleReportAttempts通常为1；初始化失败后再次尝试时可能大于1。
- adReportAcceptedCount至少为1。仅lastAdReportRejection=null不能证明广告上报成功。
- adReportFailedCount=0、lastAdReportError为空。两个计数按不同广告事务计算；没有确认成功的事务也计入失败，重复调用同一事务不重复计数或请求。
- pendingSinceTest=0、quarantinedSinceTest=[]，历史22条隔离保留，不自动重放。

lastRoleReportRejection和lastAdReportRejection保留当前运行最近一次拒绝，后续成功也可能保留历史原因；结合成功/失败计数判断。cloudIdentityVerified=false是旧SDK诊断标记，不能用它判断业务云是否成功。所有诊断不输出角色ID、OpenID、连接串或密钥。

若roleError=role_identity_failed，优先核对第一步已发布的新文件，以及业务云网络/身份是否可用。若role_report_rejected，发lastRoleReportRejection；若广告仍被拒绝，发lastAdReportRejection。不要重置数据库或清除身份绑定来绕过错误。

## 分工和验证边界

我负责本地实现、回归测试、构建和部署文件；你负责发布dev及真实广告/手机验收。网络、MongoDB和供应商请求的本地测试使用替身，不等于供应商已在线接受；线上是否解决4001，以adReportAcceptedCount增加及实际返回为准。自建埋点实际入库仍需要analyticsReport/analyticsExport核对。
