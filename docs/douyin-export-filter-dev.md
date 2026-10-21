# 抖音 dev 导出：按版本和测试时间筛选

只替换云端 `analyticsExport.js`，完整内容位于 `cloudfunctions-douyin/analyticsExport.js`。保持已有 `analyticsCommon.js`、环境变量、访问控制不变。此管理函数通过控制台在线调试使用，不新增游戏访问路径。

1. 抖音云顶部选 dev，在函数列表打开 analyticsExport.js，将本地同名文件全文复制替换。
2. 点击发布，备注可填“埋点导出增加版本和测试时间筛选”，等待成功。
3. 在线调试选择 analyticsExport.js / POST，Body 填入：

```json
{
  "date": "2026-10-10",
  "collection": "first_level_funnel",
  "clientBuildId": "douyin-a-business-dev-20261010-r3",
  "since": 1791624227827,
  "capturedAt": 1791624622351,
  "after": ""
}
```

无需构建游戏、上传 CDN 或重新扫码。查询已有数据，不改变埋点和重试行为。

## 参数与分页

- clientBuildId 可选，精确匹配记录顶层版本号（1–80 个英文、数字、下划线、点或短横线）。不从 extra 中推断版本。非法值返回 INVALID_BUILD_ID。
- since 可选，毫秒时间戳，包含此时刻；必须在 date 对应北京时间当日内且早于 capturedAt。非法值返回 INVALID_SINCE。
- capturedAt 为不包含的事件时间上界，且接收时间 receivedAt 不得晚于此值。date 的次日零点仍限制上界。
- 不传两项新参数时保留原来的当日导出行为。totalRecords 为筛选后的总数，返回值回显使用的 clientBuildId、since。
- 筛选后从 after 空字符串重新开始，不能续用之前全天数据的游标。
- hasMore 为 true 时，仅将 after 替换为返回的 nextCursor，保持日期、集合、版本、since 和 capturedAt 全部不变。直到 hasMore 为 false。
- 其他集合可换成 user_behavior 或 level_record，切换集合后 after 也应清空。
- 本地报表拒绝混用筛选条件不同的页面。筛选导出与此前全天导出分开放置；筛选结果不代表全天运营数据。

## 验证边界

本地使用隔离数据库替身验证筛选、分页、参数拒绝与报表兼容性；真实云端以发布后的返回结果为准。筛选能力本身不代表已查清上传超时原因。
