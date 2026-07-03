'use strict';

module.exports = {
  properties: {
    token: { type: String, required: true, unique: true },
    chatbotId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    authClient: { type: String, default: '', index: true },
    visitorData: { type: Object, default: {} },
    locale: { type: Object, default: {} },
    origin: { type: String, default: '' },
    realtimeUser: { type: Object, default: null },
    realtimeVerifiedAt: { type: Date, default: null },
    // sha256 of the verified auth token: detects login-as-another-user
    // without re-verifying the same token on every widget connect.
    realtimeTokenHash: { type: String, default: '' },
    realtimeSnapshot: { type: Object, default: null },
    realtimeSnapshotAt: { type: Date, default: null },
    lastActiveAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  params: { timestamps: true },
  indexes: [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
};
