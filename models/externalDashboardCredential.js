'use strict';

// Credentials for the embeddable "External dashboard" login. Kept in their own
// collection so the password hash never travels with the chatbot document that
// is serialized back to clients. One credential record per chatbot.
module.exports = {
  properties: {
    chatbotId: { type: String, required: true, unique: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: false },
    username: { type: String, default: '' },
    passwordHash: { type: String, default: '' },
    passwordSalt: { type: String, default: '' },
  },
  params: { timestamps: true },
  indexes: [],
};
