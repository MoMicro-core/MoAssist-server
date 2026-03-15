'use strict';

module.exports = {
  properties: {
    uid: { type: String, required: true, trim: true, unique: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    name: { type: String, default: '', trim: true },
    photoUrl: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    status: { type: String, default: 'active', enum: ['active', 'blocked'] },
    fcmTokens: { type: [String], default: [] },
    stripeCustomerId: { type: String, default: '' },
    premiumStatus: {
      type: String,
      default: 'free',
      enum: ['free', 'active', 'trialing', 'past_due', 'canceled'],
    },
    premiumPlan: { type: String, default: 'free' },
    premiumCurrentPeriodEnd: { type: Date, default: null },
  },
  params: { timestamps: true },
  indexes: [[{ stripeCustomerId: 1 }, { sparse: true }]],
};
