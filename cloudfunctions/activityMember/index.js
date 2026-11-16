const cloud=require('wx-server-sdk');
const crypto=require('crypto');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database();
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=128;
const view=x=>({id:x._id,title:x.title,category:x.category,description:x.description||'',location:x.location,startDate:x.startDate,startTime:x.startTime,posterFileID:x.posterFileID||'',status:x.status});
// 公共活动海报使用云函数凭据生成临时 URL，不依赖各体验成员的云存储读取权限。
async function attachPosters(activities){
 const rows=activities.map(view);
 const ids=Array.from(new Set(rows.map(x=>x.posterFileID).filter(x=>typeof x==='string'&&/^cloud:\/\/[a-zA-Z0-9._-]+\/activity-posters\//.test(x))));
 if(!ids.length)return rows;
 try{
  const result=await cloud.getTempFileURL({fileList:ids});
  const urls={};
  (result.fileList||[]).forEach(x=>{if(x.fileID&&x.tempFileURL&&(!x.status||x.status===0))urls[x.fileID]=x.tempFileURL;});
  rows.forEach(x=>{x.posterSrc=urls[x.posterFileID]||'';});
 }catch(err){console.error('[activityMember:posterLinks]',err);}
 return rows;
}
async function me(){const openid=cloud.getWXContext().OPENID;if(!openid)throw Error('UNAUTHENTICATED');const q=await db.collection('members').where({_openid:openid}).limit(1).get();if(!q.data.length)throw Error('REGISTER_REQUIRED');return q.data[0];}
async function eventById(id){if(!valid(id))throw Error('INVALID_ID');const q=await db.collection('activities').doc(id).get().catch(()=>null);if(!q||!q.data||q.data.status!=='published')throw Error('ACTIVITY_NOT_AVAILABLE');return q.data;}
function signupId(activityId,memberId){return 'as_'+crypto.createHash('sha256').update(activityId+':'+memberId).digest('hex').slice(0,36);}
exports.main=async(event={})=>{
 const action=event.action;
 if(action==='list'){
  const q=await db.collection('activities').where({status:'published'}).limit(50).get();
  const activities=await attachPosters(q.data);
  return {activities:activities.sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime))};
 }
 if(action==='detail'){
  const a=await eventById(event.id);
  const decorated=await attachPosters([a]);
  const output={activity:decorated[0],myStatus:'not_registered'};
  const openid=cloud.getWXContext().OPENID;
  if(openid){
   const q=await db.collection('members').where({_openid:openid}).limit(1).get();
   if(q.data.length){
    const row=await db.collection('activity_signups').doc(signupId(a._id,q.data[0]._id)).get().catch(()=>null);
    output.myStatus=row&&row.data&&row.data.status==='applied'?'applied':'none';
   }
  }
  return output;
 }
 if(action==='mine'){
  const member=await me();
  const q=await db.collection('activity_signups').where({memberId:member._id,status:'applied'}).limit(100).get();
  return {applications:q.data.map(s=>({activityId:s.activityId,title:s.title,category:s.category,startDate:s.startDate,startTime:s.startTime,location:s.location})).sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime))};
 }
 if(action==='apply'){
  const member=await me(),a=await eventById(event.id);
  if(new Date(a.startsAt).getTime()<=Date.now())throw Error('ACTIVITY_ENDED');
  const id=signupId(a._id,member._id);
  const old=await db.collection('activity_signups').doc(id).get().catch(()=>null);
  if(old&&old.data){
   if(old.data.status==='applied')return {status:'applied',alreadyApplied:true};
   const result=await db.collection('activity_signups').where({_id:id,status:'cancelled'}).update({data:{status:'applied',updatedAt:db.serverDate(),nickname:member.nickname}});
   if(result.stats.updated)return {status:'applied',alreadyApplied:false};
   throw Error('CONCURRENT_UPDATE');
  }
  try{
   await db.collection('activity_signups').add({data:{
    _id:id,activityId:a._id,memberId:member._id,nickname:member.nickname,
    title:a.title,category:a.category,startDate:a.startDate,startTime:a.startTime,
    location:a.location,status:'applied',createdAt:db.serverDate(),updatedAt:db.serverDate()
   }});
  }catch(e){
   const again=await db.collection('activity_signups').doc(id).get().catch(()=>null);
   if(again&&again.data&&again.data.memberId===member._id&&again.data.status==='applied')return {status:'applied',alreadyApplied:true};
   throw e;
  }
  return {status:'applied',alreadyApplied:false};
 }
 if(action==='cancel'){
  const member=await me();
  if(!valid(event.id))throw Error('INVALID_ID');
  const id=signupId(event.id,member._id);
  const old=await db.collection('activity_signups').doc(id).get().catch(()=>null);
  if(!old||!old.data||old.data.status==='cancelled')return {status:'cancelled'};
  const changed=await db.collection('activity_signups').where({_id:id,memberId:member._id,status:'applied'}).update({data:{status:'cancelled',updatedAt:db.serverDate()}});
  if(!changed.stats.updated)throw Error('CONCURRENT_UPDATE');
  return {status:'cancelled'};
 }
 throw Error('UNSUPPORTED_ACTION');
};
