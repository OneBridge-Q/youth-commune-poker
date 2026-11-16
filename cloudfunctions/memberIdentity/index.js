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
