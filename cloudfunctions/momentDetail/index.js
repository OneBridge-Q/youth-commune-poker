const {findMember}=require('./memberLookup');
const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database();
exports.main=async(event)=>{
 const openid=cloud.getWXContext().OPENID;if(!openid)throw Error('UNAUTHENTICATED');
 const member=await findMember(db,openid);
 if(!member)throw Error('MEMBER_NOT_FOUND');const type=event.type;
 if(!['hand','champion'].includes(type)||typeof event.id!=='string'||!event.id)throw Error('INVALID_INPUT');
 const collection=type==='hand'?'hand_records':'champion_awards';
 const record=await db.collection(collection).doc(event.id).get().catch(()=>null);
 if(!record||!record.data||record.data.memberId!==member._id||record.data.status!=='verified'||record.data.isTest===true)throw Error('NOT_FOUND');
 const r=record.data;
 return {id:r._id,type,category:type==='hand'?r.category:null,title:type==='champion'?(r.eventName||'策略挑战活动冠军'):null,place:type==='champion'?(r.place||1):null,competitionType:r.competitionType||'',nickname:member.nickname||'会员',date:r.occurredAt||r.awardedAt,certificateId:type==='champion'?r.certificateId:null};
};