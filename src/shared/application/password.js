'use strict';

const crypto = require('node:crypto');

const KEY_LENGTH = 64;

// Self-contained password hashing using Node's built-in scrypt, so no bcrypt
// dependency is required. Each password gets its own random salt; verification
// is constant-time.
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(String(password), salt, KEY_LENGTH)
    .toString('hex');
  return { passwordHash: derived, passwordSalt: salt };
};

const verifyPassword = (password, passwordHash, passwordSalt) => {
  if (!passwordHash || !passwordSalt) return false;
  const derived = crypto.scryptSync(String(password), passwordSalt, KEY_LENGTH);
  const expected = Buffer.from(passwordHash, 'hex');
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
};

module.exports = { hashPassword, verifyPassword };
