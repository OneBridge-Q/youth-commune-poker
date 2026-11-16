const {findMember}=require('./memberLookup');
const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database();
const valid=s=>typeof s==='string'&&s.trim().length>0&&s.length<=120;
exports.main=async(event={})=>{
 const openid=cloud.getWXContext().OPENID;if(!openid)throw Error('UNAUTHENTICATED');
 const actor=await findMember(db,openid);
 if(!actor)throw Error('MEMBER_NOT_FOUND');
 const isRoot=actor.role==='superadmin',action=event.action;
 if(action!=='mine'&&!['admin','superadmin'].includes(actor.role))throw Error('FORBIDDEN');
 if(action==='list'){
  const status=['pending','verified','rejected','voided'].includes(event.status)?event.status:'pending';
  const q=await db.collection('champion_awards').where({status,...(isRoot?{}:{storeId:actor.storeId})}).orderBy('createdAt','desc').limit(30).get();
  return {records:q.data.map(x=>({id:x._id,memberId:x.memberId,eventName:x.eventName,status:x.status,certificateId:x.certificateId||'',isTest:x.isTest===true}))};
 }
 if(action==='mine'){
  const q=await db.collection('champion_awards').where({memberId:actor._id,status:'verified'}).orderBy('awardedAt','desc').limit(30).get();
  return {records:q.data.filter(x=>x.isTest!==true).map(x=>({id:x._id,eventName:x.eventName,certificateId:x.certificateId||''}))};
 }
 if(action==='create'){
  const {memberId,storeId,eventName,awardedAt,isTest=false}=event;
  if(!valid(memberId)||!valid(storeId)||!valid(eventName)||!valid(awardedAt)||Number.isNaN(Date.parse(awardedAt))||typeof isTest!=='boolean')throw Error('INVALID_INPUT');
  if(!isRoot&&actor.storeId!==storeId)throw Error('WRONG_STORE');
  const member=await db.collection('members').doc(memberId).get().catch(()=>null);
  if(!member||!member.data||(!isRoot&&member.data.storeId!==storeId))throw Error('MEMBER_NOT_FOUND');
  const r=await db.collection('champion_awards').add({data:{memberId,storeId,eventName,awardedAt:new Date(awardedAt),isTest,status:'pending',source:'admin_manual',createdBy:actor._id,createdAt:db.serverDate(),updatedAt:db.serverDate()}});
  return {id:r._id,status:'pending'};
 }
 if(action==='markTest'){
  if(!isRoot)throw Error('SUPERADMIN_REQUIRED');
  if(!valid(event.id)||typeof event.isTest!=='boolean'||typeof event.reason!=='string'||event.reason.trim().length<5||event.reason.length>200)throw Error('INVALID_INPUT');
  const r=await db.collection('champion_awards').doc(event.id).get().catch(()=>null);
  if(!r||!r.data)throw Error('NOT_FOUND');
  const old=r.data.isTest===true;
  if(old===event.isTest)return {id:event.id,isTest:old,unchanged:true};
  const result=await db.collection('champion_awards').where({_id:event.id,isTest:old?true:db.command.neq(true)}).update({data:{
   isTest:event.isTest,testMarkedBy:actor._id,testMarkReason:event.reason.trim(),updatedAt:db.serverDate()
  }});
  if(!result.stats.updated)throw Error('CONCURRENT_UPDATE');
  await db.collection('hand_audit').add({data:{
   recordId:event.id,kind:'champion',action:'markTest',from:old,to:event.isTest,actorId:actor._id,
   reason:event.reason.trim(),createdAt:db.serverDate()
  }});
  return {id:event.id,isTest:event.isTest};
 }
 if(action==='review'){
  if(!valid(event.id)||!['verified','rejected','voided'].includes(event.decision))throw Error('INVALID_INPUT');
  const old=await db.collection('champion_awards').doc(event.id).get().catch(()=>null);
  if(!old||!old.data)throw Error('NOT_FOUND');const r=old.data;
  if(!isRoot&&r.storeId!==actor.storeId)throw Error('WRONG_STORE');
  if(!isRoot&&r.createdBy===actor._id)throw Error('SELF_REVIEW_NOT_ALLOWED');
  if(!((r.status==='pending'&&['verified','rejected'].includes(event.decision))||(r.status==='verified'&&event.decision==='voided')))throw Error('INVALID_TRANSITION');
  const certificateId='YC-C-'+event.id.slice(0,16).toUpperCase();
  const change={status:event.decision,reviewedBy:actor._id,reviewedAt:db.serverDate(),updatedAt:db.serverDate()};
  if(event.decision==='verified')change.certificateId=certificateId;
  const u=await db.collection('champion_awards').where({_id:event.id,status:r.status}).update({data:change});
  if(!u.stats.updated)throw Error('CONCURRENT_UPDATE');
  await db.collection('hand_audit').add({data:{recordId:event.id,kind:'champion',from:r.status,to:event.decision,actorId:actor._id,createdAt:db.serverDate()}});
  return {id:event.id,status:event.decision,certificateId:event.decision==='verified'?certificateId:r.certificateId||null};
 }
 throw Error('UNSUPPORTED_ACTION');
};