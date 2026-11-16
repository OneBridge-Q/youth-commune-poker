const cloud=require('wx-server-sdk');
const {findMember}=require('./memberLookup');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function day(d){
 if(!d)return '';
 if(typeof d==='string')return d.slice(0,10);
 const date=new Date(d);
 return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
}
const handNames={straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',straight:'顺子',three_of_a_kind:'三条'};
exports.main=async function(){
 const ctx=cloud.getWXContext();
 if(!ctx.OPENID)throw Error('UNAUTHENTICATED');
 const member=await findMember(db,ctx.OPENID);
 if(!member)return {registered:false};
 const id=member._id;
 const parts=await Promise.all([
  db.collection('activity_signups').where({memberId:id,status:'applied'}).limit(100).get(),
  db.collection('champion_awards').where({memberId:id,status:'verified'}).limit(50).get(),
  db.collection('hand_records').where({memberId:id,status:'verified'}).limit(100).get()
 ]);
 const applied=parts[0].data,
  champions=parts[1].data.filter(function(x){return x.isTest!==true;}),
  hands=parts[2].data.filter(function(x){return x.isTest!==true;});
 const events=[];
 const joined=day(member.joinedAt||member.createdAt);
 if(joined)events.push({kind:'joined',date:joined,title:'加入青年公社',detail:'成长旅程从这里开始'});
 for(const a of applied){
  events.push({kind:'registration',date:day(a.createdAt)||a.startDate||'',title:'报名活动 · '+(a.title||'青年公社活动'),detail:'已报名，尚不代表签到或实际到场'});
 }
 for(const c of champions){
  events.push({kind:'champion',date:day(c.awardedAt),title:'获得活动荣誉',detail:c.eventName||'已认证的荣誉'});
 }
 for(const h of hands){
  events.push({kind:'honor',date:day(h.occurredAt),title:'精彩手牌认证',detail:handNames[h.category]||'扑克活动记录'});
 }
 events.sort(function(a,b){return b.date.localeCompare(a.date)});
 return {
  registered:true,
  profile:{nickname:member.nickname||'会员',avatarFileID:member.avatarFileID||'',joinedAt:joined,
   intro:member.intro||'',interests:Array.isArray(member.interests)?member.interests:[],joinedAtKnown:!!joined},
  summary:{registeredActivities:applied.length,verifiedHonors:champions.length+hands.length,
   checkedInActivities:0,checkinImplemented:false},
  timeline:events.slice(0,100),
  partial:{registrations:parts[0].data.length===100,champions:parts[1].data.length===50,hands:parts[2].data.length===100}
 };
};
