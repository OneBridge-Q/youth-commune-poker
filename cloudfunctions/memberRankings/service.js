'use strict';
const policy = require('./policy');
const { findMember, APP_ID } = require('./memberLookup');
const LIMIT = 100;
function createService(cloud, now) {
  const db = cloud.database(), cmd = db.command, agg = cmd.aggregate;
  const clock = now || Date.now;
  function battlePipeline() {
    return db.collection('members').aggregate()
      .match(policy.visibleFilter(cmd))
      .match({ skillPoints: cmd.gt(0) })
      .project({ _id: 1, nickname: 1, score: '$skillPoints' });
  }
  function charismaPipeline(period) {
    return db.collection('charisma_ledger').aggregate()
      .match(policy.ledgerFilter(cmd, period))
      .group({ _id: '$memberId', score: agg.sum('$rankingDelta') })
      .match({ score: cmd.gt(0) })
      .lookup({ from: 'members', localField: '_id', foreignField: '_id', as: 'member' })
      .unwind('$member')
      .match(policy.visibleFilter(cmd, 'member.'))
      .project({ _id: 1, score: 1, nickname: '$member.nickname' });
  }
  return async function(event) {
    event = event || {};
    const board = event.board || 'battle';
    if (board !== 'battle' && board !== 'charisma') throw new Error('INVALID_BOARD');
    const ctx = cloud.getWXContext();
    if (!ctx.OPENID) throw new Error('UNAUTHENTICATED');
    if (ctx.APPID && ctx.APPID !== APP_ID) throw new Error('APP_ID_MISMATCH');
    const member = await findMember(db, ctx.OPENID);
    if (!member) throw new Error('REGISTER_REQUIRED');
    if (member.status && member.status !== 'active') throw new Error('MEMBER_DISABLED');
    const serverNow = clock(), period = policy.quarterAt(serverNow);
    const pipeline = () => board === 'battle' ? battlePipeline() : charismaPipeline(period);
    let top, mine;
    try {
      top = await pipeline().sort({ score: -1, _id: 1 }).limit(LIMIT).end();
      mine = await pipeline().match({ _id: member._id }).limit(1).end();
    } catch (error) {
      const text = String(error.errMsg || error.message || '');
      if (board === 'charisma' && /collection.*(not exist|not found)|table not exist/i.test(text)) {
        throw new Error('CHARISMA_LEDGER_NOT_READY');
      }
      throw error;
    }
    const own = mine.list && mine.list[0];
    const score = own ? policy.positive(own.score) : 0;
    let myRank = null;
    if (score > 0) {
      const ahead = await pipeline().match({ score: cmd.gt(score) }).count('total').end();
      myRank = ((ahead.list && ahead.list[0] && ahead.list[0].total) || 0) + 1;
    }
    // Read-only. Never reset members.skillPoints / rewardPoints, create ledger rows,
    // infer quarterly earnings from redemption balances, or accept client dates.
    return { board, period: board === 'charisma' ? period : null,
      updatedAt: new Date(serverNow).toISOString(), limit: LIMIT,
      rows: policy.publicRows(top.list || [], member._id),
      me: { score, rank: myRank, eligible: policy.isEligible(member) },
      scoringBasis: board === 'battle' ? 'lifetime-skill-points' : 'quarter-community-earnings' };
  };
}
module.exports = { createService };
