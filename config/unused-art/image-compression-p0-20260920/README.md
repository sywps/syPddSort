# P0 image optimization archive

This directory is outside Cocos `assets`, so its files are not runtime Bundle inputs.

## `retired-assets`

Recoverable originals removed from `assets` after UUID, serialized-reference, path, configuration, test, and generation-script closure checks:

- `profile_panel_aqua.png` and its Meta
- `ProfileAqua.meta`
- `ProfileAqua/top.png`, `middle.png`, `bottom.png` and their Meta files

The active profile generator and Prefab use `profile_panel_aqua_v2.png` instead.

`CollectionV2/书.png` is deliberately not archived: `CollectionPanelV2.prefab` currently references its SpriteFrame UUID.

## `original-active`

Byte-for-byte pre-resize copies of the three active PNG files and Meta files changed by this optimization:

- `ConveyorV2/expand.png`
- `ConveyorV2/arrow.png`
- `app_transition_loading_background.png`

Restore both a PNG and its matching Meta together if rollback is required.
