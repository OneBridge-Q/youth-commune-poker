'use strict';
const crypto = require('crypto');
const APP_ID = 'wxf108b994bb81e185';
async function findMember(db, openid) {
  if (!openid) throw new Error('UNAUTHENTICATED');
  const key = 'wx_' + crypto.createHash('sha256').update(APP_ID + ':' + openid).digest('hex');
  const links = await db.collection('member_identities').where({ _id: key }).limit(1).get();
  if (links.data.length) {
    const link = links.data[0];
    if (link.status !== 'active') throw new Error('IDENTITY_NOT_ACTIVE');
    const rows = await db.collection('members').where({ _id: link.memberId }).limit(1).get();
    if (!rows.data.length) throw new Error('IDENTITY_MEMBER_MISSING');
    return rows.data[0];
  }
  const rows = await db.collection('members').where({ _openid: openid }).limit(2).get();
  if (rows.data.length > 1) throw new Error('DUPLICATE_LEGACY_IDENTITY');
  return rows.data[0] || null;
}
module.exports = { findMember, APP_ID };
