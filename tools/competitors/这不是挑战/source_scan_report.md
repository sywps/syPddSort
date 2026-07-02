# 这不是挑战包内关卡源扫描

- JSON 文件数: 232
- 含 `id/answer/map/color` 关卡对象的数据源: 3

## 关卡数据源

| 关卡数 | 唯一ID | 重复ID | ID范围 | 文件 | 示例名称 |
| ---: | ---: | ---: | --- | --- | --- |
| 100 | 100 | 0 | 99999..400011 | `OUTPUT/subpackages/loadingScene/import/0f/0fe64396b.e9d84.json` | 引导关, 七彩小熊, 珍珠耳环少女, 社畜小狗, 动感超人 |
| 99 | 99 | 0 | 100001..400011 | `OUTPUT/subpackages/json/import/c7/c7007844-6fd1-44f7-b045-7764d831c08d.a3ecb.json` | 七彩小熊, 珍珠耳环少女, 社畜小狗, 动感超人, 欸嘿小狗 |
| 1 | 1 | 0 | 99999..99999 | `OUTPUT/subpackages/json/import/64/6440c88a-699b-4816-bdf8-c98f10a99024.4469d.json` | 引导关 |

## 远端/代码线索

| 文件 | wx.request | level_arr | answer | .json | URL数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `OUTPUT/assets/start-scene/index.js` | 2 | 0 | 0 | 11 | 2 |
| `OUTPUT/adapter-min.js` | 1 | 0 | 0 | 2 | 3 |
| `OUTPUT/subpackages/loadingScene/game.js` | 0 | 9 | 0 | 2 | 3 |
| `OUTPUT/subpackages/main_scene/game.js` | 0 | 3 | 3 | 0 | 1 |
| `OUTPUT/assets/shoucang_ui/index.js` | 0 | 3 | 0 | 0 | 1 |
| `OUTPUT/assets/ceshi_ui/index.js` | 0 | 2 | 0 | 0 | 0 |
| `OUTPUT/subpackages/loadingScene/import/0f/0fe64396b.e9d84.json` | 0 | 0 | 100 | 0 | 0 |
| `OUTPUT/subpackages/json/import/c7/c7007844-6fd1-44f7-b045-7764d831c08d.a3ecb.json` | 0 | 0 | 99 | 0 | 0 |
| `OUTPUT/subpackages/game_scene/game.js` | 0 | 0 | 12 | 0 | 0 |
| `OUTPUT/subpackages/json/import/64/6440c88a-699b-4816-bdf8-c98f10a99024.4469d.json` | 0 | 0 | 1 | 0 | 0 |
| `OUTPUT/cocos/cocos2d-js-min.js` | 0 | 0 | 0 | 10 | 1 |
| `OUTPUT/src/assets/loadingScene/SSSGF/dataManagers/playerDataMager/storage/libs/security/jsencrypt.min.js` | 0 | 0 | 0 | 1 | 0 |
| `OUTPUT/subpackages/win_ui/game.js` | 0 | 0 | 0 | 0 | 1 |
| `OUTPUT/src/scripts/chouka_ui/index.js` | 0 | 0 | 0 | 0 | 1 |
| `OUTPUT/game.json` | 0 | 0 | 0 | 0 | 0 |
| `OUTPUT/app-config.json` | 0 | 0 | 0 | 0 | 0 |
