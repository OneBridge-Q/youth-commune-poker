const {findMember}=require('./memberLookup');
const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database();
const TYPES=new Set(['straight_flush','four_of_a_kind','full_house','flush','straight','three_of_a_kind','two_pair','one_pair','high_card']);
const safe=s=>typeof s==='string'&&s.length>0&&s.length<=100;
exports.main=async(event={})=>{
 const openid=cloud.getWXContext().OPENID;if(!openid)throw Error('UNAUTHENTICATED');
 const actor=await findMember(db,openid);if(!actor||!['admin','superadmin'].includes(actor.role))throw Error('FORBIDDEN');
 const privileged=actor.role==='superadmin';const action=event.action;
 if(action==='members'){
  const keyword=String(event.keyword||'').trim();if(keyword.length<2||keyword.length>30)throw Error('INVALID_SEARCH');
  const re=db.RegExp({regexp:keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),options:'i'});
  const r=await db.collection('members').where({nickname:re,...(privileged?{}:{storeId:actor.storeId})}).limit(15).get();
  return {members:r.data.map(x=>({id:x._id,nickname:x.nickname}))};
 }
 if(action==='list'){
  const status=['pending','verified','rejected','voided'].includes(event.status)?event.status:'pending';
  const r=await db.collection('hand_records').where({status,...(privileged?{}:{storeId:actor.storeId})}).orderBy('createdAt','desc').limit(50).get();
  return {records:r.data.map(x=>({id:x._id,memberId:x.memberId,category:x.category,status:x.status,occurredAt:x.occurredAt,note:x.note||''}))};
 }
 if(action==='create'){
  const {memberId,storeId,sessionId=null,tableId=null,occurredAt,category,note=''}=event;
  if(!safe(memberId)||!safe(storeId)||!TYPES.has(category)||!safe(occurredAt)||Number.isNaN(Date.parse(occurredAt))||typeof note!=='string'||note.length>500)throw Error('INVALID_INPUT');
  if(!privileged&&actor.storeId!==storeId)throw Error('WRONG_STORE');
  const m=await db.collection('members').doc(memberId).get().catch(()=>null);if(!m||!m.data)throw Error('MEMBER_NOT_FOUND');
  if(!privileged&&m.data.storeId!==storeId)throw Error('MEMBER_WRONG_STORE');
  const data={memberId,storeId,sessionId,tableId,occurredAt:new Date(occurredAt),category,note,source:'admin_manual',status:'pending',actionDataStatus:'not_collected',createdBy:actor._id,createdAt:db.serverDate(),updatedAt:db.serverDate()};
  const r=await db.collection('hand_records').add({data});return {id:r._id,status:'pending'};
 }
 if(action==='review'){
  if(!safe(event.id)||!['verified','rejected','voided'].includes(event.decision))throw Error('INVALID_INPUT');
  const r=await db.collection('hand_records').doc(event.id).get().catch(()=>null);if(!r||!r.data)throw Error('NOT_FOUND');
  const item=r.data;if(!privileged&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  if(!privileged&&item.createdBy===actor._id)throw Error('SELF_REVIEW_NOT_ALLOWED');
  if(!((item.status==='pending'&&['verified','rejected'].includes(event.decision))||(item.status==='verified'&&event.decision==='voided')))throw Error('INVALID_TRANSITION');
  // Optimistic status guard. For strict atomic audit, migrate to a database transaction before production.
  const result=await db.collection('hand_records').where({_id:event.id,status:item.status}).update({data:{status:event.decision,verifiedBy:actor._id,verifiedAt:db.serverDate(),updatedAt:db.serverDate()}});
  if(!result.stats.updated)throw Error('CONCURRENT_UPDATE');
  await db.collection('hand_audit').add({data:{recordId:event.id,from:item.status,to:event.decision,actorId:actor._id,createdAt:db.serverDate()}});
  return {id:event.id,status:event.decision};
 }
 throw Error('UNSUPPORTED_ACTION');
};