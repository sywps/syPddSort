# 美术试用库

目录：`assets/PreviewBundle/ArtCandidates`。资源会出现在 Cocos 资源管理器，可以拖入 `PreviewBundle` 内的预览场景或预制体试效果。

确定采用后，通过编辑器移动资源到对应正式 Bundle，保留 `.meta` UUID。正式 Home/Game 场景不要长期引用试用库。

微信、抖音项目构建脚本生成配置时明确关闭 `preview` Bundle 输出，并检查正式 assets 对试用资源的 UUID、压缩 UUID 和显式路径引用；发现后报错并列出来源与目标。

直接使用编辑器另建构建任务时，也必须关闭 preview Bundle 输出；上述检查由项目构建脚本执行。字符串拼接形成的动态加载路径无法由静态检查完全识别，不要从正式代码动态加载试用库。

已归档的旧九宫格资源：chapter_completed_blue、chapter_pending_blue、chapter_pending、chapter_play、chapter_tile。chapter_tile 原有的九处禁用 Sprite 引用已清除；当前使用的 chapter_diamond 保留在正式目录。

传送带旧版资源归档在 `assets/PreviewBundle/ArtCandidates/ConveyorLegacy`：旧箭头和拼件 conveyor_0～5、gameProp_2007、wf_base_14，以及旧版容量槽和绿色填充，共 10 张图片。保留原 PNG 和 UUID；`SourceFolders` 保存旧图集与目录元数据，不参与正式包输出。

当前使用的 11 张传送带图片统一位于 `assets/BootstrapBundle/GameUI/Atlases/Conveyor`，由 `conveyor.pac` 自动合图（1024 上限、4px 边距、不旋转）。场景只保留 NormalLayoutV2；其中空的 PchMovingTrack 仅作为新手引导的定位范围，不再引用旧拼件。扩容按钮的广告图标仍复用 GameSceneSmall 图集，不重复复制。
