# 统一手牌数据模型 v0.1

目标：首期管理员手动记录精彩手牌，未来接入授权的俯视摄像头识别和完整行动统计。

## hand_records
- id, storeId, sessionId?, tableId?, occurredAt
- memberId (必填), category (枚举), status (pending|verified|rejected|voided)
- source (admin_manual|camera_ai|import), createdBy, verifiedBy?, verifiedAt?
- holeCards? (最多2张), boardCards? (最多5张), bestFiveCards? (可选5张)
- evidenceRef? (受控存储路径), note?, createdAt, updatedAt
- sourceEventId? (幂等标识), confidence? (AI置信度)
- supersedesRecordId? (更正关系)
- actionDataStatus (not_collected|partial|complete)

## 枚举
- straight_flush, four_of_a_kind, full_house, flush, straight, three_of_a_kind, two_pair, one_pair, high_card
- royal_flush 是 straight_flush 的特殊展示标签，不应重复计数

## hand_actions（后续）
- handRecordId, playerId, street, sequence, actionType, amount?, confidence?, source

## 统计规则
- 仅 status=verified 的记录计数；voided/rejected 不计数。
- 每个 hand_records 记录一个会员在一手牌的最终最佳牌型，不能将同一手牌的多个牌型叠加计数。
- 通过 storeId+sessionId+tableId+handNumber+memberId 或 sourceEventId 去重；无法提供 handNumber 时由管理员审核。
- 管理员手工录入仅代表“已记录的精彩手牌次数”，不代表真实出现频率；不能用来计算VPIP/PFR/C-Bet。
- 如果有7张完整牌，服务端应验证最终最佳5张与类别一致；仅填类别时标记证据等级为“管理员确认”，不要声称自动验牌。
- 技术分与兑换分均不因牌型、筹码输赢或下注行为自动发放。

## 隐私与权限
- 会员仅能读取自己的明细；公开榜单必须另行获得同意。
- 只有管理员角色可创建；审核权限独立配置；所有变更留审计日志。
- AI视频采集须单独告知、取得适当授权并提供退出机制；优先本地处理视频。
