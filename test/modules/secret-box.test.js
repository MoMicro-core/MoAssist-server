'use strict';

const { SecretBox } = require('../../src/shared/application/secret-box');

describe('SecretBox', () => {
  const KEY =
    'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('encrypts and decrypts a secrets object with a configured key', () => {
    const box = new SecretBox(KEY);
    const secrets = { apiKey: 'sk-123', endpoint: 'x' };

    const stored = box.encrypt(secrets);
    expect(stored.encrypted).toBe(true);
    expect(stored.payload).not.toContain('sk-123');
    expect(box.decrypt(stored)).toEqual(secrets);
  });

  it('falls back to a plain payload without a key', () => {
    const box = new SecretBox('');
    const stored = box.encrypt({ apiKey: 'plain' });
    expect(stored.encrypted).toBe(false);
    expect(box.decrypt(stored)).toEqual({ apiKey: 'plain' });
  });

  it('returns null for tampered or unreadable payloads', () => {
    const box = new SecretBox(KEY);
    const stored = box.encrypt({ apiKey: 'sk-123' });
    const tampered = {
      encrypted: true,
      payload: `${stored.payload.slice(0, -4)}AAAA`,
    };
    expect(box.decrypt(tampered)).toBeNull();
    expect(box.decrypt(null)).toBeNull();
    expect(box.decrypt({ encrypted: false, payload: '{broken' })).toBeNull();
  });

  it('stretches an arbitrary passphrase into a stable key', () => {
    const first = new SecretBox('my-passphrase');
    const second = new SecretBox('my-passphrase');
    const stored = first.encrypt({ token: 'value' });
    expect(second.decrypt(stored)).toEqual({ token: 'value' });
  });
});
