'use strict';
const {findMember,APP_ID}=require('./memberLookup');
const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
const CATEGORIES=new Set(['主题社交','社交交流','德州活动','知识分享','户外运动','创业共创','其他']);
const PRODUCT_CATEGORY={"poker":"德州活动","outdoor":"户外运动","hardware":"知识分享","psychology":"知识分享","pitch":"创业共创","mvp":"创业共创"};
const plain=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
function summary(r){return {id:r._id,title:r.title,productId:r.productId||'',category:r.category==='社交交流'?'主题社交':r.category,description:r.description||'',location:r.location,startDate:r.startDate,startTime:r.startTime,status:r.status,feedbackOpen:!!r.feedbackOpenedAt,posterFileID:r.posterFileID||'',storeId:r.storeId,isTest:r.isTest===true,feeFen:r.feeFen||0,feeLabel:r.feeFen>0?'¥'+(r.feeFen/100).toFixed(2):'免费',capacity:r.capacity||0,createdAt:r.createdAt,updatedAt:r.updatedAt,editVersion:r.updatedAt?new Date(r.updatedAt).getTime():0};}
async function getEvent(id){if(!plain(id,128))throw Error('INVALID_ID');const r=await db.collection('activities').where({_id:id}).limit(1).get();if(!r.data.length)throw Error('EVENT_NOT_FOUND');return r.data[0];}
exports.main=async function(event){
 event=event||{};
 const ctx=cloud.getWXContext(),openid=ctx.OPENID;if(!openid)throw Error('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 const actor=await findMember(db,openid);
 if(!actor||!['admin','superadmin'].includes(actor.role)||!actor.storeId||(actor.status&&actor.status!=='active'))throw Error('FORBIDDEN');
 const action=event.action;
 if(action==='list'){
  const a=await db.collection('activities').where(actor.role==='superadmin'?{}:{storeId:actor.storeId}).limit(100).get();
  const rows=a.data.map(summary).sort((a,b)=>(b.startDate+b.startTime).localeCompare(a.startDate+a.startTime));
  for(let i=0;i<rows.length;i+=5){
   await Promise.all(rows.slice(i,i+5).map(async item=>{
    const base={activityId:item.id,status:'applied'};
    const [registered,checkedIn]=await Promise.all([
     db.collection('activity_signups').where(base).count(),
     db.collection('activity_signups').where({...base,'attendance.status':'checked_in'}).count()
    ]);
    item.registered=registered.total;item.checkedIn=checkedIn.total;
   }));
  }
  return {activities:rows};
 }
 if(action==='get'){
  const item=await getEvent(event.id);if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  return {activity:summary(item)};
 }
 if(action==='create'||action==='edit'){
  const {title,category='其他',description='',location,startDate,startTime,posterFileID='',isTest=false,productId='',feeFen=0,capacity=0}=event;
  if(!Number.isSafeInteger(feeFen)||feeFen<0||feeFen>1000000||!Number.isSafeInteger(capacity)||capacity<0||capacity>1000)throw Error('INVALID_SIGNUP_CONFIG');
  if(typeof productId!=='string'||(productId&&(!Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORY,productId)||PRODUCT_CATEGORY[productId]!==category)))throw Error('INVALID_PRODUCT');
  if(typeof posterFileID!=='string'||(posterFileID&&!/^cloud:\/\/[a-zA-Z0-9._-]+\/activity-posters\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(posterFileID)))throw Error('INVALID_POSTER');
  if(!plain(title,60)||!CATEGORIES.has(category)||typeof description!=='string'||description.length>500||!plain(location,120)||typeof isTest!=='boolean')throw Error('INVALID_INPUT');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime||''))throw Error('INVALID_DATE');
  const startsAt=new Date(startDate+'T'+startTime+':00+08:00');
  if(Number.isNaN(startsAt.getTime())||(action==='create'&&startsAt.getTime()<Date.now()+600000)||new Date(startsAt.getTime()+28800000).toISOString().slice(0,10)!==startDate)throw Error('INVALID_DATE');
  const fields={title:title.trim(),category:category==='社交交流'?'主题社交':category,description:description.trim(),location:location.trim(),startDate,startTime,startsAt,posterFileID,productId,feeFen,capacity};
  if(action==='edit'){
   const original=await getEvent(event.id);
   if(actor.role!=='superadmin'&&original.storeId!==actor.storeId)throw Error('WRONG_STORE');
   if(event.editVersion!==(original.updatedAt?new Date(original.updatedAt).getTime():0))throw Error('CONCURRENT_UPDATE');
   const sameTime=original.startDate===startDate&&original.startTime===startTime;
   const count=await db.collection('activity_signups').where({activityId:original._id,status:'applied'}).count();
   const checked=await db.collection('activity_signups').where({activityId:original._id,status:'applied','attendance.status':'checked_in'}).count();
   return db.runTransaction(async tx=>{
    const current=(await tx.collection('activities').doc(original._id).get()).data;
    if(!current||current.status!==original.status||Number(current.signupRevision||0)!==Number(original.signupRevision||0)||String(current.updatedAt)!==String(original.updatedAt))throw Error('CONCURRENT_UPDATE');
    if(actor.role!=='superadmin'&&current.storeId!==actor.storeId)throw Error('WRONG_STORE');
    if(!['draft','published'].includes(current.status)|| (current.status==='published'&&new Date(current.startsAt).getTime()<=Date.now())||checked.total>0)throw Error('EDIT_NOT_AVAILABLE');
    if(count.total>0&&(feeFen!==(current.feeFen||0)||capacity!==(current.capacity||0)))throw Error('SIGNUPS_EXIST');
    if(!sameTime&&startsAt.getTime()<Date.now()+600000)throw Error('INVALID_DATE');
    const data=Object.assign({},fields,{updatedAt:db.serverDate()});
    if(capacity!==(current.capacity||0))data.signupCount=0;
    await tx.collection('activities').doc(current._id).update({data});
    return {id:current._id,status:current.status};
   });
  }
  const r=await db.collection('activities').add({data:Object.assign({},fields,{isTest,signupCount:0,status:'draft',storeId:actor.storeId,createdBy:actor._id,createdAt:db.serverDate(),updatedAt:db.serverDate()})});
  return {id:r._id,status:'draft'};
 }
 if(action==='openFeedback'){
  const item=await getEvent(event.id);
  if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  const startsAt=new Date(item.startsAt||item.startDate+'T'+item.startTime+':00+08:00').getTime();
  if(item.status!=='published'||!Number.isFinite(startsAt)||startsAt>Date.now())throw Error('INVALID_TRANSITION');
  if(item.feedbackOpenedAt)return {feedbackOpen:true};
  const result=await db.collection('activities').where({_id:item._id,status:'published'}).update({
   data:{feedbackOpenedAt:db.serverDate(),feedbackOpenedBy:actor._id}
  });
  if(!result.stats.updated)throw Error('CONCURRENT_UPDATE');
  return {feedbackOpen:true};
 }
 if(action==='publish'||action==='cancel'||action==='markTest'){
  const item=await getEvent(event.id);
  if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  if(action!=='publish'){
   return db.runTransaction(async tx=>{
    const ref=tx.collection('activities').doc(item._id);
    const live=(await ref.get()).data;
    if(!live)throw Error('EVENT_NOT_FOUND');
    if(live.firstPlacement||live.secondPlacement)throw Error('REVOKE_PLACEMENTS_FIRST');
    if(action==='markTest'){
     await ref.update({data:{isTest:true,testMarkedBy:actor._id,testMarkedAt:db.serverDate(),updatedAt:db.serverDate()}});
     return {id:item._id,isTest:true};
    }
    if(!['draft','published'].includes(live.status))throw Error('INVALID_TRANSITION');
    await ref.update({data:{status:'cancelled',updatedAt:db.serverDate()}});
    return {id:item._id,status:'cancelled'};
   });
  }
  if(action==='publish'&&(item.status!=='draft'||new Date(item.startsAt).getTime()<=Date.now()))throw Error('INVALID_TRANSITION');
  const next='published';
  const done=await db.collection('activities').where({_id:item._id,status:item.status}).update({data:{status:next,updatedAt:db.serverDate()}});
  if(!done.stats.updated)throw Error('CONCURRENT_UPDATE');
  return {id:item._id,status:next};
 }
 if(action==='applications'){
  const item=await getEvent(event.id);
  if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  const r=await db.collection('activity_signups').where({activityId:item._id,status:'applied'}).limit(100).get();
  return {title:item.title,applications:r.data.map(s=>({memberId:s.memberId,nickname:s.nickname,createdAt:s.createdAt})),partial:r.data.length===100};
 }
 throw Error('UNSUPPORTED_ACTION');
};
