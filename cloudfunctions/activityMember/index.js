'use strict';
const {findMember,APP_ID}=require('./memberLookup');
const cloud=require('wx-server-sdk');
const {createRegistration,signupId}=require('./registration');
const {readParticipation}=require('./participation');
const {feedbackStatus,submitFeedback,readRecaps,eligiblePeriods}=require('./feedback');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
const register=createRegistration(db);
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=128;
const view=x=>({id:x._id,title:x.title,category:x.category,description:x.description||'',location:x.location,startDate:x.startDate,startTime:x.startTime,posterFileID:x.posterFileID||'',status:x.status,isTest:x.isTest===true});
async function attachPosters(activities){
 const rows=activities.map(view);
 const ids=Array.from(new Set(rows.map(x=>x.posterFileID).filter(x=>typeof x==='string'&&/^cloud:\/\/[a-zA-Z0-9._-]+\/activity-posters\//.test(x))));
 if(!ids.length)return rows;
 try{
  const result=await cloud.getTempFileURL({fileList:ids}),urls={};
  (result.fileList||[]).forEach(x=>{if(x.fileID&&x.tempFileURL&&(!x.status||x.status===0))urls[x.fileID]=x.tempFileURL;});
  rows.forEach(x=>{x.posterSrc=urls[x.posterFileID]||'';});
 }catch(err){console.error('[activityMember:posterLinks]',err);}
 return rows;
}
async function me(){
 const ctx=cloud.getWXContext();if(!ctx.OPENID)throw Error('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 const m=await findMember(db,ctx.OPENID);if(!m)throw Error('REGISTER_REQUIRED');
 if(m.status&&m.status!=='active')throw Error('MEMBER_DISABLED');return m;
}
async function eventById(id){
 if(!valid(id))throw Error('INVALID_ID');
 const r=await db.collection('activities').doc(id).get();
 if(!r.data||r.data.status!=='published')throw Error('ACTIVITY_NOT_AVAILABLE');return r.data;
}
exports.main=async function(event){
 event=event||{};
 if(event.action==='list'){
  const r=await db.collection('activities').where({status:'published'}).limit(50).get();
  const rows=await attachPosters(r.data);
  return {activities:rows.sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime))};
 }
 if(event.action==='detail'){
  const a=await eventById(event.id),decorated=await attachPosters([a]);
  const output={activity:decorated[0],myStatus:'not_registered'};
  const ctx=cloud.getWXContext();
  if(ctx.OPENID){
   if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
   const m=await findMember(db,ctx.OPENID);
   if(m){
    if(m.status&&m.status!=='active')throw Error('MEMBER_DISABLED');
    const r=await db.collection('activity_signups').doc(signupId(a._id,m._id)).get();
    const s=r.data;
    output.feedbackStatus=feedbackStatus(a,s);
    output.myStatus=s&&s.status==='applied'?(s.attendance&&s.attendance.status==='checked_in'?'checked_in':'applied'):'none';
   }
  }
  return output;
 }
 if(event.action==='feedback')return submitFeedback(db,event.id,await me(),event.answers);
 if(event.action==='recaps')return {recaps:await readRecaps(db,(await me())._id)};
 if(event.action==='mine'){
  const member=await me(),r=await readParticipation(db,member._id);
  return {applications:r.applications,participated:r.participated,formalAttended:r.formalParticipated.length,recapLabels:eligiblePeriods(r.formalParticipated).map(period=>period.label)};
 }
 if(event.action==='apply'||event.action==='cancel')return register(event.action,event.id,await me());
 throw Error('UNSUPPORTED_ACTION');
};
