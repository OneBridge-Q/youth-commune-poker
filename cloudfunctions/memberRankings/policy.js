'use strict';
const OFFSET = 8 * 60 * 60 * 1000;
const SOURCES = ['activity_organization', 'knowledge_sharing', 'volunteering', 'community_contribution'];
function quarterAt(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_SERVER_TIME');
  const local = new Date(date.getTime() + OFFSET);
  const year = local.getUTCFullYear();
  const quarter = Math.floor(local.getUTCMonth() / 3) + 1;
  const month = (quarter - 1) * 3;
  const start = Date.UTC(year, month, 1) - OFFSET;
  const end = Date.UTC(year, month + 3, 1) - OFFSET;
  const day = ms => new Date(ms + OFFSET).toISOString().slice(0, 10);
  return { key: year + '-Q' + quarter, label: year + '年第' + quarter + '季度',
    start, end, startDate: day(start), endDate: day(end - 1),
    nextResetDate: day(end), timezone: 'Asia/Shanghai' };
}
function isEligible(member) {
  return !!member && (member.status === undefined || member.status === 'active') &&
    member.isTest !== true && member.rankVisible !== false;
}
function visibleFilter(command, prefix) {
  const p = prefix || '';
  const active = {}; active[p + 'status'] = 'active';
  const legacy = {}; legacy[p + 'status'] = command.exists(false);
  const flags = {}; flags[p + 'isTest'] = command.neq(true); flags[p + 'rankVisible'] = command.neq(false);
  return command.and([command.or([active, legacy]), flags]);
}
function ledgerFilter(command, period) {
  return command.and([
    { status: 'posted', isTest: false, periodKey: period.key,
      source: command.in(SOURCES),
      effectiveAt: command.gte(new Date(period.start)).and(command.lt(new Date(period.end))) },
    command.or([
      { kind: 'earn', rankingDelta: command.gt(0) },
      { kind: 'adjustment', rankingDelta: command.neq(0) }
    ])
  ]);
}
function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
function publicRows(rows, memberId) {
  let lastScore, rank = 0;
  return rows.map((row, index) => {
    const score = positive(row.score);
    if (!score) throw new Error('INVALID_RANKING_SCORE');
    if (score !== lastScore) rank = index + 1;
    lastScore = score;
    return { key: 'row-' + index, rank, score,
      nickname: typeof row.nickname === 'string' && row.nickname.trim() ? Array.from(row.nickname).slice(0,32).join('') : '会员',
      isMe: row._id === memberId };
  });
}
module.exports = { quarterAt, isEligible, visibleFilter, ledgerFilter, positive, publicRows };
