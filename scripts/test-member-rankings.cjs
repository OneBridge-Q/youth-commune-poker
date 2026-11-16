'use strict';
// Local cloud simulation only. No network calls or live data changes.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
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
let collections,context,clock,denied;
const clone=value=>structuredClone(value);
class Query{
 constructor(name,filter){this.name=name;this.filter=filter;this.size=100;this.offset=0;this.order=null;}
 limit(n){this.size=n;return this;}skip(n){this.offset=n;return this;}orderBy(k,d){this.order=[k,d];return this;}
 async get(){if(denied===this.name)throw Error('permission denied');if(!collections[this.name])throw Error('database collection not exists');let rows=collections[this.name].filter(x=>matches(x,this.filter));if(this.order){const[k,d]=this.order;rows=rows.slice().sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(d==='desc'?-1:1));}return {data:clone(rows.slice(this.offset,this.offset+this.size))};}
}
class Aggregate{
 constructor(name){this.name=name;this.steps=[];}
 match(x){this.steps.push(['match',x]);return this;}project(x){this.steps.push(['project',x]);return this;}group(x){this.steps.push(['group',x]);return this;}lookup(x){this.steps.push(['lookup',x]);return this;}unwind(x){this.steps.push(['unwind',x]);return this;}sort(x){this.steps.push(['sort',x]);return this;}limit(x){this.steps.push(['limit',x]);return this;}
 async end(){if(!collections[this.name])throw Error('database collection not exists');let rows=clone(collections[this.name]);for(const [stage,arg]of this.steps){if(stage==='match')rows=rows.filter(x=>matches(x,arg));else if(stage==='limit')rows=rows.slice(0,arg);else if(stage==='sort')rows.sort((a,b)=>{for(const k of Object.keys(arg)){if(a[k]!==b[k])return(a[k]>b[k]?1:-1)*arg[k];}return 0;});else if(stage==='project')rows=rows.map(x=>{const out={};for(const k in arg)out[k]=arg[k]===1?x[k]:get(x,arg[k].slice(1));return out;});else if(stage==='group'){const g=new Map();for(const x of rows){const id=get(x,arg._id.slice(1));if(!g.has(id))g.set(id,{_id:id,score:0});const n=get(x,arg.score.sum.slice(1));if(typeof n==='number')g.get(id).score+=n;}rows=Array.from(g.values());}else if(stage==='lookup')rows=rows.map(x=>Object.assign({},x,{[arg.as]:clone(collections[arg.from].filter(m=>get(m,arg.foreignField)===get(x,arg.localField)))}));else if(stage==='unwind'){const k=arg.slice(1);rows=rows.flatMap(x=>(get(x,k)||[]).map(m=>Object.assign({},x,{[k]:m})));}else throw Error(stage);}return {list:rows};}
}
const db={command:cmd,collection(name){return {where:q=>new Query(name,q),aggregate:()=>new Aggregate(name)};}};
const run=createService({database:()=>db,getWXContext:()=>context},()=>clock);
function edge(a,b,extra={}){return Object.assign({_id:a+'-'+b,memberA:a,memberB:b,status:'accepted',acceptedBy:[a,b],isTest:false},extra);}
function reset(){clock=Date.parse('2026-11-16T00:00:00Z');context={OPENID:'openid-a',APPID:APP_ID};denied='';collections={members:[{_id:'a',_openid:'openid-a',nickname:'本人',status:'active',skillPoints:99999,rewardPoints:900},{_id:'b',_openid:'openid-b',nickname:'好友乙',skillPoints:120},{_id:'c',nickname:'好友丙',status:'active',skillPoints:120},{_id:'d',nickname:'好友丁',status:'active',skillPoints:60},{_id:'stranger',nickname:'非好友',status:'active',skillPoints:9999},{_id:'hidden',nickname:'隐藏',skillPoints:999,rankVisible:false},{_id:'blocked',nickname:'停用',skillPoints:888,status:'blocked'},{_id:'tester',nickname:'测试',skillPoints:777,isTest:true}],member_identities:[],member_friendships:[edge('a','b'),edge('c','a'),edge('a','d')],charisma_ledger:[]};}
function entry(id,memberId,delta,extra={}){return Object.assign({_id:id,memberId,status:'posted',isTest:false,periodKey:'2026-Q4',effectiveAt:new Date('2026-11-15T12:00:00+08:00'),kind:'earn',source:'knowledge_sharing',rankingDelta:delta},extra);}
let passed=0;async function test(name,fn){reset();await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await test('only confirmed friends; ties ranked within friends',async()=>{const r=await run({board:'battle'});assert.equal(r.scope,'confirmed_friends');assert.deepEqual(r.rows.map(x=>[x.rank,x.score]),[[1,120],[1,120],[3,60]]);assert.equal(r.me,undefined);assert(!JSON.stringify(r).includes('本人'));assert(!JSON.stringify(r).includes('非好友'));});
 await test('battle values survive quarter transition',async()=>{clock=Date.parse('2027-01-01T00:01:00+08:00');assert.equal((await run({board:'battle'})).rows[0].score,120);});
 await test('no relationships returns empty not global',async()=>{collections.member_friendships=[];const r=await run({});assert.equal(r.rows.length,0);assert.equal(r.friendCount,0);});
 await test('missing relationship collection fails closed',async()=>{delete collections.member_friendships;await assert.rejects(run({}),/FRIENDSHIPS_NOT_READY/);});
 await test('friendship read failure never exposes global board',async()=>{denied='member_friendships';await assert.rejects(run({}),/permission denied/);});
 await test('pending blocked removed and one-sided relations excluded',async()=>{collections.member_friendships=[edge('a','b',{status:'pending'}),edge('a','c',{status:'blocked'}),edge('a','d',{status:'removed'}),edge('a','stranger',{acceptedBy:['a']})];assert.equal((await run({})).rows.length,0);});
 await test('test relations and malformed self-relations excluded',async()=>{collections.member_friendships=[edge('a','b',{isTest:true}),edge('a','a')];assert.equal((await run({})).rows.length,0);});
 await test('friends of friends do not participate',async()=>{collections.member_friendships=[edge('a','b'),edge('b','stranger')];assert.deepEqual((await run({})).rows.map(x=>x.nickname),['好友乙']);});
 await test('duplicate relations deduplicated',async()=>{collections.member_friendships.push(edge('b','a'));assert.equal((await run({})).friendCount,3);assert.equal((await run({})).rows.length,3);});
 await test('hidden disabled and test profiles excluded',async()=>{['hidden','blocked','tester'].forEach(x=>collections.member_friendships.push(edge('a',x)));assert.equal((await run({})).rows.length,3);});
 await test('redemption balance not used as quarterly earnings',async()=>{collections.members[1].rewardPoints=1000;assert.equal((await run({board:'charisma'})).rows.length,0);});
 await test('earnings corrections count, redemptions refunds excluded',async()=>{collections.charisma_ledger=[entry('1','b',100),entry('2','b',-10,{kind:'adjustment'}),entry('3','c',90),entry('4','d',20),entry('5','b',-60,{kind:'redeem'}),entry('6','b',60,{kind:'redemption_refund'})];assert.deepEqual((await run({board:'charisma'})).rows.map(x=>[x.rank,x.score]),[[1,90],[1,90],[3,20]]);});
 await test('own and stranger ledger earnings stay private',async()=>{collections.charisma_ledger=[entry('1','a',9000),entry('2','stranger',8000),entry('3','b',10)];const r=await run({board:'charisma'});assert.equal(r.rows.length,1);assert.equal(r.rows[0].nickname,'好友乙');});
 await test('prohibited origins excluded',async()=>{collections.charisma_ledger=[entry('x','b',1000,{source:'poker_win'}),entry('y','b',500,{source:'chip_conversion'}),entry('z','b',5)];assert.equal((await run({board:'charisma'})).rows[0].score,5);});
 await test('test voided and unlabelled ledger entries excluded',async()=>{collections.charisma_ledger=[entry('x','b',10,{isTest:true}),entry('y','b',20,{status:'voided'}),entry('z','b',30,{isTest:undefined})];assert.equal((await run({board:'charisma'})).rows.length,0);});
 await test('quarter boundary is start-inclusive end-exclusive',async()=>{collections.charisma_ledger=[entry('x','b',11,{effectiveAt:new Date('2026-10-01T00:00:00+08:00')}),entry('y','b',99,{effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];assert.equal((await run({board:'charisma'})).rows[0].score,11);});
 await test('quarter rotation preserves history and balance',async()=>{collections.charisma_ledger=[entry('old','b',23),entry('new','b',7,{periodKey:'2027-Q1',effectiveAt:new Date('2027-01-01T00:00:00+08:00')})];const before=clone(collections);clock=Date.parse('2027-01-01T00:00:00+08:00');const r=await run({board:'charisma'});assert.equal(r.period.key,'2027-Q1');assert.equal(r.rows[0].score,7);assert.deepEqual(collections,before);});
 await test('client cannot pick friends identities dates or scores',async()=>{const before=clone(collections);const r=await run({memberId:'stranger',friendIds:['stranger'],scope:'all',now:'2099-01-01',score:123});assert.equal(r.rows.length,3);assert(!r.rows.some(x=>x.nickname==='非好友'));assert.deepEqual(collections,before);});
 await test('new identity linked to old member keeps friend scope',async()=>{context.OPENID='new';collections.member_identities.push({_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':new').digest('hex'),status:'active',memberId:'a'});assert.equal((await run({})).rows.length,3);});
 await test('blocked identity cannot view',async()=>{collections.member_identities.push({_id:'wx_'+crypto.createHash('sha256').update(APP_ID+':openid-a').digest('hex'),status:'blocked',memberId:'a'});await assert.rejects(run({}),/IDENTITY_NOT_ACTIVE/);});
 await test('unregistered users denied',async()=>{context.OPENID='unknown';await assert.rejects(run({}),/REGISTER_REQUIRED/);});
 await test('disabled callers denied',async()=>{collections.members[0].status='blocked';await assert.rejects(run({}),/MEMBER_DISABLED/);});
 await test('wrong AppID denied',async()=>{context.APPID='wrong';await assert.rejects(run({}),/APP_ID_MISMATCH/);});
 await test('missing login denied',async()=>{context.OPENID='';await assert.rejects(run({}),/UNAUTHENTICATED/);});
 await test('unknown boards denied',async()=>assert.rejects(run({board:'all'}),/INVALID_BOARD/));
 await test('private fields and self placement absent',async()=>{const r=await run({});r.rows.forEach(x=>assert.deepEqual(Object.keys(x).sort(),['key','nickname','rank','score']));assert.equal(r.me,undefined);assert(!JSON.stringify(r).includes('openid'));});
 await test('missing charisma ledger is an error with friends',async()=>{delete collections.charisma_ledger;await assert.rejects(run({board:'charisma'}),/CHARISMA_LEDGER_NOT_READY/);});
 await test('friend pages beyond 100 read, top 100 returned',async()=>{for(let i=0;i<105;i++){const id='p'+i;collections.members.push({_id:id,nickname:id,skillPoints:1000+i});collections.member_friendships.push(edge('a',id));}const r=await run({});assert.equal(r.friendCount,108);assert.equal(r.rows.length,100);assert.equal(r.rows[0].score,1104);});
 await test('natural quarters UTC+8',async()=>{assert.equal(quarterAt('2026-12-31T15:59:59.999Z').key,'2026-Q4');assert.equal(quarterAt('2026-12-31T16:00:00Z').key,'2027-Q1');assert.equal(quarterAt('2026-03-31T16:00:00Z').key,'2026-Q2');assert.equal(quarterAt('2026-06-30T16:00:00Z').key,'2026-Q3');assert.equal(quarterAt('2026-09-30T16:00:00Z').key,'2026-Q4');});
 console.log('TOTAL '+passed+' passed. Mock data only; no live writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
