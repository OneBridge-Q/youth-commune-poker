'use strict';
const policy = require('./policy');
const { findMember, APP_ID } = require('./memberLookup');
const LIMIT = 100;

// Store membership comes from the authenticated member, never a client storeId.
// System-wide ranking is a separate, explicit authenticated read API.
function resolveScope(event, member) {
  const scope = event.scope === undefined ? 'store' : event.scope;
  if (scope !== 'store' && scope !== 'system') throw new Error('INVALID_SCOPE');
  if (scope === 'system') return { scope, storeId: null, scopeLabel: '全系统' };
  const storeId = member.storeId;
  if (typeof storeId !== 'string' || !storeId.trim() || storeId.length > 128) {
    throw new Error('MEMBER_STORE_REQUIRED');
  }
  return { scope, storeId, scopeLabel: '本店' };
}

function createService(cloud, now) {
  const db = cloud.database(), cmd = db.command, agg = cmd.aggregate;
  const clock = now || Date.now;
  function battlePipeline(selection) {
    let pipeline = db.collection('members').aggregate();
    if (selection.scope === 'store') pipeline = pipeline.match({ storeId: selection.storeId });
    return pipeline.match(policy.visibleFilter(cmd))
      .match({ skillPoints: cmd.gt(0) })
      .project({ _id: 1, nickname: 1, score: '$skillPoints' });
  }
  function charismaPipeline(period, selection) {
    let pipeline = db.collection('charisma_ledger').aggregate()
      .match(policy.ledgerFilter(cmd, period))
      .group({ _id: '$memberId', score: agg.sum('$rankingDelta') })
      .match({ score: cmd.gt(0) })
      .lookup({ from: 'members', localField: '_id', foreignField: '_id', as: 'member' })
      .unwind('$member')
      .match(policy.visibleFilter(cmd, 'member.'));
    if (selection.scope === 'store') pipeline = pipeline.match({ 'member.storeId': selection.storeId });
    return pipeline.project({ _id: 1, score: 1, nickname: '$member.nickname' });
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
    const selection = resolveScope(event, member);
    const serverNow = clock(), period = policy.quarterAt(serverNow);
    let top;
    try {
      top = await (board === 'battle' ? battlePipeline(selection) : charismaPipeline(period, selection))
        .sort({ score: -1, _id: 1 }).limit(LIMIT).end();
    } catch (error) {
      const text = String(error.errMsg || error.message || '');
      if (board === 'charisma' && /collection.*(not exist|not found)|table not exist/i.test(text)) {
        throw new Error('CHARISMA_LEDGER_NOT_READY');
      }
      throw error;
    }
    return {
      board, scope: selection.scope, storeId: selection.storeId, scopeLabel: selection.scopeLabel,
      period: board === 'charisma' ? period : null,
      updatedAt: new Date(serverNow).toISOString(), limit: LIMIT,
      rows: policy.publicRows(top.list || [], member._id).map(function(row) {
        return { key: row.key, rank: row.rank, score: row.score, nickname: row.nickname };
      }),
      scoringBasis: board === 'battle' ? 'lifetime-skill-points' : 'quarter-community-earnings'
    };
    // Read-only: no score/balance writes, friendship dependency or self placement card.
    // No missing-store fallback to the system-wide ranking.
  };
}
module.exports = { createService, resolveScope };
