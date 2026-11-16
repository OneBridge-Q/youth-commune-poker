const cloud=require('wx-server-sdk');
const crypto=require('crypto');
const {findMember,APP_ID}=require('./memberLookup');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function fail(code){throw new Error(code);}
function token(id){return crypto.createHash('sha256').update(id).digest('hex').slice(0,24);}
function past(item){
 const date=item.startDate,time=item.startTime;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return false;
 const ms=Date.parse(date+'T'+time+':00+08:00');
 return Number.isFinite(ms)&&new Date(ms+28800000).toISOString().slice(0,10)===date&&ms<Date.now();
}
function fileInfo(id){
 if(typeof id!=='string'||id.length>500)return null;
 const match=id.match(/^cloud:\/\/([a-zA-Z0-9._-]+)\/activity-recaps\/([a-f0-9]{24})\/([a-zA-Z0-9_-]+)\.(jpg|jpeg|png|webp)$/i);
 const env=process.env.TCB_ENV||cloud.getWXContext().ENV;
 if(!match||!env||!(match[1]===env||match[1].indexOf(env+'.')===0))return null;
 return {owner:match[2]};
}
async function photoUrls(ids){
 const valid=Array.from(new Set(ids.filter(function(id){return !!fileInfo(id);}))),urls={};
 if(!valid.length)return urls;
 try{
  const res=await cloud.getTempFileURL({fileList:valid.map(function(id){return {fileID:id,maxAge:600};})});
  (res.fileList||[]).forEach(function(f){if(f.status===0&&/^https:\/\//.test(f.tempFileURL||''))urls[f.fileID]=f.tempFileURL;});
 }catch(error){console.warn('[recap:photo-links]',error.errCode||'UNAVAILABLE');}
 return urls;
}
async function itemById(id){
 if(typeof id!=='string'||!id||id.length>128)fail('INVALID_ID');
 const rows=await db.collection('activities').where({_id:id}).limit(1).get();
 if(!rows.data.length)fail('ACTIVITY_NOT_FOUND');return rows.data[0];
}
async function admin(){
 const ctx=cloud.getWXContext();
 if(!ctx.OPENID)fail('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)fail('APP_ID_MISMATCH');
 const m=await findMember(db,ctx.OPENID);
 if(!m||!['admin','superadmin'].includes(m.role)||(m.status&&m.status!=='active'))fail('FORBIDDEN');
 if(m.role!=='superadmin'&&!m.storeId)fail('FORBIDDEN');return m;
}
function scope(actor,item){if(actor.role!=='superadmin'&&actor.storeId!==item.storeId)fail('WRONG_STORE');}
exports.main=async function(event){
 event=event||{};
 if(event.action==='list'){
  const rows=await db.collection('activities').where({status:'published'}).limit(100).get();
  const list=rows.data.filter(function(x){return past(x)&&x.isTest!==true&&x.recap&&x.recap.status==='published'&&x.recap.isTest===false&&x.recap.completedConfirmed===true&&x.recap.consentConfirmed===true;}).sort(function(a,b){return String(b.startDate).localeCompare(String(a.startDate));}).slice(0,8);
  let ids=[];list.forEach(function(x){ids=ids.concat(Array.isArray(x.recap.photoFileIDs)?x.recap.photoFileIDs.slice(0,3):[]);});
  const urls=await photoUrls(ids);
  return {recaps:list.map(function(x){
   const r=x.recap,files=Array.isArray(r.photoFileIDs)?r.photoFileIDs.slice(0,3):[];
   const photos=files.map(function(id){return urls[id];}).filter(Boolean);
   return {id:x._id,title:r.title||x.title,body:r.body||'',date:x.startDate,category:x.category||'',photos:photos,photosUnavailable:photos.length<files.length};
  })};
 }
 const actor=await admin();
 if(event.action==='manage'){
  const rows=await db.collection('activities').where(actor.role==='superadmin'?{}:{storeId:actor.storeId}).limit(100).get();
  rows.data.sort(function(a,b){return String(b.startDate).localeCompare(String(a.startDate));});
  return {uploadDir:'activity-recaps/'+token(actor._id)+'/',activities:rows.data.map(function(x){
   const r=x.recap||{};
   return {id:x._id,title:x.title,startDate:x.startDate,status:x.status,canPublish:x.status==='published'&&past(x),revision:r.revision||0,recapStatus:r.status||'none',recapTitle:r.title||'',recapBody:r.body||'',isTest:r.isTest===true};
  }),partial:rows.data.length===100};
 }
 if(event.action!=='save'&&event.action!=='hide')fail('UNSUPPORTED_ACTION');
 const item=await itemById(event.id);scope(actor,item);
 const old=item.recap||{},revision=old.revision||0;
 if(!Number.isInteger(event.expectedRevision)||event.expectedRevision!==revision)fail('RECAP_CHANGED_REFRESH');
 let recap;
 if(event.action==='hide'){
  if(!old.status)fail('RECAP_NOT_FOUND');
  recap=Object.assign({},old,{status:'hidden',revision:revision+1,updatedBy:actor._id,updatedAt:db.serverDate()});
 }else{
  if(item.status!=='published'||!past(item))fail('ACTIVITY_NOT_COMPLETED');
  if(event.completedConfirmed!==true||event.consentConfirmed!==true)fail('CONFIRMATIONS_REQUIRED');
  if(typeof event.title!=='string'||!event.title.trim()||event.title.trim().length>60||typeof event.body!=='string'||!event.body.trim()||event.body.trim().length>800||typeof event.isTest!=='boolean')fail('INVALID_RECAP');
  const files=event.photoFileIDs;
  if(!Array.isArray(files)||files.length<1||files.length>3||new Set(files).size!==files.length)fail('INVALID_PHOTOS');
  files.forEach(function(id){const info=fileInfo(id);if(!info||info.owner!==token(actor._id))fail('INVALID_PHOTO_OWNER');});
  recap={title:event.title.trim(),body:event.body.trim(),photoFileIDs:files,status:'published',isTest:event.isTest,completedConfirmed:true,consentConfirmed:true,revision:revision+1,updatedBy:actor._id,updatedAt:db.serverDate()};
 }
 const condition={_id:item._id,status:item.status};
 condition['recap.revision']=old.revision===undefined?db.command.exists(false):old.revision;
 const result=await db.collection('activities').where(condition).update({data:{recap:recap,updatedAt:db.serverDate()}});
 if(!result.stats.updated)fail('RECAP_CHANGED_REFRESH');
 return {id:item._id,status:recap.status,isTest:recap.isTest,revision:recap.revision};
};
