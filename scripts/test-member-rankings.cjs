'use strict';
// Local cloud simulator. Run: node scripts/test-member-rankings.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { quarterAt } = require('../cloudfunctions/memberRankings/policy');
const { createService } = require('../cloudfunctions/memberRankings/service');
const { APP_ID } = require('../cloudfunctions/memberRankings/memberLookup');
function op(type,value){return {type,value,and(other){return op('and',[this,other]);}};}
const cmd={};['exists','neq','gt','gte','lt','in','and','or'].forEach(k=>cmd[k]=v=>op(k,v));
cmd.aggregate={sum:field=>({sum:field})};
const get=(x,k)=>k.split('.').reduce((o,key)=>o==null?undefined:o[key],x);
function comparison(value,rule){
 if(!rule||!rule.type)return value===rule;
 switch(rule.type){
 case 'exists':return (value!==undefined)===rule.value;
 case 'neq':return value!==rule.value;
 case 'gt':return value>rule.value;
 case 'gte':return value>=rule.value;
 case 'lt':return value<rule.value;
 case 'in':return rule.value.includes(value);
 case 'and':return rule.value.every(r=>comparison(value,r));
 default:throw Error('UNIMPLEMENTED_OP '+rule.type);
 }
}
function matches(row,q){
 if(q.type==='and')return q.value.every(x=>matches(row,x));
 if(q.type==='or')return q.value.some(x=>matches(row,x));
 return Object.keys(q).every(k=>comparison(get(row,k),q[k]));
}
let collections,context,clock;
const clone=value=>structuredClone(value);
class Query{
 constructor(name,filter){this.name=name;this.filter=filter;this.size=100;}
 limit(n){this.size=n;return this;}
 async get(){if(!collections[this.name])throw Error('database collection not exists');return {data:clone(collections[this.name].filter(x=>matches(x,this.filter)).slice(0,this.size))};}
}
class Aggregate{
 constructor(name){this.name=name;this.steps=[];}
 match(x){this.steps.push(['match',x]);return this;}project(x){this.steps.push(['project',x]);return this;}
 group(x){this.steps.push(['group',x]);return this;}lookup(x){this.steps.push(['lookup',x]);return this;}
 unwind(x){this.steps.push(['unwind',x]);return this;}sort(x){this.steps.push(['sort',x]);return this;}
 limit(x){this.steps.push(['limit',x]);return this;}count(x){this.steps.push(['count',x]);return this;}
 async end(){
  if(!collections[this.name])throw Error('database collection not exists');
  let rows=clone(collections[this.name]);
  for(const [stage,arg] of this.steps){
   if(stage==='match')rows=rows.filter(x=>matches(x,arg));
   else if(stage==='limit')rows=rows.slice(0,arg);
   else if(stage==='sort')rows.sort((a,b)=>{for(const key of Object.keys(arg)){if(a[key]!==b[key])return (a[key]>b[key]?1:-1)*arg[key];}return 0;});
   else if(stage==='project')rows=rows.map(x=>{const out={};for(const key in arg){if(arg[key]===1)out[key]=x[key];else if(typeof arg[key]==='string')out[key]=get(x,arg[key].slice(1));}return out;});
   else if(stage==='group'){
    const groups=new Map();for(const x of rows){const id=get(x,arg._id.slice(1));if(!groups.has(id))groups.set(id,{_id:id,score:0});const n=get(x,arg.score.sum.slice(1));if(typeof n==='number')groups.get(id).score+=n;}rows=Array.from(groups.values());
   }else if(stage==='lookup')rows=rows.map(x=>Object.assign({},x,{[arg.as]:clone(collections[arg.from].filter(m=>get(m,arg.foreignField)===get(x,arg.localField)))}));
   else if(stage==='unwind'){const key=arg.slice(1);rows=rows.flatMap(x=>(get(x,key)||[]).map(m=>Object.assign({},x,{[key]:m})));}
   else if(stage==='count')rows=rows.length?[{[arg]:rows.length}]:[];
   else throw Error('UNIMPLEMENTED_STAGE '+stage);
  }
  return {list:rows};
 }
}
const db={command:cmd,collection(name){return {where:q=>new Query(name,q),aggregate:()=>new Aggregate(name)};}};
const cloud={database:()=>db,getWXContext:()=>context};
const run=createService(cloud,()=>clock);
function reset(){
 clock=Date.parse('2026-11-16T00:00:00Z');context={OPENID:'openid-a',APPID:APP_ID};
 collections={members:[
  {_id:'a',_openid:'openid-a',nickname:'苏提',status:'active',skillPoints:120,rewardPoints:900},
  {_id:'b',_openid:'openid-b',nickname:'会员乙',skillPoints:120,rewardPoints:20},
  {_id:'c',_openid:'openid-c',nickname:'会员丙',status:'active',skillPoints:60,rewardPoints:40},
  {_id:'hidden',nickname:'不展示',skillPoints:999,rankVisible:false},
  {_id:'blocked',nickname:'已停用',skillPoints:888,status:'blocked'},
  {_id:'tester',nickname:'测试会员',skillPoints:777,isTest:true},
  {_id:'zero',nickname:'零分会员',skillPoints:0}
 ],member_identities:[],charisma_ledger:[]};
}
function entry(id,memberId,delta,extra={}){
 return Object.assign({_id:id,memberId,status:'posted',isTest:false,periodKey:'2026-Q4',effectiveAt:new Date('2026-11-15T12:00:00+08:00'),kind:'earn',source:'knowledge_sharing',rankingDelta:delta},extra);
}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await test('lifetime values and competition ties',async()=>{const r=await run({board:'battle'});assert.deepEqual(r.rows.map(x=>[x.rank,x.score]),[[1,120],[1,120],[3,60]]);assert.equal(r.me.rank,1);assert.equal(r.me.score,120);assert.equal(r.period,null);});
 await test('lifetime score survives next quarter',async()=>{clock=Date.parse('2027-01-01T00:01:00+08:00');assert.equal((await run({board:'battle'})).me.score,120);});
 await test('old redeemable balances are not quarterly scores',async()=>{const r=await run({board:'charisma'});assert.equal(r.me.score,0);assert.equal(r.rows.length,0);assert.equal(collections.members[0].rewardPoints,900);});
 await test('community earns and corrections counted; exchange and refunds ignored',async()=>{
  collections.charisma_ledger=[entry('1','a',100),entry('2','a',-10,{kind:'adjustment'}),entry('3','b',90),entry('4','c',20),entry('5','a',-60,{kind:'redeem'}),entry('6','a',60,{kind:'redemption_refund'})];
  const r=await run({board:'charisma'});assert.deepEqual(r.rows.map(x=>[x.rank,x.score]),[[1,90],[1,90],[3,20]]);assert.equal(r.me.score,90);
 });
 await test('same person different identity still linked',async()=>{
  context.OPENID='new-openid';collections.member_identities.push({_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':new-openid').digest('hex'),memberId:'a',status:'active'});assert.equal((await run({board:'battle'})).me.score,120);
 });
 await test('blocked identity cannot use rankings',async()=>{
  collections.member_identities.push({_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':openid-a').digest('hex'),memberId:'a',status:'blocked'});await assert.rejects(run({board:'battle'}),/IDENTITY_NOT_ACTIVE/);
 });
 await test('gambling-related sources do not earn charisma rankings',async()=>{collections.charisma_ledger=[entry('x','a',1000,{source:'poker_win'}),entry('y','a',500,{source:'chip_conversion'}),entry('z','a',10)];assert.equal((await run({board:'charisma'})).me.score,10);});
 await test('test, voided, and legacy unlabelled events excluded',async()=>{collections.charisma_ledger=[entry('x','a',100,{isTest:true}),entry('y','a',80,{status:'voided'}),entry('z','a',70,{isTest:undefined}),entry('v','a',5)];assert.equal((await run({board:'charisma'})).me.score,5);});
 await test('period bounds inclusive start and exclusive end',async()=>{collections.charisma_ledger=[entry('s','a',11,{effectiveAt:new Date('2026-10-01T00:00:00+08:00')}),entry('e','a',99,{effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];assert.equal((await run({board:'charisma'})).me.score,11);});
 await test('previous quarters not counted',async()=>{collections.charisma_ledger=[entry('p','a',90,{periodKey:'2026-Q3'}),entry('n','a',2)];assert.equal((await run({board:'charisma'})).me.score,2);});
 await test('quarter changes by server clock without deleting old rows',async()=>{collections.charisma_ledger=[entry('old','a',23),entry('new','a',7,{periodKey:'2027-Q1',effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];clock=Date.parse('2027-01-01T00:00:00+08:00');const r=await run({board:'charisma'});assert.equal(r.period.key,'2027-Q1');assert.equal(r.me.score,7);assert.equal(collections.charisma_ledger.length,2);assert.equal(collections.members[0].rewardPoints,900);});
 await test('client dates and score fields cannot change season or balances',async()=>{const before=clone(collections);const r=await run({board:'charisma',now:'2099-01-01',periodKey:'2099-Q1',memberId:'b',score:100000});assert.equal(r.period.key,'2026-Q4');assert.deepEqual(collections,before);});
 await test('disabled, invisible and test profiles excluded before ranking',async()=>{collections.charisma_ledger=[entry('1','a',10),entry('2','blocked',999),entry('3','hidden',888),entry('4','tester',777),entry('5','nonexistent',666)];assert.equal((await run({board:'charisma'})).rows.length,1);});
 await test('hidden self sees no public placement',async()=>{collections.members[0].rankVisible=false;const r=await run({board:'battle'});assert.equal(r.me.eligible,false);assert.equal(r.me.rank,null);assert(!r.rows.some(x=>x.isMe));});
 await test('no private identifiers or redemption balances exposed',async()=>{const r=await run({board:'battle'});r.rows.forEach(x=>assert.deepEqual(Object.keys(x).sort(),['isMe','key','nickname','rank','score']));const raw=JSON.stringify(r);assert(!raw.includes('openid-a'));assert(!raw.includes('rewardPoints'));});
 await test('no member access without registration',async()=>{context.OPENID='unknown';await assert.rejects(run({board:'battle'}),/REGISTER_REQUIRED/);});
 await test('wrong AppID blocked',async()=>{context.APPID='other';await assert.rejects(run({board:'battle'}),/APP_ID_MISMATCH/);});
 await test('unknown boards rejected',async()=>assert.rejects(run({board:'arbitrary'}),/INVALID_BOARD/));
 await test('missing ledger reports initialization problem, not zero scores',async()=>{delete collections.charisma_ledger;await assert.rejects(run({board:'charisma'}),/CHARISMA_LEDGER_NOT_READY/);});
 await test('top 100 does not corrupt own global rank',async()=>{for(let i=0;i<105;i++)collections.members.push({_id:'high-'+i,nickname:'高分'+i,skillPoints:1000+i,status:'active'});const r=await run({board:'battle'});assert.equal(r.rows.length,100);assert.equal(r.me.rank,106);});
 await test('natural quarter and year boundaries use UTC+8',async()=>{
  assert.equal(quarterAt('2026-12-31T15:59:59.999Z').key,'2026-Q4');assert.equal(quarterAt('2026-12-31T16:00:00.000Z').key,'2027-Q1');
  assert.equal(quarterAt('2026-03-31T15:59:59.999Z').key,'2026-Q1');assert.equal(quarterAt('2026-03-31T16:00:00.000Z').key,'2026-Q2');
  assert.equal(quarterAt('2026-06-30T16:00:00.000Z').key,'2026-Q3');assert.equal(quarterAt('2026-09-30T16:00:00.000Z').key,'2026-Q4');
  const q=quarterAt('2026-11-16T00:00:00Z');assert.equal(q.startDate,'2026-10-01');assert.equal(q.endDate,'2026-12-31');assert.equal(q.nextResetDate,'2027-01-01');
 });
 console.log('TOTAL '+passed+' tests passed. Mock data only; no live writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
