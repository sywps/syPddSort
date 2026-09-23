> 状态更新：第三关 ABC 版本起停止此实验。新客户端统一使用 A，历史分组保留，新记录标记 retired；旧预览参数不再切换实际玩法。以下为历史设计，当前方案见 third-level-experiment.md。

# 选豆 A/B 实验上线与查看

实验 ID：`bean_selection_ab_v1`。A 为当前底色优先，B 为已核实并试玩确认的原包同色扩散。每关单次上限继续使用关卡配置。

## 分组与范围

- 仅接收新版客户端首次登录且云端尚无 user_profile 的微信新用户，账号加独立实验 ID 进行 SHA256 分桶，A/B 各 50%。已有玩家不补分组，保持 A。
- 与首关 `first_level_abc_v1` 独立；可能出现首关 A+选豆 B 等六种组合。
- 正式规则只在主线第二关起生效；第一关、主题、外部关卡、对战、合作模式保持 A。
- 身份返回需与本地缓存一致，开局前冻结。存储失败、身份超时、协议不支持或身份变更明确记为 excluded，使用 A；迟到回复不切换规则。
- 浏览器 `?level=2&pick=A` / `?level=2&pick=B` 保留手动测试，测试用户不进入正式分析。

## 发布顺序

1. 在本项目正式微信云环境部署 `getOpenid`（包含 bean-selection-experiment.js）、`addBehaviorData`、`saveLevelRecord`、`addFunnelEvents`。部署 getOpenid 需上传整个函数目录，而非只改 index.js。
2. `addFunnelEvents` 的 extra 字段上限由 30 调整为 35，为新增的五个选豆实验字段保留空间，避免挤掉原有事件字段。
3. 构建、验证并发布包含本次脚本的微信客户端。仅部署云函数不会让旧客户端参与；只发客户端却没更新分组云函数会排除玩家。
4. 真机新账号验收：getOpenid 回执和 user_profile 有同一分组；首关保持旧选豆规则；第二关曝光的 appliedBucket 与分组一致；重启不换组；关卡结果保留分组及同一 roundId。

本次代码接入不等于已部署、已发布或已产生真实样本。

## 统计

`npm run analytics:daily` 仍走现有导出流程，新增 `combined_summary.json.beanSelectionExperiment`。`tools/cloudbase-report.html` 显示选豆实验表，并提供首关内容 A/B/C 分层结果；范围汇总支持同字段。历史日报需重建，缺少数据标记未就绪。

主指标为入组当日第二关通过 UV / 第二关实际曝光 UV；同时展示通关平均耗时、平均操作数和曝光用户次日活跃率。关卡结果只有匹配实际曝光的 roundId 才计入，防止首关/对战记录串入。测试、排除、分组或实际规则冲突的用户剔除。报告仅描述差异，不自动判断统计显著性或胜负。

## 验证命令

```
node tests/bean-selection-experiment.test.js
node tests/bean-selection-experiment-report.test.js
node tests/first-level-experiment.test.js
node tests/first-level-experiment-telemetry.test.js
node tests/original-bean-selection.test.js
npm run test:pch-conveyor
node tests/pvp-human-replay.test.js
```
