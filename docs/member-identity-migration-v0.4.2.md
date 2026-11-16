# 青年公社 V0.4.2：会员身份与 AppID 解耦（第一阶段）

## 原则
- **现有 `members._id` 就是永久内部会员 ID，不修改现有 ID。** 过去部分 ID 由 OpenID 哈希生成，但现在作为不再重算的固定不透明值使用。历史 `memberNo` 原样保留。
- `hand_records.memberId`、`champion_awards.memberId`、`activity_signups.memberId` 等引用都继续指向原 `members._id`，不迁移、不清空。
- 新增 `member_identities` 集合，将一个微信登录身份映射到现有内部会员 ID。集合仅云函数读取、写入。
- 原小程序 AppID：`wx38e120d7481c3436`；身份键按 `SHA-256(AppID + ':' + OpenID)` 派生。仅记录哈希，不返回 OpenID 给小程序。
- `memberIdentity` 云函数从可信云环境取得 OpenID；**客户端不能传入会员 ID 或 OpenID 去认领账号。**
- 首页已注册用户打开时会以最佳努力调用 `memberIdentity`。身份登记失败不影响旧的登录、报名或荣誉功能。
- 超级管理员可分批给现有账号补建身份记录；不会更改会员资料。

## 部署前
1. 在微信云开发控制台对 `members`、`activity_signups`、`hand_records`、`champion_awards` 等集合做可靠备份或导出，并保存备份位置及时间。
2. 数据库创建 `member_identities`（仅管理端可读写）。
3. 更新 GitHub 代码；右键 `cloudfunctions/memberIdentity` → 上传并部署：云端安装依赖。
4. 编译；用已注册会员打开首页。云函数会自动建立一条身份关联。已有超级管理员仍可访问管理员工作台；会员编号、积分和历史记录应保持原样。

## 超级管理员补建存量会员
在开发者工具 Console 中、确保登录的是超级管理员账号，调用：

```js
wx.cloud.callFunction({
  name: 'memberIdentity',
  data: { action: 'backfill', offset: 0 }
}).then(({result}) => console.log('IDENTITY_BACKFILL', result))
  .catch(console.error);
```

输出 `{processed, linked, existing, skipped, nextOffset}`。
若 `nextOffset` 是数字，在下一次调用中使用该数字，直到返回 `null`。每批最多 30 个会员；不要对同一偏移反复增量覆盖。若返回 `skipped > 0`，说明存在缺失原 OpenID 的旧资料，需要人工核实，不能使用昵称关联。

## 验收
1. 在 `members` 集合核对原超级管理员及新会员的 `_id`、`memberNo`、`role`、积分不变。
2. `member_identities` 出现记录，含 `memberId`、`provider`、`appId`、`status=active`。
3. 同一微信账号多次打开首页，不增加重复身份记录。
4. 活动报名、取消报名、已认证荣誉、后台权限仍正常。
5. 新用户注册后首次进入首页，可自动生成身份记录。

## 未来变更公司主体时
- **相同 AppID 的主体变更**：如平台允许且云环境仍可使用，原 OpenID 和关联通常可继续使用；需核对企业主体和数据合规。
- **更换 AppID**：新 OpenID 不同，禁止昵称/头像自动合并。需要另建受验证的安全迁移/账号认领流程，例如旧小程序登录完成的一次性迁移凭证 + 新小程序登录 + 服务端双端核验，或官方合规的跨应用身份方案。
- 该阶段仅建立可扩展的数据结构，**尚未实现跨 AppID 身份认领，也未完成新云环境的数据实际迁移**。
- 新公司环境需要准备数据备份导入、云存储文件迁移、隐私告知/必要的用户同意、支付商户号等配套工作。
- 正式运营前补充身份关联审核日志、唯一约束验证、恢复演练和防滥用监控。
