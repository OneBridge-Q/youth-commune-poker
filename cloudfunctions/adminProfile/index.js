const {findMember,APP_ID}=require('./memberLookup');
const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
const active=m=>m&&(!m.status||m.status==='active')&&m.isTest!==true;
const admin=m=>active(m)&&['admin','superadmin'].includes(m.role)&&m.storeId;
const candidate=(m,store)=>active(m)&&m.storeId===store&&(!m.role||m.role==='member');

exports.main=async (event={})=>{
 const {OPENID,APPID}=cloud.getWXContext();
 if(!OPENID)throw Error('UNAUTHENTICATED');
 if(APPID&&APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 const actor=await findMember(db,OPENID);
 if(!admin(actor))throw Error('FORBIDDEN');
 if(!event.action)return {storeId:actor.storeId,role:actor.role};

 if(event.action==='findCandidates'){
  const keyword=typeof event.keyword==='string'?event.keyword.trim():'';
  if(Array.from(keyword).length<2||keyword.length>32)throw Error('INVALID_SEARCH');
  const result=await db.collection('members').where({storeId:actor.storeId,nickname:keyword}).limit(30).get();
  return {members:result.data.filter(m=>candidate(m,actor.storeId)).map(m=>({
   id:m._id,nickname:m.nickname,memberNo:m.memberNo||''
  }))};
 }

 if(event.action==='appointAdmin'){
  if(typeof event.memberId!=='string'||!event.memberId||event.memberId.length>128)throw Error('INVALID_MEMBER');
  return db.runTransaction(async tx=>{
   const ref=id=>tx.collection('members').doc(id);
   const live=(await ref(actor._id).get()).data;
   if(!admin(live)||live.storeId!==actor.storeId)throw Error('FORBIDDEN');
   const target=(await ref(event.memberId).get()).data;
   if(!candidate(target,live.storeId))throw Error('MEMBER_NOT_ELIGIBLE');
   await ref(event.memberId).update({data:{
    role:'admin',adminAppointedBy:live._id,adminAppointedAt:new Date()
   }});
   return {appointed:true};
  });
 }
 throw Error('UNSUPPORTED_ACTION');
};
