'use strict';
const crypto=require('crypto');
function signupId(a,m){return 'as_'+crypto.createHash('sha256').update(a+':'+m).digest('hex').slice(0,36);}
function createRegistration(db,clock){
 const now=clock||Date.now;
 return async function(action,activityId,member){
  if(!['apply','cancel'].includes(action)||typeof activityId!=='string'||!activityId||activityId.length>128)throw Error('INVALID_INPUT');
  const id=signupId(activityId,member._id);
  return db.runTransaction(async function(tx){
   const found=await tx.collection('activity_signups').doc(id).get(),s=found.data;
   if(s&&(s.memberId!==member._id||s.activityId!==activityId))throw Error('SIGNUP_CONFLICT');
   const m=(await tx.collection('members').doc(member._id).get()).data;
   if(!m||(m.status&&m.status!=='active'))throw Error('MEMBER_DISABLED');
   if(action==='cancel'){
    if(s&&s.attendance&&s.attendance.status==='checked_in')throw Error('CHECKED_IN_CONTACT_ADMIN');
    if(!s||s.status==='cancelled')return {status:'cancelled',unchanged:true};
    await tx.collection('activity_signups').doc(id).update({data:{status:'cancelled',updatedAt:new Date(now())}});
    return {status:'cancelled'};
   }
   const a=(await tx.collection('activities').doc(activityId).get()).data;
   if(!a||a.status!=='published')throw Error('ACTIVITY_NOT_AVAILABLE');
   if(s&&s.status==='applied')return {status:'applied',alreadyApplied:true};
   if(!Number.isFinite(new Date(a.startsAt).getTime())||new Date(a.startsAt).getTime()<=now())throw Error('ACTIVITY_ENDED');
   if(s&&s.attendance&&s.attendance.status==='checked_in')throw Error('SIGNUP_CONFLICT');
   // Same guard as check-in: cancellation/publishing cannot interleave unnoticed.
   await tx.collection('activities').doc(activityId).update({data:{signupRevision:db.command.inc(1)}});
   const snapshot={nickname:m.nickname,title:a.title,category:a.category,startDate:a.startDate,startTime:a.startTime,location:a.location,isTest:a.isTest===true,status:'applied',updatedAt:new Date(now())};
   if(s){await tx.collection('activity_signups').doc(id).update({data:snapshot});}
   else {await tx.collection('activity_signups').doc(id).set({data:Object.assign({activityId:activityId,memberId:m._id,createdAt:new Date(now())},snapshot)});}
   return {status:'applied',alreadyApplied:false};
  });
 };
}
module.exports={createRegistration,signupId};
