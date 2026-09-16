# 批量生成8月31日至今的日报

在项目根目录运行：

```sh
npm run analytics:range
```

默认开始日期固定为2026-08-31，结束日期每次运行按北京时间当天计算，包含首尾两天，最多90天。脚本入口为 `scripts/cloudbase-report-range.js`。

先预览日期计划，不联网、不读认证、不写文件：

```sh
npm run analytics:range -- --dry-run
```

指定区间或重新执行失败日之后的日期：

```sh
npm run analytics:range -- --from 2026-09-01 --to 2026-09-15
```

## 输出与显示

仍然使用 `tools/cloudbase-report.html`，不是复制16份HTML。每个日期生成自己的 `artifacts/cloudbase-daily-report/YYYY-MM-DD/combined_summary.json`、`combined_report.md`、各表分析与 `social_summary.json`，页面通过日期选择切换。

本地服务已启动时，访问 `http://127.0.0.1:8080/tools/cloudbase-report.html?date=YYYY-MM-DD`。脚本不启动服务器，也不构建、发布或写云数据库。`--out-root PATH` 可改变输出位置，但页面只读取默认目录，使用自定义目录需自行接入服务。

## 生成流程

1. 从运行时环境读取既有 `TCB_ENV_ID`、`TCB_API_KEY`（以及可选 `TCB_API_BASE_URL`）；不新增凭证文件。仅允许已确认的生产环境。
2. 每天开始前备份已有日期目录，保存到 `.range-run-随机后缀/backups/日期/`。
3. 复用daily任务读取user_behavior、level_record、ad_stat、daily_stat。
4. 复用social任务的时间分片读取工具，固定当天漏斗截止时间，检查连续区间、ID唯一及时间范围。不会使用offset翻页；输出funnel_partition_coverage.json。
5. 复用daily的reuse-existing模式生成完整五表分析，再刷新该日合作和PvP。
6. 检查日期、五个集合、合作及PvP状态，写入本次运行status.json。

遇到失败立即退出非零并停止后续日期。当前失败日可能已有部分文件更新，不能视为完整日报；status.json记录已完成日期、失败日期、错误与备份位置。不自动恢复旧文件，以免隐藏错误或覆盖并发任务改动。恢复时只操作确切日期目录并先保留失败产物。

`.range-job.lock` 阻止同一输出目录的多个范围任务并发。正常退出自动释放；如果被强制结束，先确认没有任务运行，再人工移除该确切锁文件。不要同时运行旧daily/social任务刷新相同日期。

备份保留原始数据，含用户标识，勿提交Git或公开分享；终端只输出日期、状态和路径。大范围读取及备份会消耗网络、CloudBase读取额度和磁盘空间；历史漏斗大时耗时可能较长。

## 数据边界

今天仍是部分日，不是全天；多个集合读取不是原子快照。某日集合为空保留现有缺表告警，不能理解为业务指标为零。先前发现的主线/主题混算、引导PV占比含义和无失败未通关算法问题不在本脚本中修复，统计逻辑仍由原daily任务负责。

## 验证

```sh
npm run test:analytics-range
npm run test:analytics-social
```

范围测试使用本地模拟数据验证跨日日期、执行顺序、备份、失败停止、dry-run无写入及时间分片，不代表整段线上历史已经重新导出。
