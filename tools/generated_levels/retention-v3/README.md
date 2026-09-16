# 第三版：项目现有乱序工具 + 压力教学

使用 tools/generate_initial_shuffle.py 的 choose_best_init / build_updated_payload，核心为 tools/move_target_to_initial.py 的 assign_initial_layout。微调页通过 /api/rebuild-level 使用同一核心。本目录generate.py只是参数及输出包装，不实现乱序。没有使用新旧乱序对比的shuffle-comparison.js；误用该工具的中间结果已被重新生成覆盖。

| 关卡 | 图案 | 错位数/图案豆数 | 错位率 | 基础容量 |
|---|---|---|---|---|
| 3 | 小柴犬 | 156/188 | 83.0% | 72 |
| 4 | 向日葵 | 257/301 | 85.4% | 84 |
| 5 | 爱心 | 285/324 | 88.0% | 96 |

输入沿用v2目标图，32次尝试、每色1—3组、目标0.83/0.855/0.88；结果种子、组数、实际比例记录在manifest.json。新开局不再保证v2保留眼鼻或白色分隔线，只保证图案外形、颜色数量及80%以上错位率。已按用户确认替换assets/LevelData中的正式第3—5关，更新本地manifest与build/level-data-cdn；未发布远端。

## 扩容教学（源码已改）

第三关保留原开局强引导和免费+12，文案改为“传送带满了就会失败哦 / 点击扩容可以增加传送带容量”。第四、第五关在成功操作后，剩余不超过12格且棋盘还有可操作豆时，在扩容按钮上方显示“传送带快满了，可扩容增加12格”。84容量为72颗触发，96容量为84颗触发。

每次进入关卡最多显示一次，5秒后自动消失，点击扩容或进入广告/设置/结算时清除。气泡固定水平居中、靠近传送带，并复用前三关的GuideHandSingle指向扩容按钮。无蒙版、不锁操作、不暂停计时；沿用原激励广告扩容流程。外部试玩、主题和PVP不触发。

## 验证与试玩

http://localhost:8080/tools/generated_levels/retention-v3/

评审页的试玩链接走外部入口，只验证布局与容量。正式入口使用?level=3&profile=local-test（4、5同理）。第三关另有84容量体验版，正式基础配置仍用72，避免重复+12。

复用现有PvpBotReplay，验证沙盒固定主线实际20载体、1倍速、无需道具；每关10/10通关。测试只证明可解，不能代表真人通过率或留存收益。完整路径见mainline_solution_N.json。容量60对照也能通关，扩容价值尚需真人压力体验判断。

重现：用现有Python环境执行本目录generate.py，再执行node verify.cjs。引导行为测试：node tests/pch-capacity-pressure-guide.test.js。

当前五项引导测试、TypeScript检查和三关各10次合法机器人验证通过。Cocos资源已重新导入，正式第四关显示新版向日葵和84容量；脚本缓存也包含新版居中、下移与手指逻辑。软提示节点的位置、样式、手指及生命周期由行为测试覆盖。
