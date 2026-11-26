const {findMember,APP_ID}=require('./memberLookup');
const {awardPlacement,voidPlacement,trophy}=require('./placements');
const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database({throwOnNotFound:false});
function dateLabel(value){
 const time=new Date(value).getTime();
 return value&&Number.isFinite(time)?new Date(time+28800000).toISOString().slice(0,10):'';
}
const valid=s=>typeof s==='string'&&s.trim().length>0&&s.length<=120;
exports.main=async(event={})=>{
 const {OPENID:openid,APPID}=cloud.getWXContext();if(APPID&&APPID!==APP_ID)throw Error('APP_ID_MISMATCH');if(!openid)throw Error('UNAUTHENTICATED');
 const actor=await findMember(db,openid);
 if(!actor)throw Error('MEMBER_NOT_FOUND');
 if(actor.status&&actor.status!=='active')throw Error('FORBIDDEN');
 const isRoot=actor.role==='superadmin',action=event.action;
 if(action!=='mine'&&!['admin','superadmin'].includes(actor.role))throw Error('FORBIDDEN');
 if(action==='awardPlacement'){
  if(!valid(event.activityId)||!valid(event.memberId))throw Error('INVALID_INPUT');
  return awardPlacement(db,actor._id,event.activityId,event.memberId,event.place);
 }
 if(action==='list'){
  const status=['pending','verified','rejected','voided'].includes(event.status)?event.status:'pending';
  let rows;
  if(event.activityId!==undefined){
   if(!valid(event.activityId)||status!=='verified')throw Error('INVALID_INPUT');
   const activity=(await db.collection('activities').doc(event.activityId).get()).data;
   if(!activity||!activity.storeId)throw Error('ACTIVITY_NOT_FOUND');
   if(!isRoot&&activity.storeId!==actor.storeId)throw Error('WRONG_STORE');
   const slots=[activity.firstPlacement,activity.secondPlacement].filter(Boolean);
   rows=await Promise.all(slots.map(async slot=>(await db.collection('champion_awards').doc(slot.awardId).get()).data));
   rows=rows.filter(row=>row&&row.status===status&&row.activityId===activity._id);
  }else{
   const q=await db.collection('champion_awards').where({status,...(isRoot?{}:{storeId:actor.storeId})})
    .orderBy('createdAt','desc').limit(30).get();
   rows=q.data;
  }
  return {records:rows.map(x=>({id:x._id,memberId:x.memberId,eventName:x.eventName,memberName:x.memberName||'',
   trophy:trophy(x),placement:x.source==='sng_placement',status:x.status,certificateId:x.certificateId||'',isTest:x.isTest===true}))};
 }
 if(action==='mine'){
  const offset=event.offset===undefined?0:event.offset;
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('INVALID_INPUT');
  const q=await db.collection('champion_awards').where({memberId:actor._id,status:'verified'})
   .orderBy('awardedAt','desc').skip(offset).limit(30).get();
  return {records:q.data.filter(x=>x.isTest!==true).map(x=>({
   id:x._id,eventName:x.eventName,certificateId:x.certificateId||'',trophy:trophy(x),place:x.place||1,
   date:dateLabel(x.awardedAt)
  })),nextOffset:q.data.length===30?offset+30:null};
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
  if(r.data.source==='sng_placement')throw Error('INVALID_TRANSITION');
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
  if(r.source==='sng_placement'&&event.decision==='voided')return voidPlacement(db,actor._id,event.id);
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