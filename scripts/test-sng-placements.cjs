const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { awardPlacement, voidPlacement, trophy } = require('../cloudfunctions/championAdmin/placements');

const activity = { title: '红圈SNG', status: 'published', storeId: 'store', startsAt: new Date(0) };
const signupId = member => 'as_' + createHash('sha256').update('event:' + member).digest('hex').slice(0, 36);
const signup = member => ({
 activityId: 'event', memberId: member, status: 'applied', attendance: { status: 'checked_in' }
});
const remove = Symbol('remove');
let records = {
 activities: { event: activity, test: { ...activity, isTest: true } },
 members: {
  admin: { role: 'admin', storeId: 'store' }, other: { role: 'admin', storeId: 'other' },
  a: { storeId: 'store' }, b: { storeId: 'store', skillPoints: 5 }, c: { storeId: 'store' }
 },
 activity_signups: { [signupId('a')]: signup('a'), [signupId('b')]: signup('b') },
 champion_awards: {}
};
let failAwardWrite = false;
const db = {
 command: { remove: () => remove },
 async runTransaction(work) {
  const copy = structuredClone(records);
  const result = await work({
   collection: name => ({
    doc: id => ({
     get: async () => ({ data: copy[name][id] }),
     set: async ({ data }) => {
      if (failAwardWrite) throw Error('SIMULATED_WRITE_FAILURE');
      copy[name][id] = data;
     },
     update: async ({ data }) => {
      for (const [key, value] of Object.entries(data)) {
       if (value === remove) delete copy[name][id][key];
       else copy[name][id][key] = value;
      }
     }
    })
   })
  });
  records = copy;
  return result;
 }
};
const award = (member, place, actor = 'admin', event = 'event') => awardPlacement(db, actor, event, member, place);

async function test() {
 await assert.rejects(award('a', 1, 'other'), /WRONG_STORE/);
 await assert.rejects(award('a', 1, 'admin', 'test'), /ACTIVITY_NOT_ELIGIBLE/);
 await assert.rejects(award('c', 1), /CHECK_IN_REQUIRED/);
 failAwardWrite = true;
 await assert.rejects(award('a', 1), /SIMULATED_WRITE_FAILURE/);
 assert.equal(records.activities.event.firstPlacement, undefined);
 assert.equal(records.members.a.skillPoints, undefined);
 failAwardWrite = false;

 const first = await award('a', 1);
 assert.equal(records.members.a.skillPoints, 3);
 assert.equal(trophy(records.champion_awards[first.id]), '单场SNG冠军奖杯');
 assert.deepEqual(await award('a', 1), { id: first.id, unchanged: true });
 assert.equal(records.members.a.skillPoints, 3);
 await assert.rejects(award('a', 2), /PLACEMENT_TAKEN/);
 await assert.rejects(award('b', 1), /PLACEMENT_TAKEN/);
 const second = await award('b', 2);
 assert.equal(records.members.b.skillPoints, 6);
 assert.equal(trophy(records.champion_awards[second.id]), '单场SNG亚军奖杯');

 await assert.rejects(voidPlacement(db, 'other', first.id), /WRONG_STORE/);
 await voidPlacement(db, 'admin', second.id);
 await voidPlacement(db, 'admin', second.id);
 assert.equal(records.members.b.skillPoints, 5);
 assert.equal(records.champion_awards[second.id].status, 'voided');
 const replacement = await award('b', 2);
 assert.notEqual(replacement.id, second.id);
 assert.equal(records.members.b.skillPoints, 6);
 assert.equal(trophy({ competitionType: 'weekly', place: 1 }), '周赛冠军奖杯');
 assert.equal(trophy({ competitionType: 'monthly', place: 2 }), '月赛亚军奖杯');
 assert.equal(trophy({}), '冠军荣誉');
 console.log('SNG placement and trophy tests passed');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
