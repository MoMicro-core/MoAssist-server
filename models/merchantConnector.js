'use strict';

module.exports = {
  properties: {
    chatbotId: { type: String, required: true, unique: true },
    ownerUid: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: false },
    // sha256 of the connector source; doubles as the compiled-cache key.
    version: { type: String, default: '' },
    storagePath: { type: String, default: '' },
    baseUrl: { type: String, default: '' },
    allowedHosts: { type: [String], default: [] },
    // { encrypted, payload } produced by secret-box; never returned to clients.
    secrets: { type: Object, default: {} },
    intents: { type: Array, default: [] },
    // Per-intent L2-normalized centroid vectors, cached at save time.
    intentVectors: { type: Array, default: [] },
    intentsEmbeddedAt: { type: Date, default: null },
    routerThreshold: { type: Number, default: 0.35 },
    routerMargin: { type: Number, default: 0.05 },
  },
  params: { timestamps: true },
};
