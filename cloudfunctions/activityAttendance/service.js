'use strict';
const crypto=require('crypto');
const {findMember,APP_ID}=require('./memberLookup');
const PAGE=40;
const MAX=1000;
function id(v){return typeof v==='string'&&v.length>0&&v.length<=128;}
function digest(v){return crypto.createHash('sha256').update(v).digest('hex');}
function version(s){const n=s.attendance&&s.attendance.version;return Number.isInteger(n)&&n>=0?n:0;}
function state(s){return s.attendance&&s.attendance.status==='checked_in'?'checked_in':'not_checked_in';}
function start(a){const ms=new Date(a.startsAt||a.startDate+'T'+a.startTime+':00+08:00').getTime();return Number.isFinite(ms)?ms:NaN;}
function stamp(d){if(!d)return '';const n=new Date(d).getTime();return Number.isFinite(n)?new Date(n+28800000).toISOString().slice(0,16).replace('T',' '):'';}
function scope(m,a){if(!id(a.storeId))throw Error('ACTIVITY_STORE_REQUIRED');if(m.role!=='superadmin'&&a.storeId!==m.storeId)throw Error('WRONG_STORE');}
function assertActor(m){if(!m||!['admin','superadmin'].includes(m.role)||(m.status&&m.status!=='active'))throw Error('FORBIDDEN');if(m.role!=='superadmin'&&!id(m.storeId))throw Error('FORBIDDEN');}
function createService(cloud,clock){
 const db=cloud.database({throwOnNotFound:false}),now=clock||Date.now;
 async function get(reader,col,key){const r=await reader.collection(col).doc(key).get();return r.data||null;}
 async function scan(activityId){
  let cursor='',all=[];
  while(true){
   const q={activityId:activityId,status:'applied'};if(cursor)q._id=db.command.gt(cursor);
   const r=await db.collection('activity_signups').where(q).orderBy('_id','asc').limit(100).get();
   all=all.concat(r.data);if(all.length>MAX)throw Error('ROSTER_LIMIT_REACHED');
   if(r.data.length<100)return all;
   cursor=r.data[r.data.length-1]._id;
  }
 }
 return async function(event){
  event=event||{};
  if(!['list','checkIn','revoke','history'].includes(event.action))throw Error('UNSUPPORTED_ACTION');
  if(!id(event.activityId))throw Error('INVALID_ACTIVITY_ID');
  const ctx=cloud.getWXContext();
  if(!ctx.OPENID)throw Error('UNAUTHENTICATED');
  if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
  const actor=await findMember(db,ctx.OPENID);assertActor(actor);
  const activity=await get(db,'activities',event.activityId);
  if(!activity)throw Error('ACTIVITY_NOT_FOUND');scope(actor,activity);
  if(event.action==='list'){
   const keyword=typeof event.keyword==='string'?event.keyword.trim().toLowerCase():'';
   const filter=event.filter||'all',offset=event.offset===undefined?0:event.offset;
   if(keyword.length>32||!['all','checked_in','not_checked_in'].includes(filter)||!Number.isInteger(offset)||offset<0||offset>MAX)throw Error('INVALID_QUERY');
   const all=await scan(activity._id);
   const arrived=all.filter(s=>state(s)==='checked_in').length;
   const rows=all.filter(s=>(!keyword||String(s.nickname||'').toLowerCase().includes(keyword))&&(filter==='all'||state(s)===filter));
   const ms=now(),starts=start(activity);
   return {activity:{id:activity._id,title:activity.title,startDate:activity.startDate,startTime:activity.startTime,status:activity.status,isTest:activity.isTest===true},
    canCheckIn:activity.status==='published'&&Number.isFinite(starts)&&ms>=starts-7200000,
    stats:{registered:all.length,checkedIn:arrived,notCheckedIn:all.length-arrived},matched:rows.length,
    rows:rows.slice(offset,offset+PAGE).map(s=>({id:s._id,nickname:s.nickname||'会员',attendanceStatus:state(s),attendanceVersion:version(s),checkedInAt:stamp(s.attendance&&s.attendance.checkedInAt),isTest:activity.isTest===true||s.isTest===true||!!(s.attendance&&s.attendance.isTest)})),
    nextOffset:offset+PAGE<rows.length?offset+PAGE:null};
  }
  if(!id(event.signupId))throw Error('INVALID_SIGNUP_ID');
  if(event.action==='history'){
   const s=await get(db,'activity_signups',event.signupId);
   if(!s||s.activityId!==activity._id)throw Error('SIGNUP_NOT_FOUND');
   const r=await db.collection('attendance_audit').where({signupId:s._id}).orderBy('version','desc').limit(20).get();
   return {records:r.data.map(x=>({action:x.action,version:x.version,reason:x.reason||'',at:stamp(x.at),operatorId:x.operatorId})),partial:r.data.length===20};
  }
  if(!Number.isInteger(event.expectedVersion)||event.expectedVersion<0||typeof event.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(event.requestId))throw Error('INVALID_OPERATION');
  const reason=typeof event.reason==='string'?event.reason.trim():'';
  if(event.action==='revoke'&&(reason.length<2||reason.length>200))throw Error('REVOKE_REASON_REQUIRED');
  const signature=digest(JSON.stringify([actor._id,event.activityId,event.signupId,event.action,event.expectedVersion,reason]));
  // State change and audit are committed together. Reading alone is insufficient for
  // snapshot-isolation conflicts: also write the activity guard on each transition.
  return db.runTransaction(async function(tx){
   const liveActor=await get(tx,'members',actor._id);assertActor(liveActor);
   const a=await get(tx,'activities',activity._id);if(!a)throw Error('ACTIVITY_NOT_FOUND');scope(liveActor,a);
   const s=await get(tx,'activity_signups',event.signupId);
   if(!s||s.activityId!==a._id)throw Error('SIGNUP_NOT_FOUND');
   const old=s.attendance||{};
   if(old.requestId===event.requestId){
    if(old.signature!==signature)throw Error('IDEMPOTENCY_CONFLICT');
    return {id:s._id,status:state(s),version:version(s),idempotent:true};
   }
   if(version(s)!==event.expectedVersion)throw Error('ATTENDANCE_CHANGED');
   const checked=state(s)==='checked_in';
   if(event.action==='checkIn'){
    if(a.status!=='published')throw Error('ACTIVITY_NOT_AVAILABLE');
    if(s.status!=='applied')throw Error('SIGNUP_CANCELLED');
    const m=await get(tx,'members',s.memberId);
    if(!m||(m.status&&m.status!=='active'))throw Error('MEMBER_NOT_ACTIVE');
    if(!Number.isFinite(start(a))||now()<start(a)-7200000)throw Error('CHECKIN_NOT_OPEN');
    if(checked)return {id:s._id,status:'checked_in',version:version(s),unchanged:true};
   }else if(!checked){return {id:s._id,status:'not_checked_in',version:version(s),unchanged:true};}
   if(event.action==='revoke'&&[a.firstPlacement,a.secondPlacement].some(p=>p&&p.memberId===s.memberId)){
    throw Error('REVOKE_PLACEMENTS_FIRST');
   }
   const v=version(s)+1,at=new Date(now()),isTest=a.isTest===true||s.isTest===true||old.isTest===true;
   const next={status:event.action==='checkIn'?'checked_in':'revoked',version:v,isTest:isTest,requestId:event.requestId,signature:signature,
    checkedInAt:event.action==='checkIn'?at:old.checkedInAt||null,checkedInBy:event.action==='checkIn'?actor._id:old.checkedInBy||'',
    revokedAt:event.action==='revoke'?at:null,revokedBy:event.action==='revoke'?actor._id:'',revokeReason:event.action==='revoke'?reason:''};
   await tx.collection('activities').doc(a._id).update({data:{attendanceRevision:db.command.inc(1)}});
   await tx.collection('activity_signups').doc(s._id).update({data:{attendance:next,updatedAt:at}});
   await tx.collection('attendance_audit').doc('att_'+digest(s._id+':'+v)).set({data:{
    signupId:s._id,activityId:a._id,memberId:s.memberId,storeId:a.storeId,version:v,action:event.action,
    from:checked?'checked_in':'not_checked_in',to:next.status,operatorId:actor._id,at:at,reason:reason,isTest:isTest,requestId:event.requestId
   }});
   return {id:s._id,status:next.status,version:v,isTest:isTest};
  });
 };
}
module.exports={createService};
