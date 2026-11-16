# V0.6.1 成长履历数据规范化

## 已做
1. 荣誉记录新增 `isTest` 字段，默认为 `false`。管理员创建精彩手牌或冠军记录时，可明确勾选「测试记录」。
2. 原有已认证手牌、冠军记录，可以由**超级管理员**在管理页面点「标为测试」，使用 `markTest` API 标记；保留原始数据、审核状态和证书，不删除历史记录。
3. 标记变化记录在既有 `hand_audit` 集合（记录 ID、原/新标记、操作人、原因和时间）。
4. `memberGrowth` 的成长履历统计与时间线排除 `isTest===true` 的荣誉记录。未明确标记的旧记录不会被自动识别为测试。其他荣耀页面和统计仍沿用原有独立规则。
5. 增加超级管理员维护函数 `memberMaintenance`：
   - `auditDates`：只读，检查会员是否有 `joinedAt` 或原始 `createdAt`。
   - `backfillFromCreatedAt`：只对原 `createdAt` 有效且 `joinedAt` 缺失的会员补入真实创建时间。
   - `setJoinedAt`：需要明确指定内部 `memberId` 和经确认的 `YYYY-MM-DD`，只允许首次补录，防止覆盖。
6. 新用户注册时已写入 `joinedAt`，无需额外处理。

## 安全边界
- 原来测试过的「V0.3冠军证书测试（非真实活动）」以及两张精彩手牌，不会因为文本包含「测试」就自动标记；需要超级管理员人工确认。
- 不能把头像、昵称、备注、微信绑定时间当作真实加入日期。
- 如果旧会员没有 `createdAt`，界面会暂时保留「记录中」，等待明确日期补录。
- 所有数据库写入都发生在可信云函数中，客户端不能擅自修改 `isTest` 或加入日期。
- 操作前备份 `members`、`hand_records`、`champion_awards` 与 `hand_audit`。

## 部署
1. 拉取最新 GitHub 代码。
2. 重新部署 `highlightAdmin`、`championAdmin`、`memberGrowth`。
3. 新部署 `memberMaintenance`（云端安装依赖，目录须包含 `memberLookup.js`）。
4. 重新编译/上传体验版。原集合保持不变，无需新建集合。
5. 超级管理员在「精彩手牌管理」和「冠军证书管理」逐条确认「标为测试」。检查成长履历的认证荣誉次数下降，正式认证数据不变化。
6. **加入日期补录**，先执行只读审核：

```js
wx.cloud.callFunction({
  name:'memberMaintenance', data:{action:'auditDates'}
}).then(({result})=>console.log('JOIN_DATE_AUDIT',result)).catch(console.error);
```

如有原始 `createdAt`，管理员可补入：

```js
wx.cloud.callFunction({
 name:'memberMaintenance', data:{action:'backfillFromCreatedAt'}
}).then(({result})=>console.log('JOIN_DATE_BACKFILL',result)).catch(console.error);
```

对没有原始创建时间的旧会员，需管理员核对真实日期后按会员 ID 单独补录：

```js
wx.cloud.callFunction({
 name:'memberMaintenance',
 data:{action:'setJoinedAt',memberId:'YC000001',date:'2026-11-15'}
}).then(({result})=>console.log('JOIN_DATE_SET',result)).catch(console.error);
```

以上日期仅作为已知最初管理员会员记录的**示例**，操作前需确认实际加入日期。不能给所有会员套用相同日期。

## 验收
- 已标记测试的已认证荣誉不再计入 `memberGrowth` 数量和时间线。
- 未标记测试的正式已认证荣誉保留。
- 旧会员加入日期如果有可信来源，可展示该日期；没有来源不生成虚假日期。
- 会员主键、OpenID 身份链接、积分、管理员权限、报名记录都不变。
