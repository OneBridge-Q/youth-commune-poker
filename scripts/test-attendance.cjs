'use strict';
// In-memory simulation. No network, no live cloud credentials, no real member writes.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {createService}=require('../cloudfunctions/activityAttendance/service');
const {createRegistration,signupId}=require('../cloudfunctions/activityMember/registration');
const {readParticipation}=require('../cloudfunctions/memberGrowth/participation');
const clone=x=>structuredClone(x),TIME=Date.parse('2026-11-16T12:00:00+08:00');
let tables,ctx,clock,failAudit,chain,db,cloud,run,register;
function op(k,v){return {op:k,value:v};}
function get(o,k){return k.split('.').reduce((v,p)=>v==null?undefined:v[p],o);}
function matches(row,q){return Object.keys(q).every(k=>{const r=q[k],v=get(row,k);if(!r||!r.op)return v===r;switch(r.op){case'gt':return v>r.value;case'in':return r.value.includes(v);case'neq':return v!==r.value;case'exists':return (v!==undefined)===r.value;default:throw Error(r.op);}});}
function database(source){
 function collection(name){
  function items(){if(!source()[name])throw Error('database collection not exists: '+name);return source()[name];}
  function updateRow(row,data){Object.keys(data).forEach(k=>{row[k]=data[k]&&data[k].op==='inc'?(row[k]||0)+data[k].value:clone(data[k]);});}
  return {
   doc(id){return {
    async get(){return {data:clone(items().find(x=>x._id===id)||null)};},
    async update({data}){const row=items().find(x=>x._id===id);if(!row)throw Error('NOT_FOUND');updateRow(row,data);return {stats:{updated:1}};},
    async set({data}){if(name==='attendance_audit'&&failAudit)throw Error('AUDIT_WRITE_FAILED');const a=items(),i=a.findIndex(x=>x._id===id),row=Object.assign({},clone(data),{_id:id});if(i<0)a.push(row);else a[i]=row;return {stats:{updated:1}};}
   };},
   where(query){let n=100,order=[];return {
    orderBy(k,d){order=[k,d];return this;},limit(v){n=v;return this;},
    async count(){return {total:items().filter(x=>matches(x,query)).length};},
    async get(){let a=items().filter(x=>matches(x,query));if(order.length)a=a.slice().sort((a,b)=>String(a[order[0]]).localeCompare(String(b[order[0]]))*(order[1]==='desc'?-1:1));return{data:clone(a.slice(0,n))};},
    async update({data}){const a=items().filter(x=>matches(x,query));a.forEach(x=>updateRow(x,data));return {stats:{updated:a.length}};}
   };},
   async add({data}){const a=items(),id=data._id||'id'+a.length;if(a.some(x=>x._id===id))throw Error('DUPLICATE');a.push(Object.assign({},clone(data),{_id:id}));return {_id:id};}
  };
 }
 return {collection,command:{gt:v=>op('gt',v),in:v=>op('in',v),neq:v=>op('neq',v),exists:v=>op('exists',v),inc:v=>op('inc',v)},serverDate:()=>new Date(clock)};
}
function reset(){
 clock=TIME;ctx={OPENID:'admin-wx',APPID:'wxf108b994bb81e185'};failAudit=false;chain=Promise.resolve();
 tables={members:[{_id:'admin',_openid:'admin-wx',nickname:'管理员',role:'admin',storeId:'store-001',status:'active',skillPoints:5,rewardPoints:9},{_id:'a',_openid:'a-wx',nickname:'会员甲',storeId:'store-001',status:'active',skillPoints:8,rewardPoints:30},{_id:'b',_openid:'b-wx',nickname:'会员乙',storeId:'store-002',status:'active',skillPoints:3,rewardPoints:6}],member_identities:[],store_checkins:[],activities:[{_id:'event',title:'分享会',category:'知识分享',storeId:'store-001',status:'published',isTest:false,startDate:'2026-11-16',startTime:'13:00',startsAt:new Date('2026-11-16T13:00:00+08:00'),location:'店内'}],activity_signups:[],attendance_audit:[],hand_records:[],champion_awards:[]};
 for(const m of ['a','b'])tables.activity_signups.push({_id:signupId('event',m),activityId:'event',memberId:m,nickname:m==='a'?'会员甲':'会员乙',status:'applied',createdAt:new Date(clock-86400000)});
 db=database(()=>tables);
 db.runTransaction=function(fn){const job=chain.then(async()=>{const snapshot=clone(tables);const result=await fn(database(()=>snapshot));tables=snapshot;return result;});chain=job.catch(()=>{});return job;};
 cloud={init(){},DYNAMIC_CURRENT_ENV:'test',database:()=>db,getWXContext:()=>ctx,
  openapi:{wxacode:{getUnlimited:async options=>({buffer:Buffer.from(options.scene)})}}};

 run=createService(cloud,()=>clock);register=createRegistration(db,()=>clock);
}
const row=()=>tables.activity_signups.find(x=>x.memberId==='a');
function command(extra={}){return Object.assign({action:'checkIn',activityId:'event',signupId:signupId('event','a'),expectedVersion:0,requestId:'request_0000000001'},extra);}
async function growth(){
 const mod={exports:{}};const source=fs.readFileSync(__dirname+'/../cloudfunctions/memberGrowth/index.js','utf8');
 vm.runInNewContext(source,{exports:mod.exports,module:mod,require:n=>n==='wx-server-sdk'?cloud:n==='./memberLookup'?require('../cloudfunctions/activityAttendance/memberLookup'):n==='./participation'?require('../cloudfunctions/memberGrowth/participation'):require(n),console,Date,Array,Object,Number,Error});
 return mod.exports.main();
}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await test('store visits are independent of event registration and deduplicated across concurrent scans',async()=>{
  tables.activities=[];tables.activity_signups=[];
  const qr={action:'storeCheckInCode',envVersion:'trial'};
  const code=await run(qr);
  const token=Buffer.from(code.image,'base64').toString();
  assert.match(token,/^[a-f0-9]{32}$/);
  assert.equal((await run(qr)).image,code.image);
  const check={action:'storeCheckIn',token};
  ctx.OPENID='new-member';
  assert.equal((await run({action:'storeCheckInStatus'})).registered,false);
  await assert.rejects(run(check),/REGISTER_REQUIRED/);
  ctx.OPENID='a-wx';
  await assert.rejects(run(qr),/FORBIDDEN/);
  assert.equal((await run({action:'storeCheckInStatus'})).count,0);
  const results=await Promise.all([run(check),run(check)]);
  assert.deepEqual(results.map(result=>result.status).sort(),['already_checked_in','checked_in']);
  assert.equal((await run({action:'storeCheckInStatus'})).count,1);
  assert.equal(tables.activity_signups.length,0);

  clock=Date.parse('2026-11-17T00:00:00+08:00');
  await assert.rejects(run(check),/STORE_CODE_EXPIRED/);
  ctx.OPENID='admin-wx';
  const next=await run(qr);
  assert.notEqual(next.image,code.image);
  ctx.OPENID='a-wx';
  assert.equal((await run({...check,token:Buffer.from(next.image,'base64').toString()})).status,'checked_in');
  assert.equal((await run({action:'storeCheckInStatus'})).count,2);
 });
 await test('missing login rejected',async()=>{ctx.OPENID='';await assert.rejects(run({action:'list',activityId:'event'}),/UNAUTHENTICATED/);});
 await test('wrong app rejected',async()=>{ctx.APPID='wrong';await assert.rejects(run(command()),/APP_ID_MISMATCH/);});
 await test('ordinary members cannot view or sign',async()=>{ctx.OPENID='a-wx';await assert.rejects(run(command()),/FORBIDDEN/);await assert.rejects(run({action:'list',activityId:'event'}),/FORBIDDEN/);});
 await test('disabled operator rejected',async()=>{tables.members[0].status='blocked';await assert.rejects(run(command()),/FORBIDDEN/);});
 await test('other store denied',async()=>{tables.members[0].storeId='store-002';await assert.rejects(run(command()),/WRONG_STORE/);});
 await test('superadmin can manage a different store',async()=>{tables.members[0].role='superadmin';tables.members[0].storeId='store-002';assert.equal((await run(command())).status,'checked_in');});
 await test('missing store never broadens access',async()=>{delete tables.members[0].storeId;await assert.rejects(run(command()),/FORBIDDEN/);});
 await test('old signup rows remain valid and counts are separate',async()=>{const r=await run({action:'list',activityId:'event'});assert.deepEqual(r.stats,{registered:2,checkedIn:0,notCheckedIn:2});assert.equal(r.rows[0].attendanceVersion,0);});
 await test('signup and audit update together',async()=>{const r=await run(command());assert.equal(r.version,1);assert.equal(row().status,'applied');assert.equal(row().attendance.status,'checked_in');assert.equal(tables.attendance_audit.length,1);assert.equal(tables.attendance_audit[0].operatorId,'admin');});
 await test('same request is idempotent',async()=>{await run(command());assert.equal((await run(command())).idempotent,true);assert.equal(tables.attendance_audit.length,1);});
 await test('different concurrent request with stale version rejected',async()=>{await run(command());await assert.rejects(run(command({requestId:'request_0000000002'})),/ATTENDANCE_CHANGED/);assert.equal(tables.attendance_audit.length,1);});
 await test('reuse request with different payload rejected',async()=>{await run(command());await assert.rejects(run(command({reason:'different'})),/IDEMPOTENCY_CONFLICT/);});
 await test('already arrived no-op cannot add participation',async()=>{await run(command());assert.equal((await run(command({expectedVersion:1,requestId:'request_0000000002'}))).unchanged,true);assert.equal(tables.attendance_audit.length,1);});
 await test('revocation needs a reason',async()=>{await run(command());await assert.rejects(run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002'})),/REVOKE_REASON_REQUIRED/);});
 await test('revoke preserves signup and audit',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'误点会员'}));assert.equal(row().attendance.status,'revoked');assert.equal(row().status,'applied');assert.equal(tables.attendance_audit.length,2);assert.equal(tables.attendance_audit[1].reason,'误点会员');});
 await test('replaying an earlier check-in cannot undo later revoke',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'误点会员'}));await assert.rejects(run(command()),/ATTENDANCE_CHANGED/);});
 await test('re-check after revoked counts once',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'误点会员'}));await run(command({expectedVersion:2,requestId:'request_0000000003'}));assert.equal((await readParticipation(db,'a')).formalParticipated.length,1);assert.equal(tables.attendance_audit.length,3);});
 await test('future event check-in not open',async()=>{tables.activities[0].startsAt=new Date(clock+3*3600000);await assert.rejects(run(command()),/CHECKIN_NOT_OPEN/);});
 await test('cancelled event rejects new check-in',async()=>{tables.activities[0].status='cancelled';await assert.rejects(run(command()),/ACTIVITY_NOT_AVAILABLE/);});
 await test('cancelled signup rejects check-in',async()=>{row().status='cancelled';await assert.rejects(run(command()),/SIGNUP_CANCELLED/);});
 await test('signups cannot be moved across events',async()=>{tables.activities.push(Object.assign({},tables.activities[0],{_id:'other'}));await assert.rejects(run(command({activityId:'other'})),/SIGNUP_NOT_FOUND/);});
 await test('disabled participant rejected',async()=>{tables.members[1].status='blocked';await assert.rejects(run(command()),/MEMBER_NOT_ACTIVE/);});
 await test('audit failure rolls back state and activity guard',async()=>{const before=clone(tables);failAudit=true;await assert.rejects(run(command()),/AUDIT_WRITE_FAILED/);assert.deepEqual(tables,before);});
 await test('missing audit collection never silently succeeds',async()=>{delete tables.attendance_audit;await assert.rejects(run(command()),/collection not exists/);assert.equal(row().attendance,undefined);});
 await test('safe retry after rollback',async()=>{failAudit=true;await assert.rejects(run(command()));failAudit=false;await run(command());assert.equal(tables.attendance_audit.length,1);});
 await test('two simultaneous checks create one transition',async()=>{const results=await Promise.allSettled([run(command()),run(command({requestId:'request_0000000002'}))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(tables.attendance_audit.length,1);});
 await test('checked-in member cannot self-cancel',async()=>{await run(command());await assert.rejects(register('cancel','event',tables.members[1]),/CHECKED_IN_CONTACT_ADMIN/);assert.equal(row().status,'applied');});
 await test('concurrent cancel and check cannot both succeed',async()=>{await Promise.allSettled([run(command()),register('cancel','event',tables.members[1])]);assert(!(row().status==='cancelled'&&row().attendance&&row().attendance.status==='checked_in'));});
 await test('cancel after revocation permitted',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'本人未到'}));await register('cancel','event',tables.members[1]);assert.equal(row().status,'cancelled');});
 await test('repeated apply does not erase attendance',async()=>{await run(command());await register('apply','event',tables.members[1]);assert.equal(row().attendance.version,1);assert.equal(row().attendance.status,'checked_in');});
 await test('cancel then reapply preserves attendance version',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'本人未到'}));await register('cancel','event',tables.members[1]);await register('apply','event',tables.members[1]);assert.equal(row().attendance.version,2);});
 await test('new test signup inherits test source',async()=>{tables.activities[0].isTest=true;tables.activity_signups=[];await register('apply','event',tables.members[1]);assert.equal(row().isTest,true);});
 await test('test attendance stays visible operationally but not formal',async()=>{tables.activities[0].isTest=true;await run(command());const r=await readParticipation(db,'a');assert.equal(r.participated.length,1);assert.equal(r.formalParticipated.length,0);});
 await test('later test classification immediately removes formal growth',async()=>{await run(command());assert.equal((await readParticipation(db,'a')).formalParticipated.length,1);tables.activities[0].isTest=true;assert.equal((await readParticipation(db,'a')).formalParticipated.length,0);});
 await test('revocation immediately repairs participated list',async()=>{await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'误签撤销'}));const r=await readParticipation(db,'a');assert.equal(r.participated.length,0);assert.equal(r.applications.length,1);});
 await test('cancelled activity not counted as real participation',async()=>{await run(command());tables.activities[0].status='cancelled';assert.equal((await readParticipation(db,'a')).formalParticipated.length,0);});
 await test('growth has one attendance event not duplicate signup event',async()=>{await run(command());ctx.OPENID='a-wx';const r=await growth();assert.equal(r.summary.checkedInActivities,1);assert.equal(r.summary.registeredActivities,0);assert.equal(r.timeline.filter(x=>x.kind==='attendance').length,1);assert.equal(r.timeline.filter(x=>x.kind==='registration').length,0);});
 await test('growth excludes tests and revoked attendance',async()=>{tables.activities[0].isTest=true;await run(command());ctx.OPENID='a-wx';const r=await growth();assert.equal(r.summary.checkedInActivities,0);assert.equal(r.timeline.length,0);});
 await test('no scores or balances changed',async()=>{const before=clone(tables.members);await run(command());await run(command({action:'revoke',expectedVersion:1,requestId:'request_0000000002',reason:'误签撤销'}));assert.deepEqual(tables.members,before);});
 await test('keyword and status filters preserve global summary',async()=>{await run(command());const r=await run({action:'list',activityId:'event',keyword:'甲',filter:'checked_in'});assert.equal(r.rows.length,1);assert.equal(r.stats.registered,2);assert.equal(r.stats.checkedIn,1);});
 await test('server timestamps use UTC+8, not client supplied dates',async()=>{await run(command({checkedInAt:'2099-01-01'}));const r=await run({action:'list',activityId:'event',filter:'checked_in'});assert.equal(r.rows[0].checkedInAt,'2026-11-16 12:00');});
 await test('scan beyond first page and never silently truncate',async()=>{for(let i=0;i<150;i++)tables.activity_signups.push({_id:'more-'+i,activityId:'event',memberId:'extra-'+i,nickname:'搜索末尾'+i,status:'applied'});const r=await run({action:'list',activityId:'event',keyword:'搜索末尾149'});assert.equal(r.rows.length,1);assert.equal(r.stats.registered,152);});
 await test('roster cap is an explicit error',async()=>{for(let i=0;i<1001;i++)tables.activity_signups.push({_id:'more-'+i,activityId:'event',status:'applied'});await assert.rejects(run({action:'list',activityId:'event'}),/ROSTER_LIMIT_REACHED/);});
 await test('history only visible to authorized store admin',async()=>{await run(command());assert.equal((await run({action:'history',activityId:'event',signupId:row()._id})).records.length,1);tables.members[0].storeId='store-002';await assert.rejects(run({action:'history',activityId:'event',signupId:row()._id}),/WRONG_STORE/);});
 await test('unknown action and malformed operation rejected',async()=>{await assert.rejects(run({action:'setPoints',activityId:'event'}),/UNSUPPORTED_ACTION/);await assert.rejects(run(command({expectedVersion:'0'})),/INVALID_OPERATION/);await assert.rejects(run(command({requestId:'short'})),/INVALID_OPERATION/);});
 console.log('TOTAL '+passed+' attendance tests passed. In-memory mock only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
