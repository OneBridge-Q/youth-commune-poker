const cloud=require('wx-server-sdk');
const crypto=require('crypto');
const APP_ID='wx38e120d7481c3436';
function identityId(openid){
 return 'wx_'+crypto.createHash('sha256').update(APP_ID+':'+openid).digest('hex');
}
async function findMember(db,openid){
 if(!openid)throw Error('UNAUTHENTICATED');
 const link=await db.collection('member_identities').doc(identityId(openid)).get().catch(function(e){
  if(e&&String(e.message||e).includes('collection not exists'))throw e;
  return null;
 });
 if(link&&link.data){
  if(!['active','provisioning'].includes(link.data.status))throw Error('IDENTITY_BLOCKED');
  const target=await db.collection('members').doc(link.data.memberId).get().catch(function(){return null});
  if(target&&target.data){
   if(link.data.status==='provisioning')throw Error('REGISTRATION_INCOMPLETE');
   return target.data;
  }
  if(link.data.status==='active')throw Error('IDENTITY_MEMBER_MISSING');
  return null;
 }
 const legacy=await db.collection('members').where({_openid:openid}).limit(2).get();
 if(legacy.data.length>1)throw Error('DUPLICATE_LEGACY_IDENTITY');
 return legacy.data[0]||null;
}
module.exports={findMember,identityId,APP_ID};
