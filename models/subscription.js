'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    userUid: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    priceId: { type: String, default: '' },
    status: { type: String, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    currentPeriodEnd: { type: Date, default: null },
    raw: { type: Object, default: {} },
  },
  params: { timestamps: true },
  indexes: [
    [{ id: 1 }, { unique: true }],
    [{ userUid: 1, updatedAt: -1 }],
    [{ customerId: 1 }],
  ],
};
