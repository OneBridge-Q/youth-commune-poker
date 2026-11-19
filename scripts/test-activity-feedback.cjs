const assert=require('node:assert/strict');
const {signupId}=require('../cloudfunctions/activityMember/registration');
const {feedbackStatus,submitFeedback,readRecaps,completedPeriods}=require('../cloudfunctions/activityMember/feedback');

const activity=(id,date,extra={})=>({_id:id,status:'published',startDate:date,startTime:'19:30',feedbackOpenedAt:new Date(date),...extra});
const signup=(a,extra={})=>({_id:signupId(a._id,'member'),activityId:a._id,memberId:'member',status:'applied',attendance:{status:'checked_in',checkedInAt:new Date(a.startDate)},...extra});

async function main(){
 const a=activity('a','2025-12-31'),b=activity('b','2025-10-02'),c=activity('c','2025-11-01',{isTest:true});
 const rows={
  activities:[a,b,c],
  activity_signups:[signup(a),signup(b),signup(c)],
  hand_records:[
   {_id:'a',memberId:'member',status:'verified',occurredAt:new Date('2025-12-31T15:59:59Z'),category:'flush'},
   {_id:'b',memberId:'member',status:'verified',occurredAt:new Date('2025-12-31T16:00:00Z'),category:'straight'},
   {_id:'c',memberId:'member',status:'verified',occurredAt:new Date('2025-12-02'),category:'flush',isTest:true},
   {_id:'d',memberId:'other',status:'verified',occurredAt:new Date('2025-12-02'),category:'flush'}
  ]
 };
 const db={
  command:{inc:amount=>amount,in:values=>value=>values.includes(value)},
  collection(name){
   return {
    doc(id){
     const row=rows[name].find(item=>item._id===id);
     return {get:async()=>({data:row}),update:async({data})=>Object.assign(row,data)};
    },
    where(query){
     return {orderBy(){return this;},limit(size){return {get:async()=>({data:rows[name].filter(row=>Object.entries(query).every(([key,value])=>typeof value==='function'?value(row[key]):row[key]===value)).slice(0,size)})};}};
    }
   };
  },
  runTransaction(fn){return fn(this);}
 };
 const rating={game:'结对德州',rating:5};
 assert.equal(feedbackStatus({...a,feedbackOpenedAt:null},rows.activity_signups[0]),'closed');
 assert.equal(feedbackStatus(a,{status:'applied'}),'closed');
 await assert.rejects(submitFeedback(db,'a',{_id:'other'},[rating]),/FEEDBACK_UNAVAILABLE/);
 await assert.rejects(submitFeedback(db,'a',{_id:'member'},[rating,rating]),/INVALID_FEEDBACK/);
 const submit=(event,answers)=>submitFeedback(db,event,{_id:'member'},answers);
 await submit('a',[rating,{game:'明牌德州',rating:4}]);
 await submit('a',[{...rating,rating:1}]);
 await submit('b',[{...rating,rating:3}]);
 await submit('c',[{game:'技能德州',rating:1}]);
 const now=Date.parse('2025-12-31T16:00:00Z');
 assert.equal(completedPeriods(now)[0].label,'2025 年第 4 季度');
 const recaps=await readRecaps(db,'member',now);
 assert.equal(recaps.length,2);
 for(const recap of recaps){
  assert.equal(recap.activityCount,2);
  assert.equal(recap.responseCount,2);
  assert.equal(recap.handCount,1);
  assert.deepEqual(recap.games,[{game:'结对德州',count:2,average:'4.0'},{game:'明牌德州',count:1,average:'4.0'}]);
 }
 rows.activity_signups[0].attendance.status='revoked';
 await assert.rejects(submit('a',[rating]),/FEEDBACK_UNAVAILABLE/);
 assert.deepEqual(await readRecaps(db,'member',now),[]);
 console.log('Activity feedback and recap checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
