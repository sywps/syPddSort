# 日报注册用户留存

`tools/cloudbase-report.html` 增加 D1、D2、D3、D7 汇总与每日注册队列表。原有通关、广告、合作与 PvP 数据不变，留存文件失败仅在本区块提示。

## 口径与当前数据

- 全部注册用户为分母，注册后第 N 个北京时间自然日存在任意 user_behavior 记录为回访；不是连续留存或单关留存。
- 当前匿名快照覆盖 2026-08-31～2026-09-15 注册用户，观察截止 2026-09-15 15:46:37 北京时间，非实时数据。
- 日期选择器控制队列范围终点，不回放当时的观察截止点。超出快照范围明确显示数据不可得。
- 未成熟、当日未结束、零分母与数据缺失不冒充完整的0%留存。汇总仅包含完整注册日与完整回访日，各Dn分母不同。

## 更新

先按既有注册留存流程产出并核验包含 cohorts、cutoff、from、to 的匿名汇总，再执行导出（该脚本不查询数据库，也不会自动刷新线上数据）：

```sh
node scripts/export-registered-retention-snapshot.js .planning/session-plans/20260915-registered-retention/summary-with-d2.json
```

导出采用字段白名单，仅将日期、注册人数、回访人数和状态写入 `artifacts/cloudbase-retention-report/registered-cohorts.json`。更新时传入新核验文件，不要把修改cutoff当作更新数据。

## 验证与回滚

```sh
node tests/cloudbase-registered-retention.test.js
node tests/cloudbase-report-date-param.test.js
node tests/social-analytics-report.test.js
```

当前三项测试已通过，浏览器已核实汇总与16日明细展示。快照汇总验收值为D1 436/22835、D2 427/22691、D3 140/22454、D7 47/16772；未来刷新快照后需同步核验测试基准。

回滚时仅撤销本次HTML注册留存导入、状态与渲染接线，保留其他已有修改；模块、导出脚本与匿名快照可留存，不涉及游戏资源、构建或部署。
