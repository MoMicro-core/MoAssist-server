/* eslint-disable camelcase */
'use strict';

const fp = require('fastify-plugin');
const Stripe = require('stripe');

const toStripeAmount = (price) => Math.round(price * 100);

class StripeManager {
  constructor({ stripe, fastify }) {
    this.stripe = stripe;
    this.fastify = fastify;
  }

  async getOnboardingLink(accountId) {
    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://rstays.com',
      return_url: 'https://rstays.com',
      type: 'account_onboarding',
    });
    return accountLink.url;
  }

  async createCustomer({ uid, email, paymentInfo = null }) {
    const account = await this.stripe.accounts.create({
      email,
      type: 'express',
      country: 'AE',
    });

    const customer = await this.stripe.customers.create({
      email,
      metadata: { uid },
    });
    if (paymentInfo?.paymentMethodId) {
      await this.attachPaymentMethod(
        customer.id,
        paymentInfo.paymentMethodId,
        true,
      );
    }

    return { customer, account };
  }

  async capturePayment(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.capture(
      paymentIntentId,
      {
        expand: ['latest_charge'],
      },
    );

    return paymentIntent;
  }

  async declinePayment(paymentIntentId) {
    const paymentIntent =
      await this.stripe.paymentIntents.cancel(paymentIntentId);
    return paymentIntent;
  }

  async createIntent(props) {
    const { customerId, amount, currency } = props;
    const { bookingId, paymentReceiveType } = props;
    const { useBalance, userBalanceUS, userBalanceCurr } = props;
    const { hostUid, guestUid, checkIn, checkOut, discounts } = props;

    let paymentAmount = amount;

    if (useBalance && userBalanceUS !== 0) {
      paymentAmount -= userBalanceCurr;
    }

    for (const discount of discounts) {
      paymentAmount += discount.price;
    }

    if (paymentAmount <= 0) {
      if (currency === 'USD') {
        paymentAmount = 1;
      } else {
        const rateUSD = await this.fastify.rates.get(`USD-${currency}`);
        paymentAmount = Math.round(rateUSD);
      }
    }

    const amountInCents = Math.round(paymentAmount * 100);

    const metadata = {
      bookingId,
      customerId,
      hostUid,
      guestUid,
      checkIn,
      checkOut,
      platformFee: Math.round(
        amount * this.fastify.config.stripe.applicationFee,
      ),
      discounts: JSON.stringify(discounts),
      useBalance,
      userBalanceUS,
      paymentReceiveType,
      amount,
      currency,
    };

    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      {
        customer: customerId,
      },
      { apiVersion: '2024-06-20' },
    );

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      customer: customerId,
      capture_method: 'manual',
      metadata,
      automatic_payment_methods: { enabled: true },
    });

    return {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
    };
  }

  async createCheckoutNotStripe(props) {
    const { customerId, amount, currency } = props;
    const { bookingId, email, paymentReceiveType } = props;
    const { useBalance, userBalanceUS, userBalanceCurr } = props;
    const { hostUid, guestUid, checkIn, checkOut, discounts } = props;

    let paymentAmount = amount;

    if (useBalance && userBalanceUS !== 0) {
      paymentAmount -= userBalanceCurr;
    }
    // const discounts = [];
    // if (discount > 0) {
    //   const discountAmount = Math.round(paymentAmount * (discount / 100));
    //   discounts.push({
    //     amount: discountAmount,
    //     name: 'Discount',
    //   });
    // }
    for (const discount of discounts) {
      paymentAmount += discount.price;
    }

    if (paymentAmount <= 0) paymentAmount = 1;
    const metadata = {
      bookingId,
      customerId,
      hostUid,
      guestUid,
      checkIn,
      checkOut,
      platformFee: Math.round(
        amount * this.fastify.config.stripe.applicationFee,
      ),
      discounts: JSON.stringify(discounts),
      useBalance,
      userBalanceUS,
      paymentReceiveType,
      amount,
      currency,
    };

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: Math.round(paymentAmount * 100),
            product_data: { name: `Booking #${bookingId}` },
          },
          quantity: 1,
        },
        // {
        //   price_data: {
        //     currency,
        //     unit_amount: Math.round(paymentAmount * 0.05 * 100),
        //     product_data: { name: 'Rstays Service Fee (5%)' },
        //   },
        //   quantity: 1,
        // },
      ],
      metadata,
      payment_intent_data: {
        capture_method: 'manual',
        metadata,
      },
      customer_email: email,
      success_url: `http://localhost:5000/stripe?res=true`,
      cancel_url: `http://localhost:5000/stripe?res=false`,
    });

    return { url: session.url, id: session.id };
  }
  async checkOnboardingStatus(accountId) {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      // can be rewriten
      if (
        account.details_submitted &&
        account.charges_enabled &&
        account.payouts_enabled
      ) {
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  // async createCheckoutSessionBooking(props) {
  //   const { customerId, amount, currency } = props;
  //   const { bookingId, destinationAccountId } = props;
  //   const { useBalance, userBalanceUS, userBalanceCurr } = props;
  //
  //   let paymentAmount = amount;
  //
  //   if (useBalance && userBalanceUS !== 0) {
  //     paymentAmount -= userBalanceCurr;
  //   }
  //
  //   const session = await this.stripe.checkout.sessions.create({
  //     mode: 'payment',
  //     payment_method_types: ['card'],
  //     line_items: [
  //       {
  //         price_data: {
  //           currency,
  //           unit_amount: Math.round(paymentAmount * 100), // amount in cents
  //           product_data: { name: `Booking #${bookingId}` },
  //         },
  //         quantity: 1,
  //       },
  //     ],
  //     payment_intent_data: {
  //       capture_method: 'manual',
  //       transfer_data: { destination: destinationAccountId },
  //       application_fee_amount: Math.round(amount * 0.05 * 100),
  //       metadata: {
  //         bookingId,
  //         platformCustomerId: customerId,
  //         useBalance,
  //         difference: userBalanceCurr,
  //         balance: userBalanceUS,
  //         paymentId: null,
  //         paymentReceiveType: 'stripe',
  //       },
  //     },
  //     metadata: { bookingId, platformCustomerId: customerId },
  //     success_url: `https://rstays.com/stripe?res=true`,
  //     cancel_url: `https://rstays.com/stripe?res=false`,
  //   });
  //
  //   return { url: session.url, id: session.id };
  // }

  async transferToConnectedAccount(props) {
    const { destinationAccountId, amount, currency = 'USD', bookingId } = props;
    const transfer = await this.stripe.transfers.create({
      amount: amount * 100,
      currency,
      destination: destinationAccountId,
      metadata: { bookingId },
    });

    return transfer;
  }

  async getConnectAccountStats(
    connectedAccountId,
    fromDate,
    toDate,
    bookingsId = [],
  ) {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new Error('Invalid fromDate or toDate');
    }

    const fromTimestamp = Math.floor(from.getTime() / 1000);
    const toTimestamp = Math.floor(to.getTime() / 1000);

    const transfers = [];
    let hasMoreTransfers = true;
    let startingAfterTransfer;

    while (hasMoreTransfers) {
      const page = await this.stripe.transfers.list({
        destination: connectedAccountId,
        created: { gte: fromTimestamp, lte: toTimestamp },
        limit: 100,
        starting_after: startingAfterTransfer,
      });

      transfers.push(...page.data);
      hasMoreTransfers = page.has_more;
      startingAfterTransfer = hasMoreTransfers
        ? page.data[page.data.length - 1].id
        : undefined;
    }

    const filteredTransfers = bookingsId.length
      ? transfers.filter((t) => bookingsId.includes(t.metadata?.bookingId))
      : transfers;

    const totalNet = filteredTransfers.reduce((acc, t) => {
      const currency = t.currency.toLowerCase();
      acc[currency] = (acc[currency] || 0) + t.amount / 100;
      return acc;
    }, {});

    const payouts = [];
    let hasMorePayouts = true;
    let startingAfterPayout;

    while (hasMorePayouts) {
      const page = await this.stripe.payouts.list(
        {
          arrival_date: { gte: fromTimestamp, lte: toTimestamp },
          limit: 100,
          starting_after: startingAfterPayout,
        },
        { stripeAccount: connectedAccountId },
      );

      payouts.push(...page.data);
      hasMorePayouts = page.has_more;
      startingAfterPayout = hasMorePayouts
        ? page.data[page.data.length - 1].id
        : undefined;
    }

    const totalPayouts = payouts.reduce((acc, p) => {
      const currency = p.currency.toLowerCase();
      acc[currency] = (acc[currency] || 0) + p.amount / 100;
      return acc;
    }, {});

    return {
      totalNet,
      totalPayouts,
      transfers: filteredTransfers.map((t) => ({
        ...t.metadata,
        amount: t.amount / 100,
      })),
    };
  }

  async refundBooking(paymentIntentId, percentage = 0.5) {
    if (percentage < 0 || percentage > 1) {
      throw new Error('Percentage must be between 0 and 1');
    }
    const paymentIntent =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'requires_capture') {
      const canceledIntent =
        await this.stripe.paymentIntents.cancel(paymentIntentId);
      return { status: 'canceled', paymentIntent: canceledIntent };
    } else {
      const refundAmount = Math.round(
        paymentIntent.amount_received * percentage,
      );
      if (refundAmount <= 0) {
        throw new Error('Refund amount must be greater than 0');
      }
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: refundAmount,
      });
      return { status: 'refunded', refund };
    }
  }

  async updatePaymentInfo(customerId, paymentInfo) {
    const paymentMethodId = paymentInfo.paymentMethodId;

    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }

  async createPaymentIntent(amount, currency, customerId, metadata = {}) {
    const customer = await this.stripe.customers.retrieve(customerId);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: toStripeAmount(amount),
      currency,
      customer: customerId,
      payment_method:
        customer.invoice_settings?.default_payment_method || undefined,
      off_session: !!customer.invoice_settings?.default_payment_method,
      confirm: !!customer.invoice_settings?.default_payment_method,
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return { paymentIntent };
  }

  async createTransfer(amount, currency, destinationAccountId, metadata = {}) {
    return this.stripe.transfers.create({
      amount: toStripeAmount(amount),
      currency,
      destination: destinationAccountId,
      metadata,
    });
  }

  async getEarnings(customerId, limit = 100) {
    const paymentIntents = await this.stripe.paymentIntents.list({
      customer: customerId,
      limit,
    });

    const succeeded = paymentIntents.data.filter(
      (pi) => pi.status === 'succeeded',
    );
    const total = succeeded.reduce((sum, pi) => sum + pi.amount_received, 0);

    return {
      total,
      count: succeeded.length,
      data: succeeded,
    };
  }

  async attachPaymentMethod(customerId, paymentMethodId, setAsDefault = true) {
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    if (setAsDefault) {
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }
}

async function stripePlugin(fastify) {
  fastify.log.info('Initializing Stripe Plugin');
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_KEY_LIVE = process.env.STRIPE_SECRET_KEY_LIVE;
  const stripe = new Stripe(STRIPE_KEY);
  const stripeLive = new Stripe(STRIPE_KEY_LIVE);
  await fastify.decorate(
    'stripeManager',
    new StripeManager({ stripe, fastify }),
  );
  await fastify.decorate(
    'stripeManagerLive',
    new StripeManager({ stripe: stripeLive, fastify }),
  );
  fastify.decorate('stripe', stripe);
  fastify.decorate('stripeLive', stripeLive);
  // async function fundTestBalance(amount) {
  //   const paymentIntent = await stripe.paymentIntents.create({
  //     amount: amount * 100,
  //     currency: 'USD',
  //     payment_method_types: ['card'],
  //     payment_method: 'pm_card_visa',
  //     confirm: true, // confirm immediately
  //   });
  // }

  // Example: top up $100
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
  // fundTestBalance(999999);
}

module.exports = fp(stripePlugin, {
  fastify: '5.x',
});
