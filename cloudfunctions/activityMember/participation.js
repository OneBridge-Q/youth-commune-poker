'use strict';
function stamp(d){if(!d)return '';const ms=new Date(d).getTime();return Number.isFinite(ms)?new Date(ms+28800000).toISOString().slice(0,16).replace('T',' '):'';}
async function readParticipation(db,memberId,{includeFeedback=false}={}){
 let cursor='',signups=[];
 while(true){
  const q={memberId:memberId,status:'applied'};if(cursor)q._id=db.command.gt(cursor);
  const r=await db.collection('activity_signups').where(q).orderBy('_id','asc').limit(100).get();
  signups=signups.concat(r.data);
  if(signups.length>1000)throw Error('PARTICIPATION_LIMIT_REACHED');
  if(r.data.length<100)break;cursor=r.data[r.data.length-1]._id;
 }
 const ids=Array.from(new Set(signups.map(s=>s.activityId))),activities={};
 for(let i=0;i<ids.length;i+=50){
  const r=await db.collection('activities').where({_id:db.command.in(ids.slice(i,i+50))}).limit(50).get();
  r.data.forEach(a=>{activities[a._id]=a;});
 }
 const applications=[],participated=[];
 // Only the current source activity can authorize inclusion, not a stale title snapshot.
 const seen=new Set();
 signups.forEach(s=>{
  const a=activities[s.activityId];if(!a||a.status!=='published'||seen.has(a._id))return;
  seen.add(a._id);
  const att=s.attendance||{},checked=att.status==='checked_in'&&!!stamp(att.checkedInAt);
  const row={activityId:a._id,title:a.title,category:a.category,startDate:a.startDate,startTime:a.startTime,location:a.location,
   registeredAt:stamp(s.createdAt),checkedInAt:checked?stamp(att.checkedInAt):'',
   isTest:a.isTest===true||s.isTest===true||att.isTest===true,attendanceStatus:checked?'checked_in':'not_checked_in'};
  if(includeFeedback&&checked&&s.feedback)row.feedback=s.feedback;
  (checked?participated:applications).push(row);
 });
 applications.sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime));
 participated.sort((a,b)=>(b.startDate+b.startTime).localeCompare(a.startDate+a.startTime));
 return {applications,participated,formalApplications:applications.filter(x=>!x.isTest),formalParticipated:participated.filter(x=>!x.isTest)};
}
module.exports={readParticipation,stamp};
