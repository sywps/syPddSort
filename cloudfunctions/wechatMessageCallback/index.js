'use strict';
const cloud = require('wx-server-sdk');
const config = require('./config.json');
const { createDelivery } = require('./service');
const { createHandler } = require('./protocol');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = async event => {
  // Paused until the registration gift message capability is confirmed.
  // Both the checked-in switch and the deployment switch must explicitly enable delivery.
  if (config.enabled !== true || process.env.WECHAT_GIFT_ENABLED !== 'true') return { statusCode: 503, body: 'gift callback disabled' };
  const settings = { ...config, token: process.env.WECHAT_MESSAGE_TOKEN, aesKey: process.env.WECHAT_MESSAGE_AES_KEY,
    previewOpenids: (process.env.WECHAT_GIFT_PREVIEW_OPENIDS || '').split(',').filter(Boolean) };
  return createHandler(settings, createDelivery(cloud.database({ throwOnNotFound: false }), settings))(event);
};
