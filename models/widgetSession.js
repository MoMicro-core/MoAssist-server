'use strict';

module.exports = {
  properties: {
    token: { type: String, required: true, unique: true },
    chatbotId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    visitorData: { type: Object, default: {} },
    locale: { type: Object, default: {} },
    origin: { type: String, default: '' },
    lastActiveAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  params: { timestamps: true },
  indexes: [
    [{ token: 1 }, { unique: true }],
    [{ conversationId: 1 }],
    [{ chatbotId: 1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
};
