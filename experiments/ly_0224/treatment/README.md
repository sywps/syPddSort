# ly_0224 EXP level overrides

This directory owns only the `exp` bucket overrides for mainline levels 2-9.
It is intentionally separate from `assets/LevelData`, which remains the stable
source selected by the WeChat build's A/B CDN slot.

The EXP package mirrors the complete stable level-data key set, including the
stable Level 1 data and theme levels, then replaces only mainline levels
2-9 with the files in this directory. The resulting 1,691-level manifest is
published to one fixed CDN root and never inherits the build's A/B slot.

Runtime routing remains narrower than package ownership: Level 1 still starts
from the bundled snapshot, theme levels keep the stable route, and only
mainline Level 2 onward can resolve to the EXP CDN.

Generate and validate this complete EXP package with:

```sh
npm run sync:cdn:wechat:level_data:exp:dry
```

The dry-run command writes only ignored build artifacts. Publishing uses the
matching command without `:dry`; it uploads immutable packs first and
`level_live.json` last. Publishing is a separate explicit action.
