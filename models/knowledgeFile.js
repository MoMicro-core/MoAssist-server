'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    chatbotId: { type: String, required: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      default: 'ready',
      enum: ['processing', 'ready', 'failed'],
    },
    chunksCount: { type: Number, default: 0 },
    directory: { type: String, required: true },
    originalPath: { type: String, required: true },
    textPath: { type: String, required: true },
    manifestPath: { type: String, required: true },
    vectorsPath: { type: String, required: true },
  },
  params: { timestamps: true },
  indexes: [
    [{ chatbotId: 1, updatedAt: -1 }],
  ],
};
