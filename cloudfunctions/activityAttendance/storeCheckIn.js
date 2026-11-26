'use strict';
const crypto=require('crypto');

function dayAt(ms){
 return new Date(ms+28800000).toISOString().slice(0,10);
}

function key(...parts){
 return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);
}

async function record(reader,id){
 return (await reader.collection('store_checkins').doc(id).get()).data;
}

function active(member){
 return member&&(!member.status||member.status==='active');
}

async function handleStoreCheckIn(db,cloud,actor,event,now){
 if(event.action==='storeCheckInStatus'){
  if(!actor)return {registered:false};
  if(!active(actor))throw Error('MEMBER_NOT_ACTIVE');
  const result=await db.collection('store_checkins').where({memberId:actor._id,kind:'visit'}).count();
  return {registered:true,count:result.total};
 }
 if(!actor)throw Error('REGISTER_REQUIRED');
 if(!active(actor))throw Error('MEMBER_NOT_ACTIVE');

 if(event.action==='storeCheckInCode'){
  const day=dayAt(now());
  const code=await db.runTransaction(async tx=>{
   const member=(await tx.collection('members').doc(actor._id).get()).data;
   if(!active(member)||!['admin','superadmin'].includes(member.role)||!member.storeId)throw Error('FORBIDDEN');
   const id=key('code',member.storeId,day),existing=await record(tx,id);
   if(existing)return existing;
   const data={kind:'code',storeId:member.storeId,day,token:crypto.randomBytes(16).toString('hex')};
   await tx.collection('store_checkins').doc(id).set({data});
   return data;
  });
  const envVersion=['develop','trial','release'].includes(event.envVersion)?event.envVersion:'release';
  const result=await cloud.openapi.wxacode.getUnlimited({
   scene:code.token,page:'pages/check-in/index',envVersion,checkPath:envVersion==='release',width:430
  });
  if(!result.buffer)throw Error('CODE_IMAGE_UNAVAILABLE');
  return {day,image:Buffer.from(result.buffer).toString('base64')};
 }

 if(typeof event.token!=='string'||!/^[a-f0-9]{32}$/.test(event.token))throw Error('INVALID_STORE_CODE');
 const day=dayAt(now());
 const matches=await db.collection('store_checkins').where({kind:'code',day,token:event.token}).limit(2).get();
 if(matches.data.length!==1)throw Error('STORE_CODE_EXPIRED');
 const code=matches.data[0];
 return db.runTransaction(async tx=>{
  const at=now();
  if(dayAt(at)!==day)throw Error('STORE_CODE_EXPIRED');
  const member=(await tx.collection('members').doc(actor._id).get()).data;
  if(!active(member)||member.isTest===true)throw Error('MEMBER_NOT_ACTIVE');
  const visitId=key('visit',member._id,day);
  const previous=await record(tx,visitId);
  if(previous)return {status:'already_checked_in',day};
  await tx.collection('store_checkins').doc(visitId).set({data:{
   kind:'visit',memberId:member._id,storeId:code.storeId,day,checkedInAt:new Date(at)
  }});
  return {status:'checked_in',day};
 });
}

module.exports={handleStoreCheckIn};
