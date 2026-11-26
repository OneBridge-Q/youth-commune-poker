const crypto = require('crypto');

const POINTS = { 1: 3, 2: 1 };
const SLOTS = { 1: 'firstPlacement', 2: 'secondPlacement' };
const OTHER_SLOT = { 1: 'secondPlacement', 2: 'firstPlacement' };

function trophy(record) {
 const type = { sng: '单场SNG', weekly: '周赛', monthly: '月赛' }[record.competitionType];
 const title = record.place === 2 ? '亚军' : '冠军';
 return type ? type + title + '奖杯' : title + '荣誉';
}

function assertAdmin(actor, storeId) {
 if (!actor || (actor.status && actor.status !== 'active')) throw Error('FORBIDDEN');
 if (actor.role === 'superadmin') return;
 if (actor.role !== 'admin' || !storeId || actor.storeId !== storeId) throw Error('WRONG_STORE');
}

async function get(tx, collection, id) {
 return (await tx.collection(collection).doc(id).get()).data;
}

async function awardPlacement(db, actorId, activityId, memberId, place) {
 if (place !== 1 && place !== 2) throw Error('INVALID_INPUT');
 const awardId = 'sng_' + crypto.randomBytes(16).toString('hex');
 return db.runTransaction(async tx => {
  const activity = await get(tx, 'activities', activityId);
  if (!activity) throw Error('ACTIVITY_NOT_FOUND');
  assertAdmin(await get(tx, 'members', actorId), activity.storeId);
  const begins = new Date(activity.startsAt || activity.startDate + 'T' + activity.startTime + ':00+08:00').getTime();
  if (activity.status !== 'published' || activity.isTest === true || !Number.isFinite(begins) || begins > Date.now()) {
   throw Error('ACTIVITY_NOT_ELIGIBLE');
  }
  const slot = SLOTS[place];
  const existing = activity[slot];
  if (existing && existing.memberId === memberId) return { id: existing.awardId, unchanged: true };
  if (existing || (activity[OTHER_SLOT[place]] || {}).memberId === memberId) throw Error('PLACEMENT_TAKEN');

  const signupHash = crypto.createHash('sha256').update(activityId + ':' + memberId).digest('hex');
  const signup = await get(tx, 'activity_signups', 'as_' + signupHash.slice(0, 36));
  if (!signup || signup.activityId !== activityId || signup.memberId !== memberId ||
      signup.status !== 'applied' || signup.isTest === true ||
      !signup.attendance || signup.attendance.status !== 'checked_in' || signup.attendance.isTest === true) {
   throw Error('CHECK_IN_REQUIRED');
  }
  const member = await get(tx, 'members', memberId);
  if (!member || member.storeId !== activity.storeId || (member.status && member.status !== 'active') || member.isTest === true) {
   throw Error('MEMBER_NOT_ELIGIBLE');
  }
  const now = new Date();
  const points = POINTS[place];
  const score = Number.isFinite(member.skillPoints) ? member.skillPoints : 0;
  await tx.collection('activities').doc(activityId).update({ data: { [slot]: { awardId, memberId } } });
  await tx.collection('champion_awards').doc(awardId).set({ data: {
   activityId, memberId, memberName: member.nickname || '会员', storeId: activity.storeId,
   eventName: activity.title, competitionType: 'sng', place, points, isTest: false,
   status: 'verified', source: 'sng_placement', createdBy: actorId, reviewedBy: actorId,
   certificateId: 'RC-' + awardId.slice(4, 20).toUpperCase(),
   awardedAt: now, createdAt: now, reviewedAt: now, updatedAt: now
  } });
  await tx.collection('members').doc(memberId).update({ data: { skillPoints: score + points } });
  return { id: awardId, points };
 });
}

async function voidPlacement(db, actorId, awardId) {
 return db.runTransaction(async tx => {
  const award = await get(tx, 'champion_awards', awardId);
  if (!award || award.source !== 'sng_placement') throw Error('NOT_FOUND');
  assertAdmin(await get(tx, 'members', actorId), award.storeId);
  if (award.status === 'voided') return { id: awardId, status: 'voided' };

  const activity = await get(tx, 'activities', award.activityId);
  const slot = SLOTS[award.place];
  if (!activity || !slot || !activity[slot] || activity[slot].awardId !== awardId || award.status !== 'verified') {
   throw Error('INVALID_TRANSITION');
  }
  const member = await get(tx, 'members', award.memberId);
  if (!member) throw Error('MEMBER_NOT_FOUND');
  const score = Number.isFinite(member.skillPoints) ? member.skillPoints : 0;
  const now = new Date();
  await tx.collection('activities').doc(award.activityId).update({ data: { [slot]: db.command.remove() } });
  await tx.collection('members').doc(award.memberId).update({ data: { skillPoints: Math.max(0, score - award.points) } });
  await tx.collection('champion_awards').doc(awardId).update({ data: {
   status: 'voided', voidedBy: actorId, voidedAt: now, updatedAt: now
  } });
  return { id: awardId, status: 'voided' };
 });
}

module.exports = { awardPlacement, voidPlacement, trophy };
