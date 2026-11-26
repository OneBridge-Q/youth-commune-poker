// Run: node scripts/test-redcircle-recaps.cjs
// In-memory cloud simulation; this is not a live WeChat deployment test.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const source=fs.readFileSync(__dirname+'/../cloudfunctions/activityRecaps/index.js','utf8');
let actor={_id:'admin-one',role:'admin',storeId:'store-001',status:'active'};
let ctx={OPENID:'test-only',APPID:'wxf108b994bb81e185',ENV:'cloud1-test'};
const docs=[];let signed=[];
function get(obj,path){return path.split('.').reduce((o,k)=>o&&o[k],obj);}
function matches(x,q){return Object.keys(q).every(k=>q[k]&&q[k].op==='exists'?(get(x,k)!==undefined)===q[k].value:get(x,k)===q[k]);}
class Query{
 constructor(q){this.q=q;this.n=999;this.order=null;}
 orderBy(k,d){this.order=[k,d];return this;}limit(n){this.n=n;return this;}
 async get(){let a=docs.filter(x=>matches(x,this.q));if(this.order){const[k,d]=this.order;a=a.slice().sort((x,y)=>String(get(x,k)).localeCompare(String(get(y,k)))*(d==='desc'?-1:1));}return{data:a.slice(0,this.n)};}
 async update({data}){let n=0;docs.forEach(x=>{if(matches(x,this.q)){Object.assign(x,data);n++;}});return {stats:{updated:n}};}
}
const db={collection(name){assert.equal(name,'activities');return {where:q=>new Query(q)};},command:{exists:v=>({op:'exists',value:v})},serverDate:()=>new Date('2026-11-16T06:00:00Z')};
const cloud={DYNAMIC_CURRENT_ENV:'test',init(){},database:()=>db,getWXContext:()=>ctx,async getTempFileURL({fileList}){signed=fileList;return{fileList:fileList.map(f=>({fileID:f.fileID,status:0,tempFileURL:'https://example.test/'+encodeURIComponent(f.fileID)}))};}};
const moduleStub={exports:{}};const sandbox={exports:moduleStub.exports,module:moduleStub,require(name){if(name==='wx-server-sdk')return cloud;if(name==='crypto')return crypto;if(name==='./memberLookup')return{APP_ID:'wxf108b994bb81e185',findMember:async()=>actor};throw Error(name);},process:{env:{}},console,Date,Set,Array,Object,Number,String,Error};
vm.runInNewContext(source,sandbox);const run=moduleStub.exports.main;
function base(id,overrides={}){return Object.assign({_id:id,title:'真实活动',category:'知识分享',status:'published',storeId:'store-001',startDate:'2025-11-15',startTime:'19:30'},overrides);}
const owner=crypto.createHash('sha256').update('admin-one').digest('hex').slice(0,24);
const file='cloud://cloud1-test.bucket/activity-recaps/'+owner+'/photo.png';
function input(id,other={}){return Object.assign({action:'save',id,expectedRevision:0,title:'一次真实分享',body:'交流产品设计与使用体验。',photoFileIDs:[file],completedConfirmed:true,consentConfirmed:true,isTest:false},other);}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
 docs.push(base('real'),base('other',{storeId:'store-002'}),base('future',{startDate:'2099-01-01'}),base('cancelled',{status:'cancelled'}),base('test-record'));
 await test('ordinary members cannot edit',async()=>{actor.role='member';await assert.rejects(run(input('real')),/FORBIDDEN/);actor.role='admin';});
 await test('cross-store edit blocked',async()=>assert.rejects(run(input('other')),/WRONG_STORE/));
 await test('future event cannot become a recap',async()=>assert.rejects(run(input('future')),/ACTIVITY_NOT_COMPLETED/));
 await test('cancelled event cannot become a recap',async()=>assert.rejects(run(input('cancelled')),/ACTIVITY_NOT_COMPLETED/));
 await test('required consent not bypassable',async()=>assert.rejects(run(input('real',{consentConfirmed:false})),/CONFIRMATIONS_REQUIRED/));
 await test('completion confirmation required',async()=>assert.rejects(run(input('real',{completedConfirmed:false})),/CONFIRMATIONS_REQUIRED/));
 await test('different environment file refused',async()=>assert.rejects(run(input('real',{photoFileIDs:[file.replace('cloud1-test','other-env')]})),/INVALID_PHOTO_OWNER/));
 await test('private avatar file refused',async()=>assert.rejects(run(input('real',{photoFileIDs:['cloud://cloud1-test.bucket/member-avatars/photo.png']})),/INVALID_PHOTO_OWNER/));
 await test('other uploader file refused',async()=>assert.rejects(run(input('real',{photoFileIDs:[file.replace(owner,'a'.repeat(24))]})),/INVALID_PHOTO_OWNER/));
 await test('save a real recap',async()=>{const r=await run(input('real'));assert.equal(r.revision,1);assert.equal(r.status,'published');});
 await test('stale writes blocked',async()=>assert.rejects(run(input('real')),/RECAP_CHANGED_REFRESH/));
 await test('test content retained without public display',async()=>{await run(input('test-record',{isTest:true}));const r=await run({action:'list'});assert.equal(r.recaps.length,1);assert.equal(r.recaps[0].id,'real');assert.equal(r.recaps[0].photos.length,1);assert.equal(signed[0].maxAge,600);assert.equal(r.recaps[0].updatedBy,undefined);});
 await test('unpublish leaves activities intact',async()=>{const r=await run({action:'hide',id:'real',expectedRevision:1});assert.equal(r.status,'hidden');assert.equal(docs.find(x=>x._id==='real').status,'published');assert.equal((await run({action:'list'})).recaps.length,0);});
 await test('wrong AppID cannot edit',async()=>{ctx.APPID='other-app';await assert.rejects(run({action:'manage'}),/APP_ID_MISMATCH/);ctx.APPID='wxf108b994bb81e185';});
 await test('admin listing scoped to store',async()=>{const r=await run({action:'manage'});assert(!r.activities.some(x=>x.id==='other'));assert(r.uploadDir.startsWith('activity-recaps/'));});
 console.log('TOTAL '+count+' passed (mock cloud; not a live WeChat test)');
})().catch(e=>{console.error(e);process.exit(1);});
