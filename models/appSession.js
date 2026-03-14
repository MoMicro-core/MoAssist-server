'use strict';

module.exports = {
  properties: {
    token: { type: String, required: true, unique: true },
    uid: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: ['user', 'admin'] },
    fcmToken: { type: String, default: '' },
    data: { type: Object, required: true },
    expiresAt: { type: Date, required: true },
  },
  params: { timestamps: true },
  indexes: [
    [{ token: 1 }, { unique: true }],
    [{ uid: 1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
};
