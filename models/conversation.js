'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    chatbotId: { type: String, required: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    widgetSessionToken: { type: String, required: true, index: true },
    status: { type: String, default: 'open', enum: ['open', 'closed'] },
    visitor: { type: Object, default: {} },
    locale: { type: Object, default: {} },
    lastMessagePreview: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
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
          content: { type: String, required: true },
          createdAt: { type: Date, required: true },
          readByOwner: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  params: { timestamps: true },
  indexes: [
    [{ chatbotId: 1, updatedAt: -1 }],
    [{ ownerUid: 1, updatedAt: -1 }],
  ],
};
