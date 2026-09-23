'use strict';
const crypto = require('crypto');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
function signature(...parts) { return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex'); }
function equal(a, b) { return /^[a-f0-9]{40}$/.test(a || '') && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function parse(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 65536) throw Error('invalid body');
  if (body.trim().startsWith('{')) return JSON.parse(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(body) || XMLValidator.validate(body) !== true) throw Error('invalid XML');
  const value = new XMLParser({ parseTagValue: false, ignoreAttributes: true, processEntities: false }).parse(body).xml;
  if (!value || typeof value !== 'object') throw Error('invalid XML root');
  return value;
}
function decodeDelivery(value) {
  if (!value.MiniGame) return value;
  const g = { ...value.MiniGame };
  for (const key of ['IsPreview', 'Zone', 'GiftTypeId']) {
    if (typeof g[key] === 'string' && /^\d+$/.test(g[key])) g[key] = Number(g[key]);
  }
  g.GoodsList = (Array.isArray(g.GoodsList) ? g.GoodsList : [g.GoodsList]).map(item => ({
    ...item, Num: typeof item?.Num === 'string' && /^\d+$/.test(item.Num) ? Number(item.Num) : item?.Num,
  }));
  return { ...value, MiniGame: g };
}
function codec(config) {
  if (!config.token || !/^[A-Za-z0-9+/]{43}$/.test(config.aesKey || '') || !config.appId) throw Error('callback secrets not configured');
  const key = Buffer.from(config.aesKey + '=', 'base64');
  function encrypt(text) {
    const msg = Buffer.from(text); const size = Buffer.alloc(4); size.writeUInt32BE(msg.length);
    const raw = Buffer.concat([crypto.randomBytes(16), size, msg, Buffer.from(config.appId)]);
    const padded = Buffer.concat([raw, Buffer.alloc(32 - raw.length % 32, 32 - raw.length % 32)]);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16)); cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
  }
  function decrypt(encoded) {
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('invalid ciphertext');
    const cipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16)); cipher.setAutoPadding(false);
    let raw = Buffer.concat([cipher.update(Buffer.from(encoded, 'base64')), cipher.final()]);
    const pad = raw[raw.length - 1];
    if (pad < 1 || pad > 32 || !raw.subarray(raw.length - pad).every(n => n === pad)) throw Error('invalid padding');
    raw = raw.subarray(0, raw.length - pad);
    if (raw.length < 20) throw Error('invalid encrypted message');
    const length = raw.readUInt32BE(16);
    if (length > raw.length - 20 || raw.subarray(20 + length).toString() !== config.appId) throw Error('appid mismatch');
    return raw.subarray(20, 20 + length).toString();
  }
  return { encrypt, decrypt };
}
function createHandler(config, deliver) {
  return async event => {
    const response = (statusCode, body, type = 'text/plain') => ({ statusCode, headers: { 'Content-Type': `${type}; charset=utf-8` }, body });
    try {
      if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, 'method not allowed');
      const c = codec(config); const q = event.queryStringParameters || {};
      if (!/^\d+$/.test(q.timestamp || '') || typeof q.nonce !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(q.nonce)) return response(403, 'invalid signature');
      if (event.httpMethod === 'GET') {
        if (!equal(q.signature, signature(config.token, q.timestamp, q.nonce))) return response(403, 'invalid signature');
        return response(200, typeof q.echostr === 'string' ? q.echostr : '');
      }
      const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body;
      const envelope = parse(body);
      if (!equal(q.msg_signature, signature(config.token, q.timestamp, q.nonce, String(envelope.Encrypt || '')))) return response(403, 'invalid signature');
      const message = decodeDelivery(parse(c.decrypt(envelope.Encrypt)));
      let result;
      try { result = await deliver(message); }
      catch (error) { result = { ErrCode: 1, ErrMsg: 'Delivery failed', ...(error.subCode ? { SubErrCode: error.subCode } : {}) }; console.error('[wechat-gift]', String(error.message)); }
      const json = body.trim().startsWith('{');
      const plaintext = json ? JSON.stringify(result) : `<xml><ErrCode>${result.ErrCode}</ErrCode><ErrMsg>${result.ErrMsg}</ErrMsg>${result.SubErrCode ? `<SubErrCode>${result.SubErrCode}</SubErrCode>` : ''}</xml>`;
      const Encrypt = c.encrypt(plaintext); const TimeStamp = String(Math.floor(Date.now() / 1000)); const Nonce = q.nonce;
      const MsgSignature = signature(config.token, TimeStamp, Nonce, Encrypt);
      return response(200, json ? JSON.stringify({ Encrypt, TimeStamp, Nonce, MsgSignature })
        : `<xml><Encrypt><![CDATA[${Encrypt}]]></Encrypt><MsgSignature>${MsgSignature}</MsgSignature><TimeStamp>${TimeStamp}</TimeStamp><Nonce><![CDATA[${Nonce.replace(/]]>/g, '')}]]></Nonce></xml>`, json ? 'application/json' : 'application/xml');
    } catch (_) { return response(400, 'invalid callback or configuration'); }
  };
}
module.exports = { signature, codec, parse, createHandler };
