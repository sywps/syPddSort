# 头像与头像框维护

## 唯一编辑入口

修改 `config/profile-art-source/catalog.json`。客户端和云函数目录由同一脚本生成，不要分别编辑生成文件。

- `items` 为当前目录，`retired` 保留停用编号及历史所有权。编号不得复用。
- `unlock` 为 default、mainline、activity、ad 或 gold；`value` 为对应门槛。金币条目当前均为300。
- 通关数按已保存主线进度减一；默认头像1001、默认框2001保留包内资源。
- 活动类型仍须对应的发奖逻辑，不因修改配置自动实现新玩法。

只改规则：`node scripts/prepare-profile-assets.js --config-only`。
更改源图片或新增条目：`node scripts/prepare-profile-assets.js`。

脚本同时生成客户端 ProfileCustomizationConfig.ts、云函数 profile-catalog.json/profile-retired.json，以及图片清单和好友榜映射。config-only 复用已导出的压缩图片，不重新处理原图。

## 发布

- 换已有编号的图片：生成、检查图片后，通过现有 CDN 发布脚本上传目标槽位及图片清单。无需为单纯换图部署云函数。
- 新增/停用目录、调整获取方式、价格或门槛：生成目录、检查后，部署完整 updateUserProfileAssets 并发布匹配的客户端。新图片另外上传CDN。
- 玩家拥有记录与广告进度仍保存在云存档，购买仍由服务端事务扣款并防重复。
- 本方案没有动态数据库规则，也没有新增旧协议分流。

## 移除先前云配置

已移除 profile_config 读取、规则版本协议、初始导入文件及相关模块。profile_customization_requests 是去重凭据集合，必须保留；user_profile 等玩家存档也不能删除。

线上若部署过依赖 profile_config 的版本，先将 updateUserProfileAssets 替换为本版，再删除 cloud1-d5gzq8ia0c404ee3e 中的 profile_config 集合；若未部署过，直接删除该集合即可。
