const {findMember}=require('./memberLookup');
const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();
exports.main=async()=>{
 const openid=cloud.getWXContext().OPENID;
 if(!openid) throw Error('UNAUTHENTICATED');
 const member=await findMember(db,openid);
 if(!member)return {total:0,counts:{},recent:[]};
 const memberId=member._id;
 // MVP pagination ceiling: return only latest 100 verified highlights; do not treat this as all-time count at scale.
 const records=await db.collection('hand_records').where({memberId,status:'verified'}).orderBy('occurredAt','desc').limit(100).get();
 const counts={};for(const r of records.data)counts[r.category]=(counts[r.category]||0)+1;
 return {total:records.data.length,counts,recent:records.data.slice(0,10).map(r=>({id:r._id,category:r.category,occurredAt:r.occurredAt})),partial:records.data.length===100};
};
