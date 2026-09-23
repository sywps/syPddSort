# 个人信息与装扮接入

## 本地实现

- 首页左上角头像打开青色九宫格底板的 `ProfilePanel.prefab`，设置位于其下方；移除修改昵称和微信头像按钮。
- 仅启用用户提供的12个头像、13个头像框，原图与编号映射在 `config/profile-art-source`。默认1001对应不带括号的“头像1.png”（鸭子），默认2001对应“头像框 (1).png”（蓝色皇冠），原金色皇冠已归档。旧参考头像和框已移入 `temp/profile-legacy-20260917`，不进入活动清单；旧拥有记录保留，已停用装备展示默认款。
- 头像保留1001–1005、1009–1012、1029–1031及原解锁门槛；框保留2001、2003–2013及原门槛（原2002蓝框已提升为2001默认款），新增2014（樱花）累计通关240关解锁。这批暂不分配活动款，没有活动领取云接口。
- 默认1001/2001的PNG在homeAssets包内供离线兜底，排行榜兜底同步使用同一默认组合；25张独立PNG及清单在 `config/profile-assets`。正式环境所有图（包括默认款）优先由本方CDN远程美术清单解析。本机普通浏览器使用 `levelData/ProfilePreview` 镜像，该Bundle沿用正式构建的剔除流程。`use_cdn=1` 可显式测试CDN，须配置资源地址。
- `UserMgr.getProfile()`仍是原账号资料；`getDisplayProfile()`解析统一展示资料。有效授权昵称/头像默认使用，主动装备游戏头像后保留选择；旧自定义昵称不再生效，云接口拒绝修改昵称。游客前缀迁移为玩家，保留原UUID后缀。首页、全国榜、PVP、合作参与者和微信好友榜传递展示身份。
- 列表未加载图片显示浅灰绿占位格；资源最多自动重试一次，失败不显示错误文字，重开可再加载。已装备头像保持上次成功显示，首次无可用图时临时使用默认图，不改装备。
- 打开窗口的云同步静默重试一次；普通浏览器不发起同步并禁用云操作。主动操作最终失败仍显示简短反馈。`ProfileDiagnostics` 通过既有 `addFunnelEvents` outbox记录 `profile_failed`（source阶段、itemId、attempts、截断且去URL的错误、自动版本字段），同键60秒限频；沿用仅正式微信环境采集与持久化补发，不在浏览器伪造后台记录。
- 通关数只从已保存主线进度派生：`max(0, savedLevel - 1)`。展示与解锁共用该口径，正在第10关为已通关9关，通过第10关保存11后解锁。预览不授予正式装扮。
- 金币由云事务同时扣款与授予，复用pvpEconomyRevision；重复购买请求不重复扣款。广告只有SDK完成奖励回调提交claim；重复claim不重复增加次数。解锁不自动装备。
- 请求响应丢失时保留原请求ID，重开窗口确认结果。云端拒绝/不可用不伪装成功。普通存档同步不能覆盖服务端拥有权。

## 发布状态与剩余操作

1. 在游戏对应CloudBase环境创建 `profile_customization_requests` 集合，仅允许云函数访问。使用用户身份哈希+requestId作为文档ID；不要直接清理仍可能重试的请求记录。
2. 先部署兼容云函数：`updateUserProfileAssets`（包含profile-customization.js、profile-catalog.json、profile-retired.json）、`syncUserState`、`leaderboard`、`pvpService`、`coopService`。沿用项目现有环境与依赖。
3. CDN资源和远程清单已于2026-09-17按用户授权发布至A、B两槽，25张图片各自回读SHA-256一致；两槽远程入口内容一致、HTTP200。后续更新命令如下：

```powershell
node scripts/prepare-profile-assets.js
node scripts/create-profile-prefabs.js --assets-only
node scripts/sync-profile-data-cdn-wechat.js --cdn-slot=A --dry-run
node scripts/sync-profile-data-cdn-wechat.js --cdn-slot=B --dry-run
# 已获对应发布授权时，去掉 --dry-run 上传。
```

脚本先校验本地清单、尺寸及全部图片SHA-256，上传并回读验证所有PNG后，上传版本2manifest，最后发布运行时入口 `profile_live.json`。入口使用 `Cache-Control:no-cache`，哈希图片使用长期不可变缓存；不删除旧图。默认地址由当前关卡CDN的同级 `profile/` 目录派生，也可显式注入 `__PDD_PROFILE_DATA_CDN_URL__`。`sync-wechat-cdn.js`已纳入该步骤，A/B都必须显式指定。

远程美术入口只管理既有编号的图片文件、尺寸和头像框内圈范围；解锁条件和拥有权仍由既有客户端/服务端规则管理。客户端每次启动、每个槽位读取一个一致快照，失败重试一次并记录诊断，可使用同槽上次有效缓存；没有有效清单时仅默认款可使用包内兜底，其余保持占位/已有展示。好友开放域收到主域已验证快照，同样按编号使用新图及新内圈。未来同编号换图不改变解锁资格，下次启动生效；新增编号或修改经济规则仍需相应代码/后端更新。

**本次仍需发布一次包含远程加载逻辑的新客户端**；旧客户端不会因为远程出现清单而自动获得读取能力。上述CloudBase集合/云函数部署及微信真机验收尚未执行，不包含在本次CDN上传内。

4. 发布客户端前，在微信测试环境检查：新老账号云恢复；9/10关边界；广告取消/完成/重复回调；金币不足/响应丢失/并发购买；授权昵称与头像、后续切换头像和框；好友各自上线写入profile_v1后的显示；长屏和窗口重复开关；正式错误记录入库和断网补报。

## 验证命令

```powershell
node --test tests/profile-customization.test.js tests/profile-customization-client.test.js
node tests/sync-user-state-progress-invariant.test.js
node tests/pvp-economy.test.js
node tests/pvp-client-economy.test.js
node tests/leaderboard-avatar.test.js
```

新增测试使用本地事务/云接口模型，覆盖幂等、丢响应恢复、预览隔离、活动锁定；不能替代真实CloudBase事务或微信激励广告验收。广告完成信号仍来自客户端SDK，本次没有接入独立的服务端广告验真。

本地验收：19项针对性测试通过；限定源码TypeScript和独立Cocos构建通过。使用Home直接启动的UI测试档，在390×844、360×640下检查过窗口、滚动、活动锁定和昵称失败反馈。完整Boot启动与微信真机链路不在该UI结果的覆盖范围。全量历史测试仍有既有mock及布局/文案源码断言失败，不能据此宣称全套测试通过。

美术配置生成脚本 `prepare-profile-assets.js` 读取保留的自有原图，调用已有Python/Pillow环境导出160像素头像、256像素头像框，采用256色索引PNG（有损减色）；框以预乘透明度高质量缩放，保留调色板透明度；按压缩后的内圈生成共享几何数据，再生成客户端/云端清单和开放域轻量映射。`create-profile-prefabs.js --assets-only`同步默认/预览图片及metadata，不重写窗口布局。正式发布只读取已保存的 `config/profile-assets`，不访问参考游戏CDN。旧哈希导出归档在temp，原图保留在config/profile-art-source。

2026-09-17压缩及远程清单：图片总计3,425,702→2,515,749字节，减少26.6%；静态缩略图检查通过。26项针对性测试、限定源码TypeScript、独立Cocos构建通过；覆盖跨槽缓存隔离、远程默认款替换、图片对应内圈、清单失败诊断/有界重试和既有解锁权保留。A/B线上校验记录见 `.planning/profile-implementation/cdn-art-publish-verification.json`。浏览器控制不可用，本次未做真实UI和微信真机验收，云函数未部署。

第二轮压缩（当前）：用户要求尽量接近参考资源体积。比较160/256真彩PNG、160/256索引PNG、128/192索引PNG后，选择160/256索引方案，合计381,183字节（头像216,716，框164,467），比上一轮减少84.8%。细微渐变有损失，静态128像素显示下检查所有25张轮廓和透明框边缘；未做真机视觉验收。14项针对性测试、TypeScript及隔离Cocos构建通过，A/B全部PNG回读哈希校验及入口校验通过。未改图集加载架构、解锁规则或布局；home分包默认组合仍保留。

排行榜统一：普通/自身排行的AvatarMask改为矩形并按默认框内圈设置初始大小；有装扮身份时关闭旧遮罩，交由个人信息共用渲染器适配。微信好友开放域统一矩形裁切，包括授权头像。PVP/合作复用排行榜模板同步生效。
预制体编辑修复：ProfilePanel和同生成器ChangeNicknamePanel补齐cc.PrefabInfo/cc.CompPrefabInfo；此前根节点_prefab=null会令Creator编辑模式读取instance时报错。只补元数据不改布局，生成器同步修正。编辑器仍须重新导入更新后的预制体，实际打开待验收。

2026-09-18：新装扮感叹号和两个分类提示加入轻晃/停顿循环，隐藏、切页、关闭时停止并复位。排行榜头像框外尺寸由56改为80，恢复约49的内圈头像；全国榜、自身条目、好友开放域同步，窗口与文字尺寸未调整。ChangeNicknamePanel无运行时引用，已移至temp/profile-unused-nickname且不再生成；AppTransition仍用于场景/局内圆形收放过渡，保留。好友默认图位于openDataContext/ranking，构建打入rankingArt微信分包，更新包内兜底需重新构建发布微信客户端，CDN更新不能替代。

2026-09-18微信点击头像修复：RichText模块虽列入includeModules，但微信构建overwriteProjectSettings又将rich-text关闭，旧正式包cc入口仅导出RichTextComponent而缺少RichText，造成getComponent错误3804及null.string。已将覆盖项设为on，新增release/debug生成配置回归，以及正式产物cc入口RichText导出检查。另修复Windows开发者工具占用项目目录时Release回传删除根目录导致EPERM：保留匹配目录，清除范围内旧条目，覆盖后校验字节一致性。Home缺少Toast节点是独立的错误提示缺失，本次未修改场景。
