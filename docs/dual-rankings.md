# 红圈 club：好友双榜（2026-11-16 更新）

本说明取代此前「全体会员榜、我的名次」设计。两个页签仍为战力值榜、魅力值榜，但只展示当前登录者在小程序内双方确认的好友。个人战力值、可兑换魅力值余额集中在「我的」顶部个人名片，天梯不再返回或展示本人排名卡。

## 计分规则保持不变
- 战力值：读取 members.skillPoints 正数，长期保留，不随季度清零；本次不新增竞技评级算法。
- 魅力值榜：charisma_ledger 内本自然季度的有效贡献获得与有依据的纠错调整，按北京时间每季切换；不按 rewardPoints 余额排序。
- 兑换不减少季度榜分，换季不清空可兑换余额，不删除历史流水。
- 魅力值只接受 activity_organization、knowledge_sharing、volunteering、community_contribution 来源。status=posted、isTest=false，periodKey 与 effectiveAt 一致。earn 必须为正，adjustment 必须非零。redeem、redemption_refund、扑克输赢/筹码转换来源不进入榜单。
- 每榜最多100位，同分并列（1、1、3）。隐藏排名、停用、测试会员或无正数成绩不展示。

## 好友边界（本次新增）
- 数据库新增 member_friendships，设为「仅管理端可读写」。一条双向关系包含 memberA、memberB（永久内部会员 ID）、status:'accepted'、acceptedBy:[memberA,memberB]；可有 isTest、创建/确认/解除时间等。
- 只有 accepted 且 acceptedBy 包含双方的关系才读取；pending、removed、blocked、测试关系、畸形自关联均排除。同店、同场活动、微信联系人不自动成为好友。
- 只接受服务端从微信登录解析的会员身份；客户端不能通过 memberId、friendIds 或 scope 指定其他人/全体的榜单。
- 关系集合缺失、无权限或读取失败时返回明确错误，不回退为全员榜。没有关系时返回空榜。
- API 返回 scope:'confirmed_friends'，客户端拒绝不带这个标识的旧全员榜响应。只输出昵称、分值、名次和行展示 key，不暴露其他会员永久ID、OpenID或可兑换余额。
- 当前只完成「好友关系读取与排行隔离」，**尚未开发好友邀请、双方确认、解除/拉黑的交互与写入服务**。不要手工把全部会员批量标为好友，也不要以测试关系充当真实社交关系。后续好友写入必须由双端认证和审计验证，不能让客户端直接写 acceptedBy。
- 单次最多扫描1000条当前会员已接受关系，超过时明确报错，不静默遗漏。返回前100位的好友榜。正式规模扩大前补充分页/索引、关系撤回后的缓存治理。

## 部署
1. git pull --ff-only origin main。
2. 新建空集合 member_friendships（仅管理端可读写），保留之前 charisma_ledger 同样的权限，不改余额和旧身份表。
3. 重新部署整个 cloudfunctions/memberRankings 目录，包含新增 friends.js，选择「云端安装依赖」。其他云函数本轮不用重新部署。
4. 编译检查三个页面，再上传并设置新体验版。
5. 没有真实好友关系时显示「还没有已确认的好友」，这是预期；加好友写入流程另行开发。

## 测试
node scripts/test-member-rankings.cjs：29项内存模拟测试；node scripts/test-profile-ui.cjs：12项页面/结构模拟测试。覆盖好友权限隔离、季度边界、不更改余额、旧全员接口拒绝、页面加载/失败/旧请求返回等。本地模拟不等于云聚合或微信真机验收。
