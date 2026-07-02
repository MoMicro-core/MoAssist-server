'use strict';

const crypto = require('node:crypto');

const KEY_BYTES = 32;
const IV_BYTES = 12;

const parseKey = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === KEY_BYTES) return base64;

  // Any other string is stretched to a stable 32-byte key.
  return crypto.createHash('sha256').update(raw).digest();
};

class SecretBox {
  constructor(key = '') {
    this.key = parseKey(key);
  }

  isConfigured() {
    return Boolean(this.key);
  }

  encrypt(value) {
    const plaintext = JSON.stringify(value ?? null);
    if (!this.key) return { encrypted: false, payload: plaintext };

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      encrypted: true,
      payload: Buffer.concat([iv, tag, data]).toString('base64'),
    };
  }

  decrypt(box) {
    if (!box || typeof box !== 'object') return null;
    if (!box.encrypted) {
      try {
        return JSON.parse(box.payload);
      } catch {
        return null;
      }
    }
    if (!this.key) return null;

    try {
      const raw = Buffer.from(String(box.payload || ''), 'base64');
      const iv = raw.subarray(0, IV_BYTES);
      const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
      const data = raw.subarray(IV_BYTES + 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plaintext);
    } catch {
      return null;
    }
  }
}

module.exports = { SecretBox };
