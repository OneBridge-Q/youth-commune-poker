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
function memberActive(member){return member&&(!member.status||member.status==='active');}
function walkInOpen(activity,ms){
 const begins=start(activity);
 return activity.status==='published'&&Number.isFinite(begins)&&ms>=begins-7200000&&ms<begins+43200000;
}
function createService(cloud,clock){
 const db=cloud.database({throwOnNotFound:false}),now=clock||Date.now;
 async function get(reader,col,key){const r=await reader.collection(col).doc(key).get();return r.data||null;}
 async function scan(activityId){
  let cursor='',all=[];
  while(true){
   const q={activityId:activityId,status:db.command.in(['applied','walk_in_pending'])};if(cursor)q._id=db.command.gt(cursor);
   const r=await db.collection('activity_signups').where(q).orderBy('_id','asc').limit(100).get();
   all=all.concat(r.data);if(all.length>MAX)throw Error('ROSTER_LIMIT_REACHED');
   if(r.data.length<100)return all;
   cursor=r.data[r.data.length-1]._id;
  }
 }
 return async function(event){
  event=event||{};
  if(!['list','checkIn','revoke','history','arrivalList','requestArrival'].includes(event.action))throw Error('UNSUPPORTED_ACTION');
  if(event.action!=='arrivalList'&&!id(event.activityId))throw Error('INVALID_ACTIVITY_ID');
  const ctx=cloud.getWXContext();
  if(!ctx.OPENID)throw Error('UNAUTHENTICATED');
  if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
  const actor=await findMember(db,ctx.OPENID);
  if(event.action==='arrivalList'){
   const ms=now(), dates=[ms-43200000,ms,ms+7200000].map(time=>stamp(time).slice(0,10));
   const activities=[];
   for(let cursor='';;){
    const query={status:'published',startDate:db.command.in([...new Set(dates)])};
    if(cursor)query._id=db.command.gt(cursor);
    const result=await db.collection('activities').where(query).orderBy('_id','asc').limit(100).get();
    activities.push(...result.data.filter(a=>walkInOpen(a,ms)&&a.isTest!==true&&id(a.storeId)));
    if(result.data.length<100)break;
    cursor=result.data[result.data.length-1]._id;
   }
   const rows=[];
   for(const a of activities){
    const s=memberActive(actor)?await get(db,'activity_signups','as_'+digest(a._id+':'+actor._id).slice(0,36)):null;
    rows.push({id:a._id,title:a.title,location:a.location,startDate:a.startDate,startTime:a.startTime,
     status:s&&state(s)==='checked_in'?'checked_in':s&&s.status==='walk_in_pending'?'requested':s&&s.status==='applied'?'booked':'available'});
   }
   rows.sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime));
   return {registered:!!actor,activities:rows};
  }
  if(event.action==='requestArrival'){
   if(!actor)throw Error('REGISTER_REQUIRED');
   return db.runTransaction(async tx=>{
    const m=await get(tx,'members',actor._id);
    if(!memberActive(m))throw Error('MEMBER_NOT_ACTIVE');
    const a=await get(tx,'activities',event.activityId),ms=now();
    if(!a||!id(a.storeId)||a.isTest===true||!walkInOpen(a,ms))throw Error('ARRIVAL_NOT_OPEN');
    const signupId='as_'+digest(a._id+':'+m._id).slice(0,36);
    const ref=tx.collection('activity_signups').doc(signupId),s=(await ref.get()).data;
    if(s&&(s.activityId!==a._id||s.memberId!==m._id))throw Error('SIGNUP_CONFLICT');
    if(s&&state(s)==='checked_in')return {status:'checked_in'};
    if(s&&s.status==='applied')return {status:'booked'};
    if(s&&s.status==='walk_in_pending')return {status:'requested'};
    const at=new Date(ms);
    const data={status:'walk_in_pending',nickname:m.nickname||'会员',source:'onsite',capacityCounted:false,
     title:a.title,category:a.category,startDate:a.startDate,startTime:a.startTime,location:a.location||'',
     isTest:m.isTest===true,updatedAt:at};
    await tx.collection('activities').doc(a._id).update({data:{attendanceRevision:db.command.inc(1)}});
    if(s)await ref.update({data});
    else await ref.set({data:{...data,activityId:a._id,memberId:m._id,createdAt:at}});
    return {status:'requested'};
   });
  }
  assertActor(actor);
  const activity=await get(db,'activities',event.activityId);
  if(!activity)throw Error('ACTIVITY_NOT_FOUND');scope(actor,activity);
  if(event.action==='list'){
   const keyword=typeof event.keyword==='string'?event.keyword.trim().toLowerCase():'';
   const filter=event.filter||'all',offset=event.offset===undefined?0:event.offset;
   if(keyword.length>32||!['all','checked_in','not_checked_in'].includes(filter)||!Number.isInteger(offset)||offset<0||offset>MAX)throw Error('INVALID_QUERY');
   const all=await scan(activity._id);
   const pending=all.filter(s=>s.status==='walk_in_pending');
   const arrived=all.filter(s=>state(s)==='checked_in').length;
   const rows=all.filter(s=>(!keyword||String(s.nickname||'').toLowerCase().includes(keyword))&&(filter==='all'||state(s)===filter));
   const ms=now(),starts=start(activity);
   return {activity:{id:activity._id,title:activity.title,startDate:activity.startDate,startTime:activity.startTime,status:activity.status,isTest:activity.isTest===true},
    canCheckIn:activity.status==='published'&&Number.isFinite(starts)&&ms>=starts-7200000,
    stats:{registered:all.length-pending.length,checkedIn:arrived,notCheckedIn:all.length-arrived-pending.length},pendingArrivals:pending.length,matched:rows.length,
    rows:rows.slice(offset,offset+PAGE).map(s=>({id:s._id,nickname:s.nickname||'会员',walkInPending:s.status==='walk_in_pending',attendanceStatus:state(s),attendanceVersion:version(s),checkedInAt:stamp(s.attendance&&s.attendance.checkedInAt),isTest:activity.isTest===true||s.isTest===true||!!(s.attendance&&s.attendance.isTest)})),
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
    if(s.status!=='applied'&&s.status!=='walk_in_pending')throw Error('SIGNUP_CANCELLED');
    if(s.status==='walk_in_pending'&&!walkInOpen(a,now()))throw Error('ARRIVAL_NOT_OPEN');
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
   await tx.collection('activity_signups').doc(s._id).update({data:{attendance:next,updatedAt:at,...(s.status==='walk_in_pending'?{status:'applied'}:{})}});
   await tx.collection('attendance_audit').doc('att_'+digest(s._id+':'+v)).set({data:{
    signupId:s._id,activityId:a._id,memberId:s.memberId,storeId:a.storeId,version:v,action:event.action,
    from:checked?'checked_in':'not_checked_in',to:next.status,operatorId:actor._id,at:at,reason:reason,isTest:isTest,requestId:event.requestId
   }});
   return {id:s._id,status:next.status,version:v,isTest:isTest};
  });
 };
}
module.exports={createService};
