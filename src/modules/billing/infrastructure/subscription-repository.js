'use strict';

class SubscriptionRepository {
  constructor(model) {
    this.model = model;
  }

  async upsertFromStripe(userUid, subscription) {
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    return this.model
      .findOneAndUpdate(
        { id: subscription.id },
        {
          $set: {
            userUid,
            customerId: subscription.customer,
            priceId: subscription.items?.data?.[0]?.price?.id || '',
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd,
            raw: subscription,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        },
      )
      .lean();
  }

  async listByUser(userUid) {
    return this.model.find({ userUid }).sort({ updatedAt: -1 }).lean();
  }

  async deleteByUser(userUid) {
    return this.model.deleteMany({ userUid });
  }
}

module.exports = { SubscriptionRepository };
