# 第一关 A/B/C 实验接入

## 当前状态与上线顺序

本地已实现并测试，尚未部署云函数、重新构建或发布微信包；因此不能据此认定线上已开始分流。

1. 部署 `getOpenid`（必须包含同目录 `first-level-experiment.js`）、`addBehaviorData`、`saveLevelRecord`。
2. `addFunnelEvents` 使用已有 extra 字段通道，无需因本改动重新部署，但环境中该函数与 `first_level_funnel` 集合必须可用。
3. 构建微信包，构建末端会检查首包 A/B/C 资源；正式发布前，用真实新账号核对 getOpenid 回包、首关图案与入组/曝光记录的一致性。
4. 更新本地日报工具及 `tools/cloudbase-report.html`。测试启动参数不进入正式样本；正式验收账号必须不带这些参数。

服务端新版本先部署、客户端后发布。旧客户端没有资格请求，不会被新增入组。实验从新客户端首次请求且创建新用户资料时开始纳入，无需事后用盐值重算用户归属。

## 分组与资格

- 固定 ID：`first_level_abc_v1`。CRC32 UTF-8(`openid + ':' + ID`) 转无符号整数后 `%100`：0–33 A、34–66 B、67–99 C。
- A 当前正式首关，B 拼豆天才（100%错位），C 这不是挑战。内容版本为 A_v1/B_v1/C_v1。实验运行期间固定内容、引导和 ID；要改设计则开新实验。
- 仅 getOpenid 创建的新 `user_profile` 且客户端声明没有已知后续关进度时纳入。已有资料但没有本实验记录的用户全部排除，包括仍停在第一关的老用户。这是保守资格判断，不用“savedLevel=1”冒充新用户。
- 云端 `user_profile.firstLevelExperiment` 保存组别与入组时间；本地 `pdd.first_level_abc_v1.decision` 保存本次体验决定。回访沿用原组，后续关卡继续携带归属。
- 第一关预加载前最多等待身份 5 秒。新用户身份不可用时使用 A 内容、状态 excluded；不是正式 A 组。决定冻结，迟到身份不切换关卡，并将迟到的云端分组同步为排除。同步失败有专门错误事件，本地仍保持排除。
- 明确试玩参数、浏览器环境标记 test；`?level=1=A/B/C` 保持可用。试玩决定不覆盖本地正式组别，也不写入正式样本。
- 关闭 `cloudfunctions/getOpenid/first-level-experiment.js` 的 ENABLED 只停止新增入组，既有组保持稳定；如需全量回退，应另行定义回退与数据截止时间。

## 埋点与报表

独立字段：firstLevelExperimentId、firstLevelExperimentStatus、firstLevelExperimentBucket、firstLevelContentVersion、firstLevelEnrolledAt、firstLevelExperimentReason。行为/关卡记录为顶层字段，漏斗记录在 extra 中；不占用旧实验 abId/abBucket。

- `first_level_experiment_assignment`：实际接收到并确认的入组/排除/试玩决定。
- `first_level_content_load`：本地首关加载成功或失败。
- `first_level_experiment_exposure`：实际进入可玩的首关，并带实际 contentPath。
- 复用现有引导展示/完成、enter_level、level_pass、关卡结束和技术错误事件。

运行 `npm run analytics:daily -- --date YYYY-MM-DD` 后，combined_summary.json 新增 firstLevelExperiment，报表页面新增独立 A/B/C 区域。已有导出可运行 `npm run analytics:daily -- --date YYYY-MM-DD --reuse-existing` 重建。

主指标：**当日进入第二关 UV / 当日实际入组新用户 UV**。辅助指标包括 L1/L3 通关、实际进入、加载失败、技术错误、两步引导完成/展示人数、首次成功关卡尝试耗时中位数及次留。

队列只来自实际 assignment 记录且按 openid 去重；没有 assignment 的带桶事件不补成队列。混入试玩、组别/内容版本冲突者单列排除；缺少归属字段单列质量计数。第一关 A 内容的 excluded 用户不会算入正式 A。

次留要求次日已经结束，并存在次日 user_behavior 导出及 combined_summary。先导出次日，再用 --reuse-existing 重建队列日；否则显示未就绪，不填零。日期范围报表汇总互斥的入组日队列，次留只用具备完整次日数据的队列作分母；不平均每天百分比，不平均中位数。质量计数在范围报告中为每日计数之和。

数据完整性仍依赖客户端上传及云函数可用性；离线退出、队列上传失败不能被假装补齐。报表不自动判断显著性或赢家，应先按真实流量确定样本量与观察期。

## 验证与未验证范围

自动化覆盖分桶协议一致性、云端新旧用户与保存/恢复、测试隔离、身份超时与迟到、不换组、三条云端上传通道、来源关卡与引导、实际日报 CLI、重复/冲突/试玩剔除、次留未就绪及范围分母。完整 TypeScript 使用 --skipLibCheck --lib ES2020,DOM 兼容项目声明。

本次没有生产数据库写入、云函数部署、微信构建发布或真机联网验收。临时日报夹具仅用于本地测试，保存在 temp/first-level-experiment-report-test，不能作为线上实验数据。
