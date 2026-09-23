# P1 A+B image optimization archive

This directory is outside Cocos `assets`, so it is not a runtime Bundle input.

`original-active` contains byte-for-byte copies of the five PNG/Meta pairs before the P1 A+B resize, plus the pre-change `ProfilePanel.prefab`:

- `popup_primary_button.png`
- `home_primary_button.png`
- `home_secondary_button.png`
- `profile_panel_aqua_v2.png`
- `revive_timeout_illustration.png`
- `ProfilePanel.prefab`

The Home button backups intentionally preserve the user's already-modified working-tree state, not the Git version.

Restore a PNG together with its matching Meta. Restoring the Profile panel image also requires restoring the archived `ProfilePanel.prefab`, because its nine-slice node size and scale were adjusted with the image and borders.
