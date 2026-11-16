const {findMember}=require('./memberLookup');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) throw new Error('UNAUTHENTICATED');

  const member = await findMember(db, OPENID);

  // 没有会员档案时只返回占位资料，不自动注册或写入数据库。
  return {
    registered: Boolean(member),
    member: member || {
      nickname: '新会员',
      skillPoints: 0,
      rewardPoints: 0,
      rank: '待评级'
    }
  };
};
