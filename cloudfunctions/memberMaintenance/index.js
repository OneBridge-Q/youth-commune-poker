const cloud=require('wx-server-sdk');
const {findMember}=require('./memberLookup');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function parseDate(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('INVALID_JOIN_DATE');
 const d=new Date(v+'T12:00:00+08:00');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==new Date(v+'T12:00:00+08:00').toISOString().slice(0,10)||d.getTime()>Date.now())throw Error('INVALID_JOIN_DATE');
 return d;
}
exports.main=async function(event){
 event=event||{};
 const openid=cloud.getWXContext().OPENID;
 const actor=await findMember(db,openid);
 if(!actor||actor.role!=='superadmin')throw Error('FORBIDDEN');
 if(event.action==='auditDates'){
  const rows=await db.collection('members').orderBy('_id','asc').limit(100).get();
  return {total:rows.data.length,records:rows.data.map(function(m){
   return {id:m._id,nickname:m.nickname||'',hasJoinedAt:!!m.joinedAt,hasCreatedAt:!!m.createdAt};
  })};
 }
 if(event.action==='backfillFromCreatedAt'){
  const rows=await db.collection('members').orderBy('_id','asc').limit(100).get();
  let filled=0,unresolved=0,alreadyPresent=0;
  for(const m of rows.data){
   if(m.joinedAt){alreadyPresent++;continue;}
   if(!m.createdAt||Number.isNaN(new Date(m.createdAt).getTime())){unresolved++;continue;}
   const updated=await db.collection('members').where({_id:m._id,joinedAt:db.command.exists(false)}).update({data:{
    joinedAt:m.createdAt,joinedAtSource:'original_created_at',updatedAt:db.serverDate()
   }});
   if(updated.stats.updated)filled++;else alreadyPresent++;
  }
  return {processed:rows.data.length,filled,unresolved,alreadyPresent};
 }
 if(event.action==='setJoinedAt'){
  if(typeof event.memberId!=='string'||event.memberId.length>120)throw Error('INVALID_MEMBER_ID');
  const date=parseDate(event.date);
  const member=await db.collection('members').doc(event.memberId).get().catch(function(){return null});
  if(!member||!member.data)throw Error('MEMBER_NOT_FOUND');
  if(member.data.joinedAt)throw Error('JOIN_DATE_ALREADY_SET');
  const done=await db.collection('members').where({_id:event.memberId,joinedAt:db.command.exists(false)}).update({data:{
   joinedAt:date,joinedAtSource:'admin_confirmed',joinedAtSetBy:actor._id,updatedAt:db.serverDate()
  }});
  if(!done.stats.updated)throw Error('CONCURRENT_UPDATE');
  return {updated:true,memberId:event.memberId,date:event.date};
 }
 throw Error('UNSUPPORTED_ACTION');
};
