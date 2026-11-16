'use strict';
const cloud=require('wx-server-sdk');
const {findMember,APP_ID}=require('./memberLookup');
const {readParticipation,stamp}=require('./participation');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
function day(d){return stamp(d).slice(0,10);}
const handNames={straight_flush:'同花顺',four_of_a_kind:'四条',full_house:'葫芦',flush:'同花',straight:'顺子',three_of_a_kind:'三条'};
exports.main=async function(){
 const ctx=cloud.getWXContext();
 if(!ctx.OPENID)throw Error('UNAUTHENTICATED');
 if(ctx.APPID&&ctx.APPID!==APP_ID)throw Error('APP_ID_MISMATCH');
 const member=await findMember(db,ctx.OPENID);
 if(!member)return {registered:false};
 if(member.status&&member.status!=='active')throw Error('MEMBER_DISABLED');
 const id=member._id;
 const parts=await Promise.all([
  readParticipation(db,id),
  db.collection('champion_awards').where({memberId:id,status:'verified'}).limit(50).get(),
  db.collection('hand_records').where({memberId:id,status:'verified'}).limit(100).get()
 ]);
 const participation=parts[0],applied=participation.formalApplications,attended=participation.formalParticipated;
 const champions=parts[1].data.filter(x=>x.isTest!==true),hands=parts[2].data.filter(x=>x.isTest!==true);
 const events=[],joined=day(member.joinedAt||member.createdAt);
 if(joined)events.push({id:'joined',kind:'joined',date:joined,title:'加入青年公社',detail:'成长旅程从这里开始'});
 applied.forEach(a=>events.push({id:'apply:'+a.activityId,kind:'registration',date:a.registeredAt.slice(0,10)||a.startDate||'',title:'报名活动 · '+a.title,detail:'待签到，报名不代表实际到场'}));
 attended.forEach(a=>events.push({id:'attend:'+a.activityId,kind:'attendance',date:a.checkedInAt.slice(0,10),title:'参加了 · '+a.title,detail:'管理员已确认到场 · 活动日期 '+a.startDate+' · '+a.checkedInAt+' 签到'}));
 champions.forEach(c=>events.push({id:'champion:'+c._id,kind:'champion',date:day(c.awardedAt),title:'获得活动荣誉',detail:c.eventName||'已认证的荣誉'}));
 hands.forEach(h=>events.push({id:'hand:'+h._id,kind:'honor',date:day(h.occurredAt),title:'精彩手牌认证',detail:handNames[h.category]||'扑克活动记录'}));
 events.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return {registered:true,
  profile:{nickname:member.nickname||'会员',avatarFileID:member.avatarFileID||'',joinedAt:joined,intro:member.intro||'',interests:Array.isArray(member.interests)?member.interests:[],joinedAtKnown:!!joined},
  summary:{registeredActivities:applied.length,checkedInActivities:attended.length,verifiedHonors:champions.length+hands.length,checkinImplemented:true},
  timeline:events.slice(0,100),
  partial:{registrations:false,champions:parts[1].data.length===50,hands:parts[2].data.length===100,timeline:events.length>100}
 };
};
