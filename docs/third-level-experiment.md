# 第三关 ABC（third_level_abc_v1）

A 使用当前 level_3.json；B 使用拼成彩虹星星（level_3_B.json）；C 使用拼大豆苹果（level_3_C.json）。源码都在 assets/LevelData，构建后 B/C 放在现有主线 CDN pack 的第三关 variants 字段，不新增 CDN 目录、不增加主线关卡数、不放首包。

三组 timeLimit=300、conveyorCapacity=90，Hard 和其他规则复制当前 A；slotTotalCount 是图案豆子总数，B=464、C=495，不是传送带容量。B 的颜色按本项目色板一一映射，C 原编号已匹配；保留图案和原始排列。扩容仍由逻辑第三关公共引导执行，沿用免费扩容及原有埋点。

进入主线第三关、加载内容前，通过 getOpenid 的 thirdLevelExperiment 请求在 user_profile 固定分组。独立 SHA256 三等分；已有进度超过第三关且没有分组的用户排除。已入组玩家重试/重启不换组，云端事务保存首个回执。身份、协议、存储或资源失败时中止该次加载并明确报错，不冒充 A 组。主题、外部、合作、对战、工作台预览不入组。

浏览器预览：?level=3=A / ?level=3=B / ?level=3=C。属于测试，不计正式实验。

新客户端选豆固定 A、鼓励文字和语音固定开启，包括历史 B 用户。历史本地/云端分组和旧记录保留，新事件中的旧实验 status 为 retired；不再发旧实验分组/曝光事件。云端停止旧实验新增入组。旧客户端不会被云端强制改变已缓存玩法，报表分析必须限定 third_level_abc_v1 的有效入组数据。

现有行为、漏斗和关卡结果增加 thirdLevelExperimentId、thirdLevelExperimentStatus、thirdLevelExperimentBucket、thirdLevelEnrolledAt、thirdLevelExperimentReason；levelId 仍为3，roundId不变。仅增加分组确认事件，无第三关额外曝光事件。日报/范围汇总及现有 cloudbase-report.html 增加 ABC 和首关分层：进入、通过、第四关到达、引导完成、缺终局。当前报表口径为入组当日表现，不是统一24小时观察窗口，也不自动判定胜负。

发布顺序：先上传含 variants 的 CDN pack/manifest，再部署 getOpenid（含 third-level-experiment.js）、addBehaviorData、saveLevelRecord、addFunnelEvents，最后发布新客户端。需验证真实账号回执、重启固定组别、ABC图案及引导和上传记录。本轮只完成本地实现、构建与自动化验证，没有执行生产部署/发布。
