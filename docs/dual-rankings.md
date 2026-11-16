# 红圈 club：本店双榜与全系统查询接口

## 排名范围（取代之前误设的好友榜）
- 天梯默认显示当前登录会员**所属门店**的会员榜，含本人；不是好友榜，也不是同一品牌所有分店的总榜。
- 服务端从可信微信身份查到 members，再使用其 storeId 筛选。客户端传入 storeId、brandId、memberId、friendIds 都不能改变本店查询范围。
- 本店战力与魅力榜在排序、并列名次和前100截取前完成门店筛选。其他分店的高分不影响本店名次。
- 会员未配置有效 storeId 时返回 MEMBER_STORE_REQUIRED；不会回退成全系统榜或静默显示零成绩。
- 不再读取 member_friendships，删除闲置 friends.js 模块。已有好友集合可保留，本次不删数据库。
- 个人分值仍放「我的」顶部，不恢复天梯个人成绩卡；本人符合条件时作为本店榜的普通一行参与排名。

## 双榜口径不变
- 战力值榜读取 members.skillPoints 的有效正分，长期保留，不随季度归零。
- 魅力值榜读取 charisma_ledger 中北京时间本自然季度的有效贡献获得与纠错值；不按 rewardPoints 余额排序。
- 兑换不降低季度榜分；换季不清空可兑换余额，不删除历史流水。
- 只允许既有 community_contribution、knowledge_sharing、activity_organization、volunteering 来源。已入账且明确非测试；牌局输赢、筹码/战力转换、兑换和退款不计季度榜分。
- 测试、停用、隐藏排名、无有效正分的会员不展示；每榜最多100位，同分并列（1、1、3）。

## 查询接口
现有云函数 memberRankings 增加 scope：

```js
// 默认本店，storeId 由服务端查询，不由前端传入
wx.cloud.callFunction({
  name: 'memberRankings', data: { board: 'battle', scope: 'store' }
});
// 未来所有分店汇总：已经支持接口，暂不提供页面切换按钮
wx.cloud.callFunction({
  name: 'memberRankings', data: { board: 'charisma', scope: 'system' }
});
```

board 支持 battle / charisma；scope 省略时为 store，只接受 store / system。未知、brand、all、confirmed_friends 等范围全部拒绝。

「预留接口」指**已认证会员可显式调用的只读云函数接口**，不是匿名公共接口。system 会聚合本系统所有符合条件的会员（包括尚无门店归属的有效会员）；其 storeId 返回 null。本店接口返回调用者自己的 storeId，页面只接受 scope=store 且带有效 storeId 的响应，拒绝旧好友接口和意外的全系统响应。

只返回名单昵称、分值、名次、行展示key及范围/季度元信息；不返回其他会员ID、OpenID、可兑换余额、门店ID或额外个人成绩卡。不接收客户端时间和计分数据，不修改任何余额。

## 门店归属边界
当前使用 members.storeId 这一单门店归属字段。本店榜是**本店会员的现有成绩排名**，不是按成绩事件发生门店拆分统计。换店后会按新的会员归属参与排名；本次不执行换店或写分。

目前注册函数仍使用 store-001 作为试运营默认门店。真正开分店前，必须补充可信的注册门店分配、换店管理及相应权限校验；不能把所有新用户继续分配同一个默认门店后声称已支持真实分店隔离。多门店同时归属属于后续 membership 关系模型，不在本次改造中假装实现。

## 部署
1. git pull --ff-only origin main。
2. 重新部署整个 cloudfunctions/memberRankings 目录，选择「上传并部署：云端安装依赖」。
3. 本次无需新增任何集合；沿用 members、member_identities、charisma_ledger 的仅管理端读写规则。无需填写或删除 member_friendships。
4. 编译，确认标题为「本店天梯榜」，本店双榜无好友文案，无全系统切换按钮。
5. 上传并设为体验版后让会员验证。原有会员ID、数据、余额、首页和个人中心布局不变。

## 验证与限制
node scripts/test-member-rankings.cjs：36项本地云数据库模拟测试，覆盖同品牌跨门店隔离、本人参与、门店缺失、全系统显式查询、伪造参数、季度切换、并列排名与隐私输出。
node scripts/test-profile-ui.cjs --ranking-only：9项本地页面/结构模拟测试，覆盖接口范围校验、旧接口拒绝、错误提示、异步过期响应和无个人成绩卡。

本次运行以上45项，不以此代替真实云环境聚合、索引和微信真机验收。scripts/test-profile-ui.cjs 不带参数仍可执行首页和个人中心回归测试。
规模扩大后需评估聚合索引/性能及分页；正式赛季结算仍需冻结快照，而非依赖即时榜。不得为填充排名编造正式分值。
