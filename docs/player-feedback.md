# 玩家问题反馈（简版）

主页左上方“问题反馈”打开独立 FeedbackPanel 预制体。仅包含描述输入、提交、关闭；最多 500 个 UTF-16 字符。不提供分类、联系方式、图片或回复功能。

设置也提供入口：设置框与底部玩法提示卡片之间的小气泡图标和“问题反馈”。提示卡片下移 60 个设计像素。打开反馈时暂时隐藏设置，保留设置的计时器/传送带暂停状态；反馈关闭或成功确认后回到设置。设置已销毁时不会重新显示。

## 云端上线步骤

此功能使用微信云开发。部署前在游戏所用环境建立 `user_feedback` 和 `user_feedback_limits` 集合，设置客户端读写均禁止（仅管理端/云函数访问）。再部署 `cloudfunctions/submitFeedback` 并安装云端依赖。不要把集合设置为所有用户可读写。

`user_feedback` 每条记录包含：云端身份 openid、content、source、platform、levelId、device、system、createdAt（服务端时间）、status（初始 pending）。可在云开发控制台按 createdAt 查看，手工将 status 改为 processing/resolved。没有自动消息通知或玩家回复。

`user_feedback_limits` 为防重复刷提交的辅助集合。同一用户新反馈间隔至少 60 秒。相同请求 ID 重试返回原记录；同 ID 不允许改变内容。事务保证反馈与频控一起写入。

## 验证与边界

- 云端确认 ok 且返回 feedbackId 后，原弹窗切换为成功确认界面：标题“提示”，正文“提交成功！我们非常重视您的反馈，感谢您的支持与信任！”，按钮“确认”。点击确认关闭，不再调用提交接口；相关文案由 FeedbackPanel 预制体控制。
- 网络错误/15 秒超时保留文字与请求 ID，支持重试去重。
- 编辑中草稿在当前首页运行期保留；退出场景或退出游戏不持久化。
- 第一版仅微信可真实提交；浏览器和抖音显示明确的不可提交提示。
- 上线前在微信真机验证软键盘、多行输入、提交成功、断网重试，并从控制台确认对应记录。浏览器/单元测试不代表云端已经部署。

## 本次本地验证

`feedback-service.test.js`、`feedback-panel.test.js`、`feedback-prefab.test.js`、`home-scene-node-tree-integrity.test.js` 已通过。源码类型检查使用兼容项目现有环境的命令行覆盖 `--ignoreDeprecations 6.0 --skipLibCheck --lib ES2020,DOM` 通过，未修改 tsconfig。

Creator 预览存在导入滞后：正常入口的打开、空提交校验、关闭已验证；最终布局通过直接反序列化当前磁盘预制体在 Cocos 浏览器中检查，并验证输入。`.planning/20260911-feedback/*-source-review.png` 是当前源码渲染图，不能代替刷新 AssetDB 后的完整验收。

## 云端部署记录（2026-09-11）

- 环境：`cloud1-d5gzq8ia0c404ee3e`，与客户端配置一致。
- 已创建 `user_feedback`、`user_feedback_limits`；管理接口回读两者权限均为 `ADMINONLY`。
- 已部署 `submitFeedback`：状态 `Active`，运行时 `Nodejs16.13`，超时 10 秒，已安装云端依赖。
- 已下载云端代码核对：`index.js`、`service.js`、`package.json` 与本地逐字节一致。
- 无微信玩家身份的云端调用正确返回 `{ok:false,code:"UNAUTHORIZED"}`，证明入口及依赖可运行；该检查不写入反馈。
- 用户已反馈提交测试正常。之后新增的成功确认界面已通过本地流程回归及类型检查，尚未进行新的真机视觉验证。
