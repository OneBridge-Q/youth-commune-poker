'use strict';
const PAGE_SIZE = 100;
const MAX_LINKS = 1000;
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
// Friendships are app-local, confirmed by both members. Never infer them from
// attending the same event, belonging to a store, or client-supplied member IDs.
function friendFrom(row, memberId) {
  if (!row || row.status !== 'accepted' || row.isTest === true ||
      !validId(row.memberA) || !validId(row.memberB) || row.memberA === row.memberB ||
      !Array.isArray(row.acceptedBy) || row.acceptedBy.indexOf(row.memberA) < 0 ||
      row.acceptedBy.indexOf(row.memberB) < 0) return null;
  if (row.memberA === memberId) return row.memberB;
  if (row.memberB === memberId) return row.memberA;
  return null;
}
async function loadFriendIds(db, memberId) {
  const cmd = db.command, found = new Set();
  const filter = cmd.and([
    { status: 'accepted' },
    cmd.or([{ memberA: memberId }, { memberB: memberId }])
  ]);
  try {
    for (let offset = 0; offset <= MAX_LINKS; offset += PAGE_SIZE) {
      const result = await db.collection('member_friendships').where(filter)
        .orderBy('_id', 'asc').skip(offset).limit(offset === MAX_LINKS ? 1 : PAGE_SIZE).get();
      const rows = result.data || [];
      if (offset === MAX_LINKS) {
        if (rows.length) throw new Error('FRIEND_SCOPE_LIMIT');
        break;
      }
      rows.forEach(row => { const friend = friendFrom(row, memberId); if (friend) found.add(friend); });
      if (rows.length < PAGE_SIZE) break;
    }
  } catch (error) {
    const text = String(error.errMsg || error.message || '');
    if (/collection.*(not exist|not found)|table not exist|DATABASE_COLLECTION_NOT_EXIST/i.test(text)) {
      throw new Error('FRIENDSHIPS_NOT_READY');
    }
    // A failed read must never fall back to a global member leaderboard.
    throw error;
  }
  found.delete(memberId);
  return Array.from(found);
}
module.exports = { loadFriendIds, friendFrom };
