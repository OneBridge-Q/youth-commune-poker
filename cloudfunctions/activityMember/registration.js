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
    if(s.status==='applied'&&s.capacityCounted===true){
     const a=(await tx.collection('activities').doc(activityId).get()).data;
     if(!a||!Number.isSafeInteger(a.signupCount)||a.signupCount<1)throw Error('CAPACITY_STATE_INVALID');
     await tx.collection('activities').doc(activityId).update({data:{signupCount:a.signupCount-1,signupRevision:db.command.inc(1)}});
    }
    await tx.collection('activity_signups').doc(id).update({data:{status:'cancelled',capacityCounted:false,updatedAt:new Date(now())}});
    return {status:'cancelled'};
   }
   const a=(await tx.collection('activities').doc(activityId).get()).data;
   if(!a||a.status!=='published')throw Error('ACTIVITY_NOT_AVAILABLE');
   if(s&&s.status==='applied')return {status:'applied',alreadyApplied:true};
   if(a.feeFen>0)throw Error('PAYMENT_NOT_AVAILABLE');
   if(a.capacity>0&&(!Number.isSafeInteger(a.signupCount)||a.signupCount<0))throw Error('CAPACITY_STATE_INVALID');
   if(a.capacity>0&&a.signupCount>=a.capacity)throw Error('ACTIVITY_FULL');
   if(!Number.isFinite(new Date(a.startsAt).getTime())||new Date(a.startsAt).getTime()<=now())throw Error('ACTIVITY_ENDED');
   if(s&&s.attendance&&s.attendance.status==='checked_in')throw Error('SIGNUP_CONFLICT');
   // Same guard as check-in: cancellation/publishing cannot interleave unnoticed.
   await tx.collection('activities').doc(activityId).update({data:Object.assign({signupRevision:db.command.inc(1)},a.capacity>0?{signupCount:a.signupCount+1}:{})});
   const snapshot={nickname:m.nickname,title:a.title,category:a.category,startDate:a.startDate,startTime:a.startTime,location:a.location,isTest:a.isTest===true,capacityCounted:a.capacity>0,status:'applied',updatedAt:new Date(now())};
   if(s){await tx.collection('activity_signups').doc(id).update({data:snapshot});}
   else {await tx.collection('activity_signups').doc(id).set({data:Object.assign({activityId:activityId,memberId:m._id,createdAt:new Date(now())},snapshot)});}
   return {status:'applied',alreadyApplied:false};
  });
 };
}
module.exports={createRegistration,signupId};
