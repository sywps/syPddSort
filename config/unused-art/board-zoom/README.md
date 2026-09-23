# 隐藏缩放条归档

六张 `board_zoom_*.png` 及原始 `.meta` 从 `assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall` 移至此处，避免参与 Cocos 导入、自动图集和分包构建。字节及 UUID 保留，方便日后恢复。

当前为手势缩放；Game.scene 的 BoardZoomControl 子树和对应 UiManifest/构建补齐条目已移除。恢复时必须一起恢复场景节点、资源清单和可见开关，不能只搬回图片。
