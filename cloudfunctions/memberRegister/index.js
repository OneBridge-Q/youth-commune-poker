const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const POLICY_VERSION = 'v0.4-2026-11-15';
const DEFAULT_STORE = 'store-001'; // 单店试运营；未来改为受服务端校验的门店归属

function publicMember(m) {
  return { id: m._id, memberNo: m.memberNo || m._id,
    nickname: m.nickname, role: m.role || 'member' };
}
function validateName(value) {
  if (typeof value !== 'string') throw Error('INVALID_NICKNAME');
  const nickname = value.trim().replace(/\s+/g, ' ');
  const length = Array.from(nickname).length;
  if (length < 2 || length > 16 || /[\x00-\x1f\x7f]/.test(nickname)) throw Error('INVALID_NICKNAME');
  return nickname;
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) throw Error('UNAUTHENTICATED');
  // 注册行为必须由本人确认；现存会员无需重复填写资料
  const existing = await db.collection('members').where({ _openid: openid }).limit(1).get();
  if (existing.data.length) return { registered: true, alreadyRegistered: true, member: publicMember(existing.data[0]) };
  const nickname = validateName(event.nickname);
  if (event.consent !== true || event.policyVersion !== POLICY_VERSION) throw Error('CONSENT_REQUIRED');

  // 使用 OpenID 的单向摘要作为稳定、不可由客户端自行指定的文档编号。
  // add() 是只插入操作；并发重复提交会遇到唯一 _id 冲突，而不会覆盖已有记录。
  const digest = crypto.createHash('sha256').update(openid).digest('hex');
  const memberId = 'm_' + digest.slice(0, 24);
  const memberNo = 'YC' + digest.slice(0, 12).toUpperCase();
  const data = {
    _id: memberId, _openid: openid, memberNo, nickname,
    role: 'member', storeId: DEFAULT_STORE,
    skillPoints: 0, rewardPoints: 0, rank: '待评级',
    registrationSource: 'wechat_miniprogram',
    policyVersion: POLICY_VERSION, consentAt: db.serverDate(),
    createdAt: db.serverDate(), updatedAt: db.serverDate()
  };
  try {
    await db.collection('members').add({ data });
  } catch (err) {
    const again = await db.collection('members').doc(memberId).get().catch(() => null);
    if (again && again.data && again.data._openid === openid) {
      return { registered: true, alreadyRegistered: true, member: publicMember(again.data) };
    }
    throw err;
  }
  return { registered: true, alreadyRegistered: false, member: publicMember(data) };
};
