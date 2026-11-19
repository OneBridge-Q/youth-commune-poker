'use strict';

const {signupId}=require('./registration');
const {readParticipation,stamp}=require('./participation');
const GAMES=['结对德州','明牌德州','技能德州'];

function feedbackStatus(activity,signup){
 if(!activity.feedbackOpenedAt||!signup||signup.status!=='applied'||signup.attendance?.status!=='checked_in')return 'closed';
 return signup.feedback?'submitted':'open';
}

async function submitFeedback(db,activityId,member,answers){
 if(typeof activityId!=='string'||!activityId||activityId.length>128)throw Error('INVALID_ID');
 if(!Array.isArray(answers)||!answers.length||answers.length>GAMES.length)throw Error('INVALID_FEEDBACK');
 const seen=new Set();
 const ratings=answers.map(item=>{
  if(!item||!GAMES.includes(item.game)||seen.has(item.game)||!Number.isInteger(item.rating)||item.rating<1||item.rating>5)throw Error('INVALID_FEEDBACK');
  seen.add(item.game);
  return {game:item.game,rating:item.rating};
 });
 return db.runTransaction(async tx=>{
  const activity=(await tx.collection('activities').doc(activityId).get()).data;
  const ref=tx.collection('activity_signups').doc(signupId(activityId,member._id));
  const signup=(await ref.get()).data;
  if(!activity||activity.status!=='published'||signup?.memberId!==member._id||signup.activityId!==activityId)throw Error('FEEDBACK_UNAVAILABLE');
  const status=feedbackStatus(activity,signup);
  if(status==='closed')throw Error('FEEDBACK_UNAVAILABLE');
  if(status==='open'){
   await tx.collection('activities').doc(activityId).update({data:{feedbackRevision:db.command.inc(1)}});
   await ref.update({data:{feedback:{ratings,submittedAt:new Date()}}});
  }
  return {feedbackStatus:'submitted'};
 });
}

function completedPeriods(now){
 const local=new Date(now+28800000);
 const year=local.getUTCFullYear();
 const month=Math.floor(local.getUTCMonth()/3)*3;
 const iso=(y,m)=>new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
 return [
  {label:month?year+' 年第 '+month/3+' 季度':(year-1)+' 年第 4 季度',start:iso(year,month-3),end:iso(year,month)},
  {label:(year-1)+' 年度',start:iso(year-1,0),end:iso(year,0)}
 ];
}

function eligiblePeriods(activities,now=Date.now()){
 return completedPeriods(now).map(period=>({
  ...period,activities:activities.filter(row=>row.startDate>=period.start&&row.startDate<period.end)
 })).filter(period=>period.activities.length>=2);
}

async function readRecaps(db,memberId,now=Date.now()){
 const {formalParticipated}=await readParticipation(db,memberId,{includeFeedback:true});
 const periods=eligiblePeriods(formalParticipated,now);
 if(!periods.length)return [];
 const hands=[];
 let cursor;
 while(true){
  const query={memberId,status:'verified'};
  if(cursor)query._id=db.command.gt(cursor);
  const {data}=await db.collection('hand_records').where(query).orderBy('_id','asc').limit(100).get();
  hands.push(...data);
  if(data.length<100)break;
  cursor=data[data.length-1]._id;
 }
 return periods.map(({label,start,end,activities})=>{
  const responses=activities.filter(row=>row.feedback?.ratings);
  const games=GAMES.map(game=>{
   const ratings=responses.flatMap(row=>row.feedback.ratings.filter(item=>item.game===game));
   return {game,count:ratings.length,average:ratings.length?(ratings.reduce((total,item)=>total+item.rating,0)/ratings.length).toFixed(1):''};
  }).filter(game=>game.count);
  const recordedHands=hands.filter(hand=>{
   const date=stamp(hand.occurredAt).slice(0,10);
   return hand.isTest!==true&&date>=start&&date<end;
  }).sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt));
  return {label,activityCount:activities.length,responseCount:responses.length,games,handCount:recordedHands.length,
   recentHands:recordedHands.slice(0,3).map(hand=>({id:hand._id,date:stamp(hand.occurredAt).slice(0,10),category:hand.category}))};
 });
}

module.exports={feedbackStatus,submitFeedback,readRecaps,completedPeriods,eligiblePeriods};
