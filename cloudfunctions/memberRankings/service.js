'use strict';
const policy = require('./policy');
const { findMember, APP_ID } = require('./memberLookup');
const { loadFriendIds } = require('./friends');
const LIMIT = 100;
function createService(cloud, now) {
  const db = cloud.database(), cmd = db.command, agg = cmd.aggregate;
  const clock = now || Date.now;
  function battlePipeline(ids) {
    return db.collection('members').aggregate()
      .match({ _id: cmd.in(ids) })
      .match(policy.visibleFilter(cmd))
      .match({ skillPoints: cmd.gt(0) })
      .project({ _id: 1, nickname: 1, score: '$skillPoints' });
  }
  function charismaPipeline(period, ids) {
    return db.collection('charisma_ledger').aggregate()
      .match({ memberId: cmd.in(ids) })
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
    const ids = await loadFriendIds(db, member._id);
    const result = {
      board, scope: 'confirmed_friends', period: board === 'charisma' ? period : null,
      updatedAt: new Date(serverNow).toISOString(), limit: LIMIT, friendCount: ids.length,
      rows: [], scoringBasis: board === 'battle' ? 'lifetime-skill-points' : 'quarter-community-earnings'
    };
    if (!ids.length) return result;
    let top;
    try {
      top = await (board === 'battle' ? battlePipeline(ids) : charismaPipeline(period, ids))
        .sort({ score: -1, _id: 1 }).limit(LIMIT).end();
    } catch (error) {
      const text = String(error.errMsg || error.message || '');
      if (board === 'charisma' && /collection.*(not exist|not found)|table not exist/i.test(text)) {
        throw new Error('CHARISMA_LEDGER_NOT_READY');
      }
      throw error;
    }
    result.rows = policy.publicRows(top.list || [], member._id).map(function(row) {
      return { key: row.key, rank: row.rank, score: row.score, nickname: row.nickname };
    });
    // No self placement, global fallback, balance writes or client-selected scope.
    return result;
  };
}
module.exports = { createService };
