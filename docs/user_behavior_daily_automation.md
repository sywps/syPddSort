# user_behavior / level_record / ad_stat / daily_stat 每日自动导出与分析

这套方案分两层：

1. 云上继续保留你已经存在的日汇总云函数
2. 本地或服务器每天再跑一次明细导出 + 分析脚本

## 已有基础

仓库里已经有两个定时云函数：

- `cloudfunctions/calcAdStat`
- `cloudfunctions/calcDailyCoreData`

它们的触发器配置都是 `0 30 0 * * * *`，也就是每天 00:30 运行一次。

## 新增脚本

本次新增脚本：

- [scripts/user-behavior-daily-job.js](../scripts/user-behavior-daily-job.js)

能力：

- 按天导出 `user_behavior`
- 按天导出 `level_record`
- 按天导出 `ad_stat`
- 按天导出 `daily_stat`
- 自动轮询 CloudBase 导出任务状态
- 自动下载导出的 NDJSON 文件
- 自动产出 `summary.json`、`report.md`、`level_summary.csv`
- 两张表一起跑时，额外生成 `combined_summary.json`、`combined_report.md`

默认输出目录：

- 单独跑 `user_behavior`：`artifacts/cloudbase-user-behavior/YYYY-MM-DD/`
- 单独跑 `level_record`：`artifacts/cloudbase-level-record/YYYY-MM-DD/`
- 单独跑 `ad_stat`：`artifacts/cloudbase-ad-stat/YYYY-MM-DD/`
- 单独跑 `daily_stat`：`artifacts/cloudbase-daily-stat/YYYY-MM-DD/`
- 四张表一起跑：`artifacts/cloudbase-daily-report/YYYY-MM-DD/`

## 依赖

脚本依赖：

- `@cloudbase/manager-node`

CloudBase 官方文档里，管理端 SDK 支持：

- 初始化管理端 SDK
- 调用 `database.export(...)`
- 用 `migrateStatus(jobId)` 查询导出状态
- 成功后从 `FileUrl` 下载导出文件

## 环境变量

### 方案 A：`SecretId / SecretKey` 直导出

运行前设置：

```bash
export TCB_SECRET_ID="你的 SecretId"
export TCB_SECRET_KEY="你的 SecretKey"
export TCB_ENV_ID="cloud1-d5gzq8ia0c404ee3e"
```

### 方案 B：`ApiKey` 调云函数拉明细

如果你手里只有 CloudBase 的服务端 `ApiKey`，现在也可以直接跑，但前提是先把仓库里的新云函数 `exportAnalyticsData` 部署到你的云开发环境。

运行前设置：

```bash
export TCB_API_KEY="你的服务端 ApiKey"
export TCB_ENV_ID="cloud1-d5gzq8ia0c404ee3e"
```

可选环境变量：

```bash
export TCB_EXPORT_FUNCTION_NAME="exportAnalyticsData"
export TCB_API_BASE_URL="https://cloud1-d5gzq8ia0c404ee3e.api.tcloudbasegateway.com"
```

说明：

- 脚本检测到 `TCB_API_KEY` 时，会优先走 `ApiKey + HTTP API` 模式。
- 没有 `TCB_API_KEY` 时，脚本才会回退到 `SecretId / SecretKey + manager-node` 模式。
- `TCB_API_BASE_URL` 只有在你要覆盖默认中国区网关域名时才需要设置。

## 手动执行

分析昨天的 `user_behavior`：

```bash
npm run analytics:user-behavior:daily
```

分析昨天的 `level_record`：

```bash
npm run analytics:level-record:daily
```

分析昨天的 `ad_stat`：

```bash
npm run analytics:ad-stat:daily
```

分析昨天的 `daily_stat`：

```bash
npm run analytics:daily-stat:daily
```

四张表一起跑：

```bash
npm run analytics:daily:all
```

如果你走的是 `ApiKey` 模式，命令不变，只是认证方式不同。

分析指定日期：

```bash
npm run analytics:daily:all -- --date 2026-05-24
```

只分析已经导出的文件：

```bash
node scripts/user-behavior-daily-job.js --input ./database_export-cloud1-d5gzq8ia0c404ee3e-user_behavior.json --date 2026-05-17
```

只分析已经导出的 `level_record` 文件：

```bash
node scripts/user-behavior-daily-job.js --collection level_record --input ./database_export-cloud1-d5gzq8ia0c404ee3e-level_record.json --date 2026-05-17
```

## 建议定时

建议把本地导出分析放在每天 `01:00` 之后，避开你现有 `00:30` 的云端汇总任务。

### 方案 A：macOS / Linux `cron`

执行：

```bash
crontab -e
```

加入：

```cron
0 1 * * * cd /path/to/syGamePdd && /bin/zsh -lc 'export TCB_SECRET_ID="你的 SecretId"; export TCB_SECRET_KEY="你的 SecretKey"; export TCB_ENV_ID="cloud1-d5gzq8ia0c404ee3e"; npm run analytics:daily:all >> artifacts/cloudbase-daily-report/cron.log 2>&1'
```

如果你走 `ApiKey` 模式，把同一条 cron 里的认证环境变量替换成：

```cron
0 1 * * * cd /path/to/syGamePdd && /bin/zsh -lc 'export TCB_API_KEY="你的服务端 ApiKey"; export TCB_ENV_ID="cloud1-d5gzq8ia0c404ee3e"; npm run analytics:daily:all >> artifacts/cloudbase-daily-report/cron.log 2>&1'
```

### 方案 B：Codex 自动化

如果你希望由 Codex 每天自己跑，也可以把同一条命令做成每日 cron automation。

## 网页看板

日报跑完后，可以直接在本地打开这个页面查看：

```text
http://localhost:8080/tools/cloudbase-report.html
```

如果想直接指定某一天：

```text
http://localhost:8080/tools/cloudbase-report.html?date=2026-05-24
```

页面会自动读取：

- `artifacts/cloudbase-daily-report/YYYY-MM-DD/combined_summary.json`

并展示：

- 最近 7 天趋势
- 自动运营结论
- 主线卡点
- 高重试关卡
- 广告位表现
- 日核心指标

## 产物说明

以 `2026-05-24` 为例，四张表一起跑会生成：

- `artifacts/cloudbase-daily-report/2026-05-24/user_behavior/database_export-cloud1-d5gzq8ia0c404ee3e-user_behavior-2026-05-24.json`
- `artifacts/cloudbase-daily-report/2026-05-24/user_behavior/summary.json`
- `artifacts/cloudbase-daily-report/2026-05-24/user_behavior/report.md`
- `artifacts/cloudbase-daily-report/2026-05-24/user_behavior/level_summary.csv`
- `artifacts/cloudbase-daily-report/2026-05-24/level_record/database_export-cloud1-d5gzq8ia0c404ee3e-level_record-2026-05-24.json`
- `artifacts/cloudbase-daily-report/2026-05-24/level_record/summary.json`
- `artifacts/cloudbase-daily-report/2026-05-24/level_record/report.md`
- `artifacts/cloudbase-daily-report/2026-05-24/level_record/level_summary.csv`
- `artifacts/cloudbase-daily-report/2026-05-24/ad_stat/database_export-cloud1-d5gzq8ia0c404ee3e-ad_stat-2026-05-24.json`
- `artifacts/cloudbase-daily-report/2026-05-24/ad_stat/summary.json`
- `artifacts/cloudbase-daily-report/2026-05-24/ad_stat/report.md`
- `artifacts/cloudbase-daily-report/2026-05-24/ad_stat/ad_summary.csv`
- `artifacts/cloudbase-daily-report/2026-05-24/daily_stat/database_export-cloud1-d5gzq8ia0c404ee3e-daily_stat-2026-05-24.json`
- `artifacts/cloudbase-daily-report/2026-05-24/daily_stat/summary.json`
- `artifacts/cloudbase-daily-report/2026-05-24/daily_stat/report.md`
- `artifacts/cloudbase-daily-report/2026-05-24/daily_stat/daily_core_summary.csv`
- `artifacts/cloudbase-daily-report/2026-05-24/combined_summary.json`
- `artifacts/cloudbase-daily-report/2026-05-24/combined_report.md`

## 关于 `level_record`

脚本默认把 `level_record` 按 `endTime` 做日期过滤，因为它没有 `timestamp` 字段。

如果你后面希望改成按 `startTime` 统计，也可以手动覆盖：

```bash
node scripts/user-behavior-daily-job.js --collection level_record --query-field startTime --date 2026-05-24
```

## 关于 `ad_stat` 和 `daily_stat`

这两张表本身就是按天汇总表，所以脚本默认按：

- `ad_stat.date = YYYY-MM-DD`
- `daily_stat.date = YYYY-MM-DD`

做精确过滤，不再按时间戳区间查询。

## `ApiKey` 模式的新增云函数

为了让 `ApiKey` 模式能安全稳定地读取数据库明细，这次新增了一个普通云函数：

- `cloudfunctions/exportAnalyticsData`

它的职责很单一：

- 接收 `collection / date / queryField / pageSize / offset`
- 在云端按天分页查询四张表
- 把明细数据返回给本地脚本

如果你是从源码目录部署云函数，上传这个目录即可；如果你平时是从 `build/wechatgame/cloudfunctions/` 这一套目录打包，也同步补好了同名函数目录。

脚本在 `ApiKey` 模式下会调用官方 HTTP API：

- `POST https://{envId}.api.tcloudbasegateway.com/v1/functions/exportAnalyticsData`

请求头使用：

- `Authorization: Bearer <ApiKey>`
- `Content-Type: application/json`

## 后续建议

如果你准备长期用这套链路，下一步建议再补 2 个动作：

1. 把 `report.md` 再转成你固定格式的运营日报
2. 增加“异常报警”，例如首关通过率低于阈值时自动提醒
