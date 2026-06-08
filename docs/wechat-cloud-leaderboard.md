# 微信云开发排行榜接入

当前实现使用微信云开发云函数 `leaderboard`，排行榜指标为 `progressLevel`，也就是玩家当前解锁到的关卡进度。

## 需要准备

1. 在微信开发者工具里为小游戏开通云开发环境，并绑定默认环境。
2. 在云开发数据库里创建集合 `leaderboard`。
3. 将仓库根目录的 `cloudfunctions/leaderboard` 部署成同名云函数。

## 推荐字段

云函数会自动写入这些字段：

- `openid`
- `uuid`
- `displayName`
- `progressLevel`
- `createdAt`
- `updatedAt`

## Cocos 工程导出到微信小游戏后的处理

这个仓库当前是 Cocos 源工程，不是直接可被微信开发者工具打开的小游戏目录。导出微信小游戏包后，再做下面两步：

1. 把仓库根目录的 `cloudfunctions/` 复制到导出的小游戏工程根目录。
2. 确认导出工程的 `project.config.json` 里声明了：

```json
{
  "cloudfunctionRoot": "cloudfunctions/"
}
```

然后在微信开发者工具里右键 `cloudfunctions/leaderboard`，执行“上传并部署：云端安装依赖”。

## 前端运行说明

- 微信小游戏环境：前端会调用 `wx.cloud.init()` 和 `wx.cloud.callFunction()`。
- 浏览器/本地预览环境：会自动回退到本地预览榜单，方便先看 UI 和流程。

## 可选配置

如果小游戏工程没有绑定默认云环境，可以在 [assets/Scripts/Core/LeaderboardMgr.ts](/Users/shengyemac80-202504/claude/pindoudou/assets/Scripts/Core/LeaderboardMgr.ts) 里填写 `WECHAT_CLOUD_ENV_ID`。
