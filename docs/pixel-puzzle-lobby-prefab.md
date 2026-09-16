# 像素拼图大厅预制体

在 Cocos Creator 中打开 `assets/GameAssetsBundle/UI/Prefabs/Panels/PixelPuzzleLobby.prefab`。

## 编辑方式

- `Content/ModeArea/ChapterCard`：闯关模式入口。
- `Content/ModeArea/CoopCard`：双人合作入口。
- `Content/ModeArea/RankedCard`：排位对战入口。
- 各节点下的 `Background` 是 Sprite 图片，可替换 SpriteFrame、调整尺寸和颜色。
- 固定标题、提示及按钮文字都是独立 Label，可以直接修改。
- 各卡片的阴影已放到卡片内部，移动卡片时会一起移动。
- 背景和 `Content` 通过 Widget 铺满屏幕。`Header` 顶部对齐，`Footer` 距顶部 1146，紧跟模式区域下方；`ModeArea` 距顶部 370，高度固定为 761，三张卡片保持紧凑间距，长屏不拉伸卡片区域。共 62 个 Widget，720 × 1280 保留原布局。
- `LobbySettings` 沿用原来的隐藏状态。

背景直接复用 `assets/GameAssetsBundle/Textures/UI/app_transition_loading_background.png`，不修改转场资源和逻辑。实际运行确认大厅和转场共用同一个 SpriteFrame 和 Texture。

卡片和按钮底图使用九宫格切片，合并重复阴影和预览框后保留 23 张 PNG，位于 `assets/GameAssetsBundle/UI/Atlases/PixelPuzzleLobby`，合计 38,743 字节。`pixel_lobby.pac` 将小图打入独立图集；隔离网页构建实际生成一张 506 × 506 PNG（32,807 字节），32 个小图 Sprite 共用它。专用 UI 的 RGBA 纹理估算从 9.17 MiB 降至 0.98 MiB；共享背景 960 × 1280 约 4.69 MiB，单独计算，不能算作新增两份。没有把文字烘焙到图片里。底部成绩授权文字使用深色。

当前网页构建虽然运行时使用图集，产物仍保留 23 张独立 PNG；已开启图集的移除源图配置，但不能据此宣称包内只有一张图片。上述优化数字是运行时纹理估算，不是完整安装包或进程内存测量。

关卡图案由实际关卡数据动态绘制；段位、星数、关卡进度、体力、门票和加载提示由代码更新。业务绑定依赖节点路径，调整位置和样式即可，不要随意改动这些绑定节点的名字或层级；需要改名时同步 `PvpModeModule.ts` 中的路径。

## 运行逻辑

`PixelPuzzleLobbyView.ts` 按需加载预制体，阻止重复加载，处理失败和场景销毁后的迟到回调。实例存在期间持有预制体引用，销毁时释放。Creator 会把预制体根节点同步为文件名，实例化时明确命名为 `PvpLobbyOverlay`，与现有大厅识别逻辑一致。

`PvpModeModule.ts` 中的 `bindPixelPuzzleLobby` 负责按钮事件及动态数据。合作大厅、排位准备页、门票和奖励等内部页面维持原来的实现，本次没有迁移。

## 验证

- 预制体 JSON 引用、图片 UUID、图片尺寸及按钮底色检查通过。
- 大厅行为测试通过，包括三种入口、资源加载失败、门票奖励、快速连点、场景销毁后迟到加载、引用释放和保留编辑器标题。
- 排位资源/门票及路由测试通过。
- TypeScript 在项目兼容参数 `--noEmit --ignoreDeprecations 6.0 --skipLibCheck --lib ES2020,DOM` 下通过；默认检查受现有引擎声明及 lib 设置影响。
- Cocos Creator 3.8.8 已实际导入并生成独立网页构建；390 × 844 浏览器中大厅 34 个 Sprite 无丢失图片，两个真实关卡预览正常，合作入口与排位准备页可打开。
- 合作面板现有 `coop-ui.test.js` 的错误文案断言失败，其业务文件和测试本次均未修改。
- 微信真机及完整对局未验收。通用网页构建需要项目的资源后处理，临时预览已复用现有 CCON 映射修复；游戏场景仍有独立的 Spine 初始化错误，未扩大范围修改。

Widget 和图集更新已在 720 × 1280、390 × 844 浏览器查看；关闭重开后只存在一个大厅实例，背景仍是同一张有效纹理。预制体和大厅行为测试通过。

最新本地验证产物在 `output/pixel-lobby-widget-preview`，截图在 `output/playwright/pixel-widget-atlas-720.png` 和 `pixel-widget-atlas-tall.png`，过程记录在 `.planning/pixel-lobby-prefab`，未发布。
