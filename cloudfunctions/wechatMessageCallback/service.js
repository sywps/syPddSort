'use strict';
const crypto = require('crypto');
const GOODS = Object.freeze({ jinbi: 'gold', qingcao: 'brushCount', citie: 'magnetCount', dongjie: 'freezeCount' });
const FIELDS = Object.values(GOODS);
function integer(n) { if (!Number.isSafeInteger(n) || n < 0) throw Error('invalid inventory number'); return n; }
function string(value, max) {
  if (typeof value !== 'string' || !value || value.length > max) throw Error('invalid message string');
  return value;
}
function normalize(message, config) {
  if (message.MsgType !== 'event' || message.Event !== 'minigame_deliver_goods') throw Error('unsupported event');
  const g = message.MiniGame;
  if (!g || !config.giftIds.includes(g.GiftId) || g.GiftTypeId !== 1) throw Error('unconfigured gift');
  if (![0, 1].includes(g.IsPreview) || ![1001, 2001].includes(g.Zone)) throw Error('invalid delivery mode');
  const order = { orderId: string(g.OrderId, 256), openid: string(g.ToUserOpenid, 128),
    giftId: g.GiftId, giftTypeId: g.GiftTypeId, zone: g.Zone, isPreview: g.IsPreview, goods: {} };
  if (g.IsPreview && !(config.previewOpenids || []).includes(order.openid)) throw Error('preview account not allowed');
  if (!Array.isArray(g.GoodsList) || !g.GoodsList.length || g.GoodsList.length > 32) throw Error('invalid goods list');
  for (const item of g.GoodsList) {
    const field = item && Object.prototype.hasOwnProperty.call(GOODS, item.Id) ? GOODS[item.Id] : null;
    if (!field || !Number.isSafeInteger(item.Num) || item.Num <= 0 || item.Num > 1000000) throw Error('invalid goods');
    order.goods[field] = integer((order.goods[field] || 0) + item.Num);
  }
  order.goods = Object.fromEntries(Object.entries(order.goods).sort());
  return order;
}
function createDelivery(db, config) {
  return async message => {
    const order = normalize(message, config);
    const id = crypto.createHash('sha256').update(`${config.appId}:${order.orderId}`).digest('hex');
    const digest = crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex');
    const profiles = await db.collection('user_profile').where({ openid: order.openid }).limit(2).get();
    if (!profiles.data?.length) { const error = Error('unregistered user'); error.subCode = 172935494; throw error; }
    if (profiles.data.length !== 1) throw Error('ambiguous user profile');
    return db.runTransaction(async tx => {
      const receiptRef = tx.collection('wechat_gift_orders').doc(id);
      // database({ throwOnNotFound: false }) returns null only for an absent document.
      // Permission/network errors still abort the transaction.
      const existing = await receiptRef.get();
      if (existing.data) {
        if (existing.data.digest !== digest) throw Error('order payload conflict');
        return { ErrCode: 0, ErrMsg: 'Success' };
      }
      const ref = tx.collection('user_profile').doc(profiles.data[0]._id);
      const profile = (await ref.get()).data;
      if (profile?.openid !== order.openid) throw Error('profile ownership mismatch');
      if (profile.wechatGiftProtocol !== 1) throw Error('gift-compatible client has not synchronized');
      const totals = {};
      const patch = {};
      for (const field of FIELDS) {
        const amount = order.goods[field] || 0;
        totals[field] = integer(integer(profile.wechatGiftTotals?.[field] ?? 0) + amount);
        patch[field] = integer(integer(profile[field]) + amount);
      }
      // Gifts have their own cumulative watermark; do not invalidate unrelated local changes via PVP revision/time.
      patch.wechatGiftTotals = totals;
      await ref.update({ data: patch });
      await receiptRef.set({ data: { ...order, digest, appId: config.appId, status: 'DELIVERED', deliveredAt: Date.now() } });
      return { ErrCode: 0, ErrMsg: 'Success' };
    });
  };
}
module.exports = { createDelivery, normalize, FIELDS };
