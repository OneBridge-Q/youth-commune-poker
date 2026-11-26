const {findMember,APP_ID}=require('./memberLookup');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({throwOnNotFound:false});

exports.main = async (event={}) => {
  const { OPENID, APPID } = cloud.getWXContext();
  if (!OPENID) throw new Error('UNAUTHENTICATED');

  if (APPID && APPID !== APP_ID) throw new Error('APP_ID_MISMATCH');
  const member = await findMember(db, OPENID);

  if(event.action==='requestClosure'){
    if(!member||event.confirm!==true)throw Error('CLOSURE_CONFIRMATION_REQUIRED');
    return db.runTransaction(async tx=>{
      const ref=tx.collection('members').doc(member._id);
      const current=(await ref.get()).data;
      if(!current)throw Error('MEMBER_NOT_FOUND');
      if(!current.accountClosureRequestedAt){
        await ref.update({data:{accountClosureRequestedAt:new Date()}});
      }
      return {requested:true};
    });
  }
  if(event.action)throw Error('UNSUPPORTED_ACTION');

  // 没有会员档案时只返回占位资料，不自动注册或写入数据库。
  return {
    registered: Boolean(member),
    member: member ? {
      closureRequested: Boolean(member.accountClosureRequestedAt),
      nickname: member.nickname || '会员',
      avatarFileID: member.avatarFileID || '',
      memberNo: member.memberNo || '',
      skillPoints: member.skillPoints || 0,
      rewardPoints: member.rewardPoints || 0,
      rank: member.rank || '待评级'
    } : {
      nickname: '新会员',
      skillPoints: 0,
      rewardPoints: 0,
      rank: '待评级'
    }
  };
};
