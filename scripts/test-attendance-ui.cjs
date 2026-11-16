'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(name,respond){
 let page,calls=[],modals=[];
 const wx={cloud:{callFunction:r=>{calls.push(r);return respond(r);},getTempFileURL:()=>Promise.resolve({fileList:[]})},showToast(){},showModal:o=>{modals.push(o);},navigateTo(){},switchTab(){}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/pages',name,'index.js'),'utf8'),{Page:p=>page=p,wx,console,Date,Math,Object,Array,String,Number,Error,Promise});
 page.data=JSON.parse(JSON.stringify(page.data));page.setData=function(p){Object.assign(this.data,p);};
 return {page,calls,modals};
}
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const event={currentTarget:{dataset:{id:'s1'}}};
let passed=0;async function test(n,f){await f();passed++;console.log('PASS '+n);}
(async()=>{
 await test('roster response populates separate counts',async()=>{const x=load('admin-attendance',()=>Promise.resolve({result:{activity:{id:'e',title:'活动'},stats:{registered:2,checkedIn:1,notCheckedIn:1},rows:[{id:'s1',nickname:'会员',attendanceVersion:1}],canCheckIn:true,nextOffset:null}}));x.page.onLoad({id:'e'});x.page.onShow();await tick();assert.equal(x.page.data.stats.checkedIn,1);assert.equal(x.page.data.rows.length,1);});
 await test('stale roster response after tab leave ignored',async()=>{let resolve;const x=load('admin-attendance',()=>new Promise(r=>{resolve=r;}));x.page.onLoad({id:'e'});x.page.onShow();x.page.onHide();resolve({result:{activity:{id:'e'},rows:[{id:'stale'}]}});await tick();assert.equal(x.page.data.rows.length,0);});
 await test('short revoke reason never calls backend',async()=>{const x=load('admin-attendance',()=>Promise.resolve({result:{}}));x.page.data.revokeTarget={id:'s1'};x.page.data.reason='';x.page.revoke();assert.equal(x.calls.length,0);assert(x.page.data.error.includes('原因'));});
 await test('busy state prevents duplicate operation',async()=>{let resolve;const x=load('admin-attendance',()=>new Promise(r=>{resolve=r;}));const row={id:'s1',attendanceVersion:0};x.page.data.id='e';x.page.operate('checkIn',row,'');x.page.operate('checkIn',row,'');assert.equal(x.calls.length,1);assert.equal(x.page.data.busy,true);});
 await test('retry reuses same idempotency key after ambiguous failure',async()=>{const x=load('admin-attendance',()=>Promise.reject(Error('network lost'))),row={id:'s1',attendanceVersion:0};x.page.data.id='e';x.page.operate('checkIn',row,'');await tick();x.page.operate('checkIn',row,'');await tick();assert.equal(x.calls[0].data.requestId,x.calls[1].data.requestId);});
 await test('check-in asks admin to confirm arrival',async()=>{const x=load('admin-attendance',()=>Promise.resolve({result:{}}));x.page.data.rows=[{id:'s1',nickname:'会员甲'}];x.page.checkIn(event);assert.equal(x.modals.length,1);assert(x.modals[0].content.includes('已经到场'));assert.equal(x.calls.length,0);});
 await test('participation page rejects old backend instead of empty history',async()=>{const x=load('participation',()=>Promise.resolve({result:{applications:[]}}));x.page.onShow();await tick();assert(x.page.data.error.includes('重新部署'));});
 await test('participation tab starts with attended not registrations',async()=>{const x=load('participation',()=>Promise.resolve({result:{applications:[{activityId:'a'}],participated:[{activityId:'b',isTest:true}]}}));x.page.onShow();await tick();assert.equal(x.page.data.visible[0].activityId,'b');assert.equal(x.page.data.visible[0].isTest,true);x.page.choose({currentTarget:{dataset:{tab:'applied'}}});assert.equal(x.page.data.visible[0].activityId,'a');});
 await test('growth refresh clears stale participation before loading',async()=>{const x=load('growth',()=>Promise.reject(Error('offline')));x.page.data.summary={checkedInActivities:99};x.page.onShow();assert.equal(x.page.data.summary,null);await tick();assert(x.page.data.error);assert.equal(x.page.data.summary,null);});
 await test('detail explains refusal to cancel a checked-in signup',async()=>{const x=load('activity-detail',r=>r.data.action==='cancel'?Promise.reject(Error('CHECKED_IN_CONTACT_ADMIN')):Promise.resolve({result:{activity:{id:'e'},myStatus:'checked_in'}}));x.page.data.id='e';x.page.cancel();x.modals[0].success({confirm:true});await tick();assert(x.modals[1].content.includes('已签到'));assert.equal(x.page.data.myStatus,'checked_in');});
 await test('WXML tap/submit handlers exist in new pages',async()=>{for(const name of ['admin-attendance','participation','activity-detail','growth','admin-activities']){const x=load(name,()=>Promise.resolve({result:{}}));const markup=fs.readFileSync(path.join(root,'miniprogram/pages',name,'index.wxml'),'utf8');const names=[...markup.matchAll(/bind(?:tap|input|change)="([a-zA-Z0-9_]+)"/g)].map(m=>m[1]);names.forEach(n=>assert.equal(typeof x.page[n],'function',name+':'+n));}});
 await test('page routes include both new pages',async()=>{const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json'),'utf8'));assert(app.pages.includes('pages/admin-attendance/index'));assert(app.pages.includes('pages/participation/index'));});
 console.log('TOTAL '+passed+' UI tests passed (simulated Page, not WeChat compiler).');
})().catch(e=>{console.error(e);process.exitCode=1;});
