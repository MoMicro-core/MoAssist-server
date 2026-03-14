'use strict';

module.exports = {
  secretKey: process.env.STRIPE_SECRET_KEY || process.env.StripeSec || '',
  webhookSecret:
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.Stripe_webhook_secret ||
    '',
  premiumPriceId:
    process.env.STRIPE_PREMIUM_PRICE_ID ||
    process.env.StripePremiumPriceId ||
    '',
};
