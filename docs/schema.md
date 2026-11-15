# 数据模型（草案）

- members: _openid, nickname, skillPoints, rewardPoints, rank, cityId, storeId
- rating_events: memberId, delta, reason, reviewerId, createdAt
- reward_ledger: memberId, delta, sourceType, sourceId, createdAt
- sessions: storeId, activityType, startsAt, status
- attendance: sessionId, memberId, checkinAt
- hand_actions (future): handId, seatId, street, actionOrder, actionType, amount, confidence, source

积分必须在可信服务端变更并保留审计流水。视频数据仅在明确授权的分析场次处理。
