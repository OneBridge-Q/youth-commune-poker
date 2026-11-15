const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const POLICY_VERSION = 'v0.4-2026-11-15';
const DEFAULT_STORE = 'store-001'; // 单店试运营；多店前改用后台分配

function publicMember(m) {
  return { id: m._id, memberNo: m.memberNo || m._id,
    nickname: m.nickname, avatarFileID: m.avatarFileID || '', role: m.role || 'member' };
}
function validateName(value) {
  if (typeof value !== 'string') throw Error('INVALID_NICKNAME');
  const nickname = value.trim().replace(/\s+/g, ' ');
  const length = Array.from(nickname).length;
  if (length < 2 || length > 16 || /[\x00-\x1f\x7f]/.test(nickname)) throw Error('INVALID_NICKNAME');
  return nickname;
}
function validateAvatar(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 300 ||
      !/^cloud:\/\/[a-zA-Z0-9._-]+\/member-avatars\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(value)) {
    throw Error('INVALID_AVATAR');
  }
  return value;
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) throw Error('UNAUTHENTICATED');
  const existing = await db.collection('members').where({ _openid: openid }).limit(1).get();

  if (event.action === 'updateProfile') {
    const member = existing.data[0];
    if (!member) throw Error('REGISTER_REQUIRED');
    const nickname = validateName(event.nickname);
    const change = { nickname, updatedAt: db.serverDate() };
    if (Object.prototype.hasOwnProperty.call(event, 'avatarFileID')) {
      change.avatarFileID = validateAvatar(event.avatarFileID);
    }
    await db.collection('members').doc(member._id).update({ data: change });
    return { updated: true, member: publicMember(Object.assign({}, member, change)) };
  }

  // 已有会员重复进入注册页面不覆盖角色、昵称或积分。
  if (existing.data.length) return {
    registered: true, alreadyRegistered: true, member: publicMember(existing.data[0])
  };

  const nickname = validateName(event.nickname);
  if (event.consent !== true || event.policyVersion !== POLICY_VERSION) throw Error('CONSENT_REQUIRED');
  const avatarFileID = validateAvatar(event.avatarFileID);
  const digest = crypto.createHash('sha256').update(openid).digest('hex');
  const memberId = 'm_' + digest.slice(0, 24);
  const memberNo = 'YC' + digest.slice(0, 12).toUpperCase();
  const data = {
    _id: memberId, _openid: openid, memberNo, nickname, avatarFileID,
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
