# Poker Moments MVP

- 会员只能从已审核的精彩手牌记录或冠军荣誉记录生成海报。
- 会员海报：固定深蓝鎏金模板，Canvas本地导出PNG，主动保存相册。
- 四条A图案仅在类别为四条时作为装饰展示；**不是实际手牌证据**。未来应使用已核实牌面替换。
- 冠军记录数据契约 champion_awards: memberId, eventName, awardedAt, certificateId, status='verified', verifiedBy。管理端创建、审核、撤销及证书核验尚待开发，当前不能发放正式冠军证书。
- 未实现朋友圈自动发布；会员自行保存并分享。
- 后续增加海报小程序码、更多模板、证书核验和活动分享。
- 不展示现金输赢、筹码金额、赌博奖励。
