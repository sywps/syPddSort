# Competitor Special Modes

Internal competitor-analysis workspace for special level mechanics and reusable reference assets.

## Games
- `拼豆解解压`: copied special-mode investigation report from `temp/pindou_jiejieya_special_modes_report.json`.
- `快乐拼拼豆`: package configs, raw pack files, candidate special-mode assets, embedded countdown-box atlas resources, and summarized findings.

## Notes
- These are competitor reference assets for internal analysis only; do not ship them in our game.
- `快乐拼拼豆` converted levels currently do not include explicit `timeRegs` or `regionMap`; gameplay-level logic still needs a raw-field reimport later.
- `快乐拼拼豆/timeRegs_box_assets/manifest.json` is the current entry point for board-embedded countdown-box visual resources.
- `configChallenge.boxLimitTime` is only a challenge timer/config clue; it should not be treated as the board-embedded `timeRegs` coordinate data.
