# 青年公社 V0.6：统一会员主键与成长履历

## 设计原则
1. **内部主键 `members._id` 不作为用户主页展示内容。** 前台展示「我的成长履历」，内部主键始终保留供报名、荣誉、权限关联。
2. 新会员：由服务端 `crypto.randomBytes(16)` 生成随机且稳定的 `m_<32个十六进制字符>` 作为 `members._id`，不从 OpenID 或昵称推导。
3. 登录身份：`member_identities` 中用 `SHA256(AppID + ':' + OpenID)` 作为确定性唯一文档ID，保存 `memberId`、AppID、状态、验证方式；**不信任客户端传入会员ID**。
4. 旧会员：现有三名体验成员及旧超级管理员的 `members._id`、`_openid`、`memberNo` 原样保留，通过旧登录身份回退+身份表关联兼容。不要直接修改旧 `members._id`，否则现有报名、荣耀数据的外键会断裂。
5. 未来更换公司 AppID：新微信身份需要单独安全核验再关联现有永久会员。当前**没有**跨 AppID 自动认领机制。
6. 前台成长履历只显示真实数据，尚未开发签到时**不能把活动报名计为已参加**。

## 云端数据
- `members`: `_id` 稳定内部会员ID、nickname、avatarFileID、joinedAt、createdAt、role、storeId、status、兴趣/介绍预留字段。新会员不主动写入 `_openid`、`memberNo`。
- `member_identities`: `_id` 当前 AppID + OpenID 哈希，memberId 外键，provider、appId、status、verification。新用户注册时先写入 `provisioning` 关联，再创建会员主档案，最后转为 `active`，重复提交可继续完成未完成注册；跨集合流程不是完整事务，正式规模化需压测和恢复演练。
- `activities` / `activity_signups` / `hand_records` / `champion_awards`: 不修改现有数据格式，引用 `members._id` 继续有效。
- `memberGrowth`：读取当前登录会员的活动报名、认证荣誉，生成只读时间线及统计。报名统计 ≠ 出席统计。
- `member_roles`、`member_contributions` 当前不创建：将来的多角色系统和用户原创贡献可在需要时新增，避免没有业务流程的数据孤岛。目前管理员的 role 字段兼容保留。

## 在微信云开发中部署（务必按照顺序）
1. 在云开发控制台先备份/导出 `members`、`member_identities`、`activity_signups`、`hand_records`、`champion_awards`；即使目前是体验账号也建议保留可回滚备份。
2. 确认 `member_identities` 集合存在。权限：仅管理端可读写。
3. 更新 GitHub 代码后先部署 `memberIdentity`（支持新版身份审计）和 `memberRegister`、`memberHome`。实际注册测试需在这三个函数均部署后进行。
4. 再部署以会员身份登录的云函数：`adminProfile`、`highlightAdmin`、`highlightStats`、`momentDetail`、`championAdmin`、`activityAdmin`、`activityMember`。这些目录都新增了 `memberLookup.js`，上传时**必须使用整个云函数目录**，不能只上传 index.js。
5. 最后新部署 `memberGrowth`（云端安装依赖），更新编译小程序，测试「我的成长履历」。

## 存量三名体验成员核验
- 现有三个体验账号应该保留原来昵称、头像、管理员身份（如果有）、积分、报名记录和荣耀数据。
- 使用超级管理员微信登录，在微信开发者工具 Console 检查：
```js
wx.cloud.callFunction({
  name: 'memberIdentity',
  data: { action:'audit', offset:0 }
}).then(function(r){ console.log('MEMBER_AUDIT',r.result); }).catch(console.error);
```
- `missing` 表示尚未建立身份关联，`conflicts` 表示身份关联与原会员不一致或未激活。检查返回 `nextOffset`，若为数字则查询下一批。
- 旧成员可以调用原有 `memberIdentity` 的超级管理员 `backfill` 操作建立关联（不更改 `members` 主键），**只在审计确认无冲突后执行**。
- 再次审计应期望 `conflicts=0`、`missing=0`，并分别让三个体验账号登录首页和「我的成长履历」，验证不发生重复注册。
- 查验旧活动报名及荣誉统计仍指向同一个 memberId；不要为了测试直接清库。

## 核心验收
1. 旧会员：从微信登录后直接进入原会员档案，无需再次注册。权限、积分、荣誉、报名数据不变。
2. 新会员：完成注册后获得随机内部 `members._id`，`member_identities.memberId` 与之相同；二次打开不新建会员。
3. 前台不突出显示 `memberNo` / OpenID，而是显示成长履历入口。
4. 履历记录包含真实活动报名（明确标注尚未签到）和已审核荣誉，不把取消报名当作实际成长事件。
5. 未来添加 `member_roles` 和 `member_contributions` 时统一引用稳定内部 ID。

## 上线前仍需完善
- 角色分表及授权流程、数据清理/注销、用户数据迁移与同意、身份表唯一约束压测；
- 实际签到及贡献事件来源，避免自报数据直接成为成长认证；
- 分页、隐私保护、云函数日志可观测与异常恢复；
- 同一 AppID 主体变更及跨 AppID 迁移均需在实际场景下重新验证。
