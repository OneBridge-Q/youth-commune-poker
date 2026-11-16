'use strict';
// Local cloud simulation. No network calls or real database writes.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {quarterAt}=require('../cloudfunctions/memberRankings/policy');
const {createService}=require('../cloudfunctions/memberRankings/service');
const {APP_ID}=require('../cloudfunctions/memberRankings/memberLookup');
function op(type,value){return {type,value,and(other){return op('and',[this,other]);}};}
const cmd={};['exists','neq','gt','gte','lt','in','and','or'].forEach(k=>cmd[k]=v=>op(k,v));
cmd.aggregate={sum:field=>({sum:field})};
const get=(x,k)=>k.split('.').reduce((o,key)=>o==null?undefined:o[key],x);
function comparison(value,rule){
 if(!rule||!rule.type)return value===rule;
 switch(rule.type){case'exists':return(value!==undefined)===rule.value;case'neq':return value!==rule.value;case'gt':return value>rule.value;case'gte':return value>=rule.value;case'lt':return value<rule.value;case'in':return rule.value.includes(value);case'and':return rule.value.every(r=>comparison(value,r));default:throw Error('OP '+rule.type);}
}
function matches(row,q){if(q.type==='and')return q.value.every(x=>matches(row,x));if(q.type==='or')return q.value.some(x=>matches(row,x));return Object.keys(q).every(k=>comparison(get(row,k),q[k]));}
let collections,context,clock,denied,reads;
const clone=value=>structuredClone(value);
function check(name){reads.push(name);if(denied===name)throw Error('permission denied');if(!collections[name])throw Error('database collection not exists');}
class Query{
 constructor(name,filter){this.name=name;this.filter=filter;this.size=100;}
 limit(n){this.size=n;return this;}
 async get(){check(this.name);return {data:clone(collections[this.name].filter(x=>matches(x,this.filter)).slice(0,this.size))};}
}
class Aggregate{
 constructor(name){this.name=name;this.steps=[];}
 match(x){this.steps.push(['match',x]);return this;}project(x){this.steps.push(['project',x]);return this;}group(x){this.steps.push(['group',x]);return this;}lookup(x){this.steps.push(['lookup',x]);return this;}unwind(x){this.steps.push(['unwind',x]);return this;}sort(x){this.steps.push(['sort',x]);return this;}limit(x){this.steps.push(['limit',x]);return this;}
 async end(){
  check(this.name);let rows=clone(collections[this.name]);
  for(const [stage,arg]of this.steps){
   if(stage==='match')rows=rows.filter(x=>matches(x,arg));
   else if(stage==='limit')rows=rows.slice(0,arg);
   else if(stage==='sort')rows.sort((a,b)=>{for(const k of Object.keys(arg)){if(a[k]!==b[k])return(a[k]>b[k]?1:-1)*arg[k];}return 0;});
   else if(stage==='project')rows=rows.map(x=>{const out={};for(const k in arg)out[k]=arg[k]===1?x[k]:get(x,arg[k].slice(1));return out;});
   else if(stage==='group'){const g=new Map();for(const x of rows){const id=get(x,arg._id.slice(1));if(!g.has(id))g.set(id,{_id:id,score:0});const n=get(x,arg.score.sum.slice(1));if(typeof n==='number')g.get(id).score+=n;}rows=Array.from(g.values());}
   else if(stage==='lookup'){check(arg.from);rows=rows.map(x=>Object.assign({},x,{[arg.as]:clone(collections[arg.from].filter(m=>get(m,arg.foreignField)===get(x,arg.localField)))}));}
   else if(stage==='unwind'){const k=arg.slice(1);rows=rows.flatMap(x=>(get(x,k)||[]).map(m=>Object.assign({},x,{[k]:m})));}
   else throw Error(stage);
  }
  return {list:rows};
 }
}
const db={command:cmd,collection(name){return {where:q=>new Query(name,q),aggregate:()=>new Aggregate(name)};}};
const run=createService({database:()=>db,getWXContext:()=>context},()=>clock);
function reset(){
 clock=Date.parse('2026-11-16T00:00:00Z');context={OPENID:'openid-a',APPID:APP_ID};denied='';reads=[];
 collections={members:[
  {_id:'a',_openid:'openid-a',nickname:'本人',status:'active',storeId:'store-001',brandId:'brand-one',skillPoints:120,rewardPoints:900},
  {_id:'b',_openid:'openid-b',nickname:'同店乙',storeId:'store-001',brandId:'brand-one',skillPoints:120},
  {_id:'c',nickname:'同店丙',status:'active',storeId:'store-001',skillPoints:60},
  {_id:'d',_openid:'openid-d',nickname:'分店用户',status:'active',storeId:'store-002',brandId:'brand-one',skillPoints:999},
  {_id:'n',nickname:'门店未设置',status:'active',skillPoints:500},
  {_id:'hidden',nickname:'隐藏',storeId:'store-001',skillPoints:900,rankVisible:false},
  {_id:'blocked',nickname:'停用',storeId:'store-001',skillPoints:800,status:'blocked'},
  {_id:'tester',nickname:'测试',storeId:'store-001',skillPoints:700,isTest:true},
  {_id:'zero',nickname:'零分',storeId:'store-001',skillPoints:0}
 ],member_identities:[],charisma_ledger:[]};
}
function entry(id,memberId,delta,extra={}){return Object.assign({_id:id,memberId,status:'posted',isTest:false,periodKey:'2026-Q4',effectiveAt:new Date('2026-11-15T12:00:00+08:00'),kind:'earn',source:'knowledge_sharing',rankingDelta:delta},extra);}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await test('default is own store, including caller; local ties 1/1/3',async()=>{const r=await run({board:'battle'});assert.equal(r.scope,'store');assert.equal(r.storeId,'store-001');assert.deepEqual(r.rows.map(x=>[x.nickname,x.rank,x.score]),[['本人',1,120],['同店乙',1,120],['同店丙',3,60]]);assert.equal(r.me,undefined);});
 await test('same-brand different-store is excluded',async()=>assert(!(await run({})).rows.some(x=>x.nickname==='分店用户')));
 await test('friends collection is not needed or read',async()=>{assert.equal(collections.member_friendships,undefined);await run({});assert(!reads.includes('member_friendships'));});
 await test('friend relation cannot add another-store member',async()=>{collections.member_friendships=[{memberA:'a',memberB:'d',status:'accepted',acceptedBy:['a','d']}];assert(!(await run({})).rows.some(x=>x.nickname==='分店用户'));});
 await test('forged client store/member/brand cannot select another store',async()=>{const r=await run({scope:'store',storeId:'store-002',memberId:'d',brandId:'brand-one',friendIds:['d']});assert.equal(r.storeId,'store-001');assert.equal(r.rows.length,3);});
 await test('other-store caller sees only that store',async()=>{context.OPENID='openid-d';const r=await run({});assert.equal(r.storeId,'store-002');assert.deepEqual(r.rows.map(x=>x.nickname),['分店用户']);});
 await test('system scope explicitly aggregates all eligible members',async()=>{const r=await run({scope:'system'});assert.equal(r.scope,'system');assert.equal(r.storeId,null);assert.deepEqual(r.rows.map(x=>[x.nickname,x.rank]),[['分店用户',1],['门店未设置',2],['本人',3],['同店乙',3],['同店丙',5]]);});
 await test('unknown/old scopes are rejected, never treated as global',async()=>{for(const scope of ['all','brand','confirmed_friends','',null,{},['system']])await assert.rejects(run({scope}),/INVALID_SCOPE/);});
 await test('missing/invalid store fails closed',async()=>{for(const storeId of [undefined,null,'','  ',17,{},'x'.repeat(129)]){collections.members[0].storeId=storeId;await assert.rejects(run({}),/MEMBER_STORE_REQUIRED/);}});
 await test('system read must be explicit even when store is missing',async()=>{delete collections.members[0].storeId;await assert.rejects(run({}),/MEMBER_STORE_REQUIRED/);assert.equal((await run({scope:'system'})).scope,'system');});
 await test('empty store returns empty, not global fallback',async()=>{collections.members[0].storeId='empty-store';collections.members[0].skillPoints=0;assert.equal((await run({})).rows.length,0);});
 await test('test/disabled/hidden profiles excluded',async()=>{for(const scope of ['store','system']){const r=await run({scope});assert(!r.rows.some(x=>['隐藏','停用','测试','零分'].includes(x.nickname)));}});
 await test('quarter earnings filtered by member store, not brand or ledger hint',async()=>{collections.charisma_ledger=[entry('1','a',100),entry('2','b',100),entry('3','c',20),entry('4','d',999,{storeId:'store-001'})];const r=await run({board:'charisma'});assert.deepEqual(r.rows.map(x=>[x.nickname,x.rank,x.score]),[['本人',1,100],['同店乙',1,100],['同店丙',3,20]]);});
 await test('quarter system scope works across stores',async()=>{collections.charisma_ledger=[entry('1','a',10),entry('2','d',99)];assert.deepEqual((await run({board:'charisma',scope:'system'})).rows.map(x=>x.score),[99,10]);});
 await test('balance is not a quarter score',async()=>{const r=await run({board:'charisma'});assert.equal(r.rows.length,0);assert.equal(collections.members[0].rewardPoints,900);});
 await test('contributions and corrections count; redemptions/refunds do not',async()=>{collections.charisma_ledger=[entry('1','a',100),entry('2','a',-10,{kind:'adjustment'}),entry('3','a',-60,{kind:'redeem'}),entry('4','a',60,{kind:'redemption_refund'})];assert.equal((await run({board:'charisma'})).rows[0].score,90);});
 await test('poker and chip conversions excluded',async()=>{collections.charisma_ledger=[entry('1','a',1000,{source:'poker_win'}),entry('2','a',500,{source:'chip_conversion'}),entry('3','a',5)];assert.equal((await run({board:'charisma'})).rows[0].score,5);});
 await test('test/voided/unlabelled ledger entries excluded',async()=>{collections.charisma_ledger=[entry('1','a',10,{isTest:true}),entry('2','a',20,{status:'voided'}),entry('3','a',30,{isTest:undefined})];assert.equal((await run({board:'charisma'})).rows.length,0);});
 await test('quarter lower bound inclusive upper bound exclusive',async()=>{collections.charisma_ledger=[entry('1','a',11,{effectiveAt:new Date('2026-10-01T00:00:00+08:00')}),entry('2','a',99,{effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];assert.equal((await run({board:'charisma'})).rows[0].score,11);});
 await test('quarter switch preserves balance and history',async()=>{collections.charisma_ledger=[entry('1','a',23),entry('2','a',7,{periodKey:'2027-Q1',effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];const before=clone(collections);clock=Date.parse('2027-01-01T00:00:00+08:00');const r=await run({board:'charisma'});assert.equal(r.period.key,'2027-Q1');assert.equal(r.rows[0].score,7);assert.deepEqual(collections,before);});
 await test('battle values survive quarterly reset',async()=>{clock=Date.parse('2027-01-01T00:01:00+08:00');assert.equal((await run({})).rows[0].score,120);});
 await test('client dates/scores cannot alter server quarter or stored values',async()=>{const before=clone(collections);const r=await run({board:'charisma',now:'2099-01-01',periodKey:'2099-Q1',score:999});assert.equal(r.period.key,'2026-Q4');assert.deepEqual(collections,before);});
 await test('linked identity uses member store rather than client values',async()=>{context.OPENID='new';collections.member_identities=[{_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':new').digest('hex'),memberId:'d',status:'active'}];assert.equal((await run({storeId:'store-001'})).storeId,'store-002');});
 await test('blocked identity denied',async()=>{collections.member_identities=[{_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':openid-a').digest('hex'),memberId:'a',status:'blocked'}];await assert.rejects(run({}),/IDENTITY_NOT_ACTIVE/);});
 await test('unregistered users denied for store and system',async()=>{context.OPENID='unknown';for(const scope of ['store','system'])await assert.rejects(run({scope}),/REGISTER_REQUIRED/);});
 await test('disabled caller denied also for system',async()=>{collections.members[0].status='blocked';await assert.rejects(run({scope:'system'}),/MEMBER_DISABLED/);});
 await test('wrong AppID denied',async()=>{context.APPID='wrong';await assert.rejects(run({scope:'system'}),/APP_ID_MISMATCH/);});
 await test('missing login denied',async()=>{context.OPENID='';await assert.rejects(run({scope:'system'}),/UNAUTHENTICATED/);});
 await test('unknown board denied',async()=>assert.rejects(run({board:'unknown'}),/INVALID_BOARD/));
 await test('private identifiers and balances excluded from ranking rows',async()=>{for(const scope of ['store','system']){const r=await run({scope});r.rows.forEach(x=>assert.deepEqual(Object.keys(x).sort(),['key','nickname','rank','score']));assert.equal(r.me,undefined);assert(!JSON.stringify(r).includes('openid'));assert(!JSON.stringify(r).includes('rewardPoints'));}});
 await test('missing ledger explicitly reported',async()=>{delete collections.charisma_ledger;await assert.rejects(run({board:'charisma'}),/CHARISMA_LEDGER_NOT_READY/);});
 await test('data read error does not produce a global fallback',async()=>{denied='members';await assert.rejects(run({}),/permission denied/);});
 await test('store filter occurs before top-100 limit',async()=>{for(let i=0;i<120;i++)collections.members.push({_id:'other-'+i,nickname:'其他店'+i,skillPoints:10000+i,storeId:'store-002'});assert.equal((await run({})).rows.length,3);assert.equal((await run({scope:'system'})).rows.length,100);});
 await test('quarter top-100 also applies after store selection',async()=>{for(let i=0;i<110;i++){const id='other-'+i;collections.members.push({_id:id,nickname:id,storeId:'store-002'});collections.charisma_ledger.push(entry('other-'+i,id,1000+i));}collections.charisma_ledger.push(entry('own','a',1));assert.deepEqual((await run({board:'charisma'})).rows.map(x=>x.score),[1]);});
 await test('global ties include all branches',async()=>{collections.members[3].skillPoints=120;collections.members[4].skillPoints=0;assert.deepEqual((await run({scope:'system'})).rows.map(x=>x.rank),[1,1,1,4]);});
 await test('natural-quarter and cross-year boundaries use UTC+8',async()=>{assert.equal(quarterAt('2026-12-31T15:59:59.999Z').key,'2026-Q4');assert.equal(quarterAt('2026-12-31T16:00:00Z').key,'2027-Q1');assert.equal(quarterAt('2026-03-31T16:00:00Z').key,'2026-Q2');assert.equal(quarterAt('2026-06-30T16:00:00Z').key,'2026-Q3');assert.equal(quarterAt('2026-09-30T16:00:00Z').key,'2026-Q4');});
 console.log('TOTAL '+passed+' passed. Mock data only; no live writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
