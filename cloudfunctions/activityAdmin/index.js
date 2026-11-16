const {findMember}=require('./memberLookup');
const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
const CATEGORIES=new Set(['社交交流','知识分享','户外运动','创业共创','其他']);
const plain=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
function summary(r){return {id:r._id,title:r.title,category:r.category,description:r.description||'',location:r.location,startDate:r.startDate,startTime:r.startTime,status:r.status,posterFileID:r.posterFileID||'',storeId:r.storeId,createdAt:r.createdAt};}
async function getEvent(id){if(!plain(id,128))throw Error('INVALID_ID');const r=await db.collection('activities').doc(id).get().catch(()=>null);if(!r||!r.data)throw Error('EVENT_NOT_FOUND');return r.data;}

exports.main=async(event={})=>{
 const openid=cloud.getWXContext().OPENID;
 if(!openid)throw Error('UNAUTHENTICATED');
 const actor=await findMember(db,openid);if(!actor||!['admin','superadmin'].includes(actor.role)||!actor.storeId)throw Error('FORBIDDEN');
 const action=event.action;
 if(action==='list'){
  const a=await db.collection('activities').where(actor.role==='superadmin'?{}:{storeId:actor.storeId}).limit(100).get();
  return {activities:a.data.map(summary).sort((a,b)=>(b.startDate+b.startTime).localeCompare(a.startDate+a.startTime))};
 }
 if(action==='create'){
  const {title,category='其他',description='',location,startDate,startTime,posterFileID=''}=event;
  if(typeof posterFileID!=='string'||(posterFileID&&!/^cloud:\/\/[a-zA-Z0-9._-]+\/activity-posters\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(posterFileID)))throw Error('INVALID_POSTER');
  if(!plain(title,60)||!CATEGORIES.has(category)||typeof description!=='string'||description.length>500||!plain(location,120))throw Error('INVALID_INPUT');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime||''))throw Error('INVALID_DATE');
  const startsAt=new Date(startDate+'T'+startTime+':00+08:00');
  if(Number.isNaN(startsAt.getTime())||startsAt.getTime()<Date.now()+10*60*1000||startsAt.toISOString().slice(0,10)!==new Date(startDate+'T12:00:00+08:00').toISOString().slice(0,10))throw Error('INVALID_DATE');
  const result=await db.collection('activities').add({data:{
   title:title.trim(),category,description:description.trim(),location:location.trim(),
   startDate,startTime,startsAt,posterFileID,status:'draft',storeId:actor.storeId,
   createdBy:actor._id,createdAt:db.serverDate(),updatedAt:db.serverDate()
  }});
  return {id:result._id,status:'draft'};
 }
 if(action==='publish'||action==='cancel'){
  const item=await getEvent(event.id);
  if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  if(action==='publish'&&(item.status!=='draft'||new Date(item.startsAt).getTime()<=Date.now()))throw Error('INVALID_TRANSITION');
  if(action==='cancel'&&!['draft','published'].includes(item.status))throw Error('INVALID_TRANSITION');
  const next=action==='publish'?'published':'cancelled';
  const done=await db.collection('activities').where({_id:item._id,status:item.status}).update({data:{status:next,updatedAt:db.serverDate()}});
  if(!done.stats.updated)throw Error('CONCURRENT_UPDATE');
  return {id:item._id,status:next};
 }
 if(action==='applications'){
  const item=await getEvent(event.id);
  if(actor.role!=='superadmin'&&item.storeId!==actor.storeId)throw Error('WRONG_STORE');
  const a=await db.collection('activity_signups').where({activityId:item._id,status:'applied'}).limit(100).get();
  return {title:item.title,applications:a.data.map(x=>({memberId:x.memberId,nickname:x.nickname,createdAt:x.createdAt}))};
 }
 throw Error('UNSUPPORTED_ACTION');
};
