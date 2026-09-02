# Online Level Data Recovery

- Recovery boundary: end of 2026-08-01 (Asia/Shanghai)
- Source commit: `0f3d4e4c1343819f126a39f49a54cfd3a65fef8f`
- Source commit time: `2026-07-31T10:17:43+08:00`
- Source path: `assets/LevelData`
- Source Git tree: `753197b90aa3563b394621f8765576f3d819075c`
- Exported JSON files: 1,693
- Main level files: 1,643 (`level_1.json` through `level_1643.json`)
- Theme level files: 48 (`zt_level_*.json`)
- Supporting JSON files: `level-manifest.json`, `levels_all.json`
- Historical manifest note: `levelCount` is 1,643, while the original `collectionEntries` catalog contains levels 1–300. This pre-existing snapshot state was preserved unchanged.

The JSON files retain their original names and bytes from the source commit. Cocos `.meta` files were intentionally excluded because copying their UUIDs beside the active assets would create duplicate-UUID conflicts. The current `assets/LevelData` directory was not modified.
