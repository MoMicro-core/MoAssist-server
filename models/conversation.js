'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    chatbotId: { type: String, required: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    widgetSessionToken: { type: String, required: true, index: true },
    authClient: { type: String, default: '', index: true },
    status: {
      type: String,
      default: 'active',
      enum: ['open', 'active', 'pending', 'closed'],
    },
    visitor: { type: Object, default: {} },
    locale: { type: Object, default: {} },
    lastMessagePreview: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastVisitorMessageAt: { type: Date, default: null },
    unreadForOwner: { type: Number, default: 0 },
    messages: {
      type: [
        {
          id: { type: String, required: true },
          authorType: {
            type: String,
            required: true,
            enum: ['visitor', 'owner', 'assistant'],
          },
          author: {
            type: String,
            required: true,
            enum: ['human', 'ai'],
          },
          content: { type: String, required: true },
          createdAt: { type: Date, required: true },
          read: { type: Boolean, default: false },
          readByOwner: { type: Boolean, default: false },
          readByVisitor: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  params: { timestamps: true },
  indexes: [
    [{ chatbotId: 1, updatedAt: -1 }],
    [{ ownerUid: 1, updatedAt: -1 }],
    [{ chatbotId: 1, authClient: 1, updatedAt: -1 }],
  ],
};
