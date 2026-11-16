// V0.4.2: current-AppID identity registry. Does not authorize cross-AppID account claims.
const cloud=require('wx-server-sdk');
const crypto=require('crypto');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
const APP_ID='wx38e120d7481c3436';
const links=db.collection('member_identities');
function identityId(openid){
 return 'wx_'+crypto.createHash('sha256').update(APP_ID+':'+openid).digest('hex');
}
exports.main=async function(event){
 const ctx=cloud.getWXContext();
 const openid=ctx.OPENID;
 if(!openid)throw Error('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 if(event&&event.action==='audit'){
  const adminRows=await db.collection('members').where({_openid:openid}).limit(1).get();
  const admin=adminRows.data[0];
  if(!admin||admin.role!=='superadmin')throw Error('FORBIDDEN');
  const offset=Number(event.offset||0);
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('INVALID_OFFSET');
  const rows=await db.collection('members').orderBy('_id','asc').skip(offset).limit(30).get();
  let matched=0,missing=0,conflicts=0,newSchema=0,noLegacyOpenId=0;
  const issues=[];
  for(const member of rows.data){
   if(member.schemaVersion===2)newSchema++;
   if(!member._openid){noLegacyOpenId++;continue;}
   const link=await links.doc(identityId(member._openid)).get().catch(function(){return null});
   if(!link||!link.data){missing++;continue;}
   if(link.data.memberId!==member._id||link.data.status!=='active'){
    conflicts++;issues.push({memberId:member._id,issue:'IDENTITY_MISMATCH_OR_INACTIVE'});
   }else matched++;
  }
  return {processed:rows.data.length,matched,missing,conflicts,newSchema,noLegacyOpenId,
   issues:issues,nextOffset:rows.data.length===30?offset+30:null};
 }
 if(event&&event.action==='backfill'){
  const adminRows=await db.collection('members').where({_openid:openid}).limit(1).get();
  const admin=adminRows.data[0];
  if(!admin||admin.role!=='superadmin')throw Error('FORBIDDEN');
  const offset=Number(event.offset||0);
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('INVALID_OFFSET');
  const batch=await db.collection('members').orderBy('_id','asc').skip(offset).limit(30).get();
  let linked=0,existing=0,skipped=0;
  for(const m of batch.data){
   if(!m._openid){skipped++;continue;}
   const id=identityId(m._openid);
   const prior=await links.doc(id).get().catch(function(){return null;});
   if(prior&&prior.data){
    if(prior.data.memberId!==m._id)throw Error('IDENTITY_CONFLICT');
    existing++;continue;
   }
   try{
    await links.add({data:{_id:id,memberId:m._id,provider:'wechat_miniprogram',
      appId:APP_ID,openidHash:crypto.createHash('sha256').update(m._openid).digest('hex'),
      verification:'legacy_admin_backfill',status:'active',linkedAt:db.serverDate()}});
    linked++;
   }catch(error){
    const again=await links.doc(id).get().catch(function(){return null;});
    if(!again||!again.data||again.data.memberId!==m._id)throw error;
    existing++;
   }
  }
  return {processed:batch.data.length,linked,existing,skipped,nextOffset:batch.data.length===30?offset+30:null};
 }
 const existingLink=await links.doc(identityId(openid)).get().catch(function(){return null;});
 if(existingLink&&existingLink.data){
  const target=await db.collection('members').doc(existingLink.data.memberId).get().catch(function(){return null;});
  if(!target||!target.data)throw Error('IDENTITY_MEMBER_MISSING');
  if(existingLink.data.status!=='active')throw Error('IDENTITY_NOT_ACTIVE');
  return {registered:true,linked:true,memberId:target.data._id,existing:true};
 }
 const rows=await db.collection('members').where({_openid:openid}).limit(1).get();
 const member=rows.data[0];
 if(!member)return {registered:false,linked:false};
 const id=identityId(openid);
 const prior=await links.doc(id).get().catch(function(){return null;});
 if(prior&&prior.data){
  // Never reassign a previously registered identity to a different member.
  if(prior.data.memberId!==member._id)throw Error('IDENTITY_CONFLICT');
  return {registered:true,linked:true,memberId:member._id,existing:true};
 }
 try{
  await links.add({data:{
   _id:id,memberId:member._id,provider:'wechat_miniprogram',appId:APP_ID,
   openidHash:crypto.createHash('sha256').update(openid).digest('hex'),
   verification:'same_app_authenticated_openid',
   status:'active',linkedAt:db.serverDate()
  }});
 }catch(error){
  const again=await links.doc(id).get().catch(function(){return null;});
  if(!again||!again.data||again.data.memberId!==member._id)throw error;
 }
 // member._id remains the permanent internal member ID, even when originally
 // derived from OpenID. Historical memberNo and all foreign keys stay intact.
 return {registered:true,linked:true,memberId:member._id,existing:false};
};
