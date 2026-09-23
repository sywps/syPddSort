> 状态更新：第三关 ABC 版本起停止此实验。新客户端统一使用 A，历史分组保留，新记录标记 retired；旧预览参数不再切换实际玩法。以下为历史设计，当前方案见 third-level-experiment.md。

# 选豆逻辑本地预览

在 Cocos 浏览器预览地址后添加：

- `?level=2&pick=A`：当前底色优先逻辑。
- `?level=2&pick=B`：拼成彩虹已取证版本的同色分层扩散逻辑。

可以将 2 换成其他主线关卡号。浏览器预览不传 pick 默认为 A；第一关及非主线模式不启用 B。正式微信版本现已接入独立固定分组，发布步骤见 `bean-selection-experiment.md`。

B 保留当前关卡的单次数量上限和传送带容量；仅替换点击后选中的格子及其顺序。移除参数恢复默认预览方式。

## 原包依据

- 指定 OUTPUT 的两个压缩 WASM SHA256 与历史取证 inventory 一致。
- `j126924` 初始化九格顺序为 `(0,0),(-1,1),(0,1),(1,1),(-1,0),(1,0),(-1,-1),(0,-1),(1,-1)`；坐标为 `(col,row)`。
- `j38218` 分层收集同色、未完成且可用的豆，写入 SphereItem.SelectDepth。
- `j11568` 根据 SettingConfig.Do9AreaType 选择排序；保存的原包资源配置 `settingconfig.bytes` 为 1。此分支通过调用表槽 64724 读取 SelectDepth（main func7909），并用 LINQ OrderBy 稳定升序排序。
- 另一分支的槽 64766（split func22682）按位置距离平方排序；该配置没有启用，未作为本次 B 实现。
- `j21339` 按组大小、TableSelectNum、剩余容量三者最小值提交。

配置来自此前原包运行缓存提取，并非本次在线查询远程配置；不声称覆盖对方后续热更新版本。取证材料和实现进度见 `.planning/selection-experiment-audit/`。

验证：`node tests/original-bean-selection.test.js` 和 `npm run test:pch-conveyor`。实际手感由浏览器试玩确认。
