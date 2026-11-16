const cloud=require('wx-server-sdk');
const crypto=require('crypto');
const {findMember,identityId,APP_ID}=require('./memberLookup');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
const POLICY_VERSION='v0.4-2026-11-15';
const DEFAULT_STORE='store-001';

function publicMember(m){
 return {id:m._id,nickname:m.nickname,avatarFileID:m.avatarFileID||'',role:m.role||'member'};
}
function validateName(value){
 if(typeof value!=='string')throw Error('INVALID_NICKNAME');
 const nickname=value.trim().replace(/\s+/g,' ');
 if(Array.from(nickname).length<2||Array.from(nickname).length>16||/[\x00-\x1f\x7f]/.test(nickname))throw Error('INVALID_NICKNAME');
 return nickname;
}
function validateAvatar(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string'||value.length>300||!/^cloud:\/\/[a-zA-Z0-9._-]+\/member-avatars\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(value))throw Error('INVALID_AVATAR');
 return value;
}
async function getLink(id){
 const r=await db.collection('member_identities').doc(id).get().catch(function(){return null;});
 return r&&r.data?r.data:null;
}
async function ensureLegacyLink(openid,member){
 const id=identityId(openid);
 const prior=await getLink(id);
 if(prior){
  if(prior.memberId!==member._id)throw Error('IDENTITY_CONFLICT');
  return;
 }
 try{
  await db.collection('member_identities').add({data:{
   _id:id,memberId:member._id,provider:'wechat_miniprogram',appId:APP_ID,
   openidHash:crypto.createHash('sha256').update(openid).digest('hex'),
   status:'active',verification:'legacy_same_app',linkedAt:db.serverDate()
  }});
 }catch(e){
  const again=await getLink(id);
  if(!again||again.memberId!==member._id)throw e;
 }
}
exports.main=async function(event){
 event=event||{};
 const ctx=cloud.getWXContext(),openid=ctx.OPENID;
 if(!openid)throw Error('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 const old=await findMember(db,openid);
 if(event.action==='updateProfile'){
  if(!old)throw Error('REGISTER_REQUIRED');
  const change={nickname:validateName(event.nickname),updatedAt:db.serverDate()};
  if(Object.prototype.hasOwnProperty.call(event,'avatarFileID'))change.avatarFileID=validateAvatar(event.avatarFileID);
  await db.collection('members').doc(old._id).update({data:change});
  return {updated:true,member:publicMember(Object.assign({},old,change))};
 }
 if(old){
  await ensureLegacyLink(openid,old);
  return {registered:true,alreadyRegistered:true,member:publicMember(old)};
 }
 if(event.consent!==true||event.policyVersion!==POLICY_VERSION)throw Error('CONSENT_REQUIRED');
 const nickname=validateName(event.nickname),avatarFileID=validateAvatar(event.avatarFileID);
 const linkId=identityId(openid),collection=db.collection('member_identities');
 let link=await getLink(linkId);
 if(!link){
  const newId='m_'+crypto.randomBytes(16).toString('hex');
  try{
   await collection.add({data:{
    _id:linkId,memberId:newId,provider:'wechat_miniprogram',appId:APP_ID,
    openidHash:crypto.createHash('sha256').update(openid).digest('hex'),
    verification:'same_app_authenticated_openid',status:'provisioning',createdAt:db.serverDate()
   }});
  }catch(e){
   link=await getLink(linkId);
   if(!link)throw e;
  }
  if(!link)link=await getLink(linkId);
 }
 if(!link||!link.memberId)throw Error('IDENTITY_MISSING');
 if(link.status!=='provisioning')throw Error('IDENTITY_CONFLICT');
 let memberResult=await db.collection('members').doc(link.memberId).get().catch(function(){return null});
 if(!memberResult||!memberResult.data){
  const data={
   _id:link.memberId,nickname,avatarFileID,role:'member',storeId:DEFAULT_STORE,
   skillPoints:0,rewardPoints:0,rank:'待评级',status:'active',
   registrationSource:'wechat_miniprogram',policyVersion:POLICY_VERSION,
   consentAt:db.serverDate(),joinedAt:db.serverDate(),
   createdAt:db.serverDate(),updatedAt:db.serverDate(),schemaVersion:2
  };
  try{await db.collection('members').add({data:data});}
  catch(e){
   memberResult=await db.collection('members').doc(link.memberId).get().catch(function(){return null});
   if(!memberResult||!memberResult.data)throw e;
  }
 }
 const done=await collection.where({_id:linkId,memberId:link.memberId,status:'provisioning'}).update({
  data:{status:'active',linkedAt:db.serverDate()}
 });
 if(!done.stats.updated){
  const latest=await getLink(linkId);
  if(!latest||latest.memberId!==link.memberId||latest.status!=='active')throw Error('CONCURRENT_REGISTRATION');
 }
 memberResult=await db.collection('members').doc(link.memberId).get();
 return {registered:true,alreadyRegistered:false,member:publicMember(memberResult.data)};
};
