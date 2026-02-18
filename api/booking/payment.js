'use strict';

const crypto = require('node:crypto');

function generateMostUniqueNumericId(digits = 10) {
  const uuid = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(uuid).digest('hex');
  const num = BigInt('0x' + hash);
  const id = (num % BigInt(10 ** digits)).toString().padStart(digits, '0');
  return id;
}

function convertAndRound(price, rate) {
  const convertedPrice = price * rate;
  return Number(convertedPrice.toFixed(0));
}

module.exports = {
  createCheckout: {
    type: 'post',
    access: ['guest'],
    handler: async (props) => {
      const { fastify, client, bookingId } = props;
      const { useBalance = false, type = 'session' } = props;
      const { stripeMode = 'sandbox' } = props;
      const booking = await fastify.mongodb.bookings.findOne({
        id: bookingId,
        user: client.session.uid,
      });
      if (!booking) return { message: 'Booking not found', statusCode: 404 };
      if (!booking.listingOwner) {
        return { message: 'Listing owner not found', statusCode: 404 };
      }
      if (booking.status !== 'pending') {
        return { message: 'Booking not pending', statusCode: 404 };
      }
      const owner = await fastify.mongodb.user.findOne({
        uid: booking.listingOwner,
      });
      if (!owner) {
        return { message: 'Listing owner not found', statusCode: 404 };
      }
      if (!owner.stripeAccountId) {
        return { message: 'Listing owner not found', statusCode: 404 };
      }
      const amount = booking.totalPrice;

      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });

      let rateDate = 1;
      if (booking.currency !== client.session.currency) {
        rateDate = await fastify.rates.get(
          `${client.session.currency}-${booking.currency}`,
        );
      }

      const paymentId = generateMostUniqueNumericId(15);
      // let discount = 0;
      // if (booking.promo) {
      //   const promo = await fastify.mongodb.promo.findOne({
      //     code: booking.promo,
      //   });
      //   if (promo) discount = promo.discount;
      // }
      // if (booking.discounts?.length) {
      //   discount = booking.discounts.reduce((a, b) => a + b.discount, 0);
      // }

      const stripeManager =
        stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      let result = {};
      if (stripeMode === 'live') {
        await fastify.mongodb.bookings.updateOne(
          { id: booking.id },
          { $set: { stripeMode: 'live' } },
        );
      } else if (booking.stripeMode !== 'sandbox') {
        await fastify.mongodb.bookings.updateOne(
          { id: booking.id },
          { $set: { stripeMode: 'sandbox' } },
        );
      }
      if (type === 'session') {
        const checkOutSession = await stripeManager.createCheckoutNotStripe({
          customerId:
            stripeMode === 'live'
              ? client.session.stripeLive.stripeId
              : client.session.stripeId,
          email: client.session.email,
          amount,
          discounts: booking.discounts,
          currency: booking.currency,
          bookingId: booking.id,
          useBalance,
          userBalanceUS: user.balance,
          userBalanceCurr: convertAndRound(user.balance, rateDate),
          paymentId,
          paymentReceiveType: owner.payoutInfo.type,
          hostUid: owner.uid,
          guestUid: client.session.uid,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
        });
        result = { checkOutSession };
      } else if (type === 'intent') {
        const paymentSheetData = await stripeManager.createIntent({
          customerId:
            stripeMode === 'live'
              ? client.session.stripeLive.stripeId
              : client.session.stripeId,
          email: client.session.email,
          amount,
          discounts: booking.discounts,
          currency: booking.currency,
          bookingId: booking.id,
          useBalance,
          userBalanceUS: user.balance,
          userBalanceCurr: convertAndRound(user.balance, rateDate),
          paymentId,
          paymentReceiveType: owner.payoutInfo.type,
          hostUid: owner.uid,
          guestUid: client.session.uid,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
        });
        result = { paymentSheetData };
      }
      let rateUSD = 1;
      if (booking.currency !== 'USD') {
        rateUSD = await fastify.rates.get(`${booking.currency}-USD`);
      }
      if (useBalance && user.balance > 0) {
        const amountUSD = convertAndRound(amount, rateUSD);
        let diff = user.balance;
        if (amountUSD < user.balance) {
          diff = amountUSD;
        }
        await fastify.mongodb.user.updateOne(
          { uid: client.session.uid },
          { $inc: { balance: -diff } },
        );
      }
      return result;
    },
    schema: {
      description:
        'Initialize a Stripe payment session for a pending booking. ' +
        'Supports two modes: "session" creates a Stripe Checkout session ' +
        'for web payments, "intent" creates a PaymentIntent for ' +
        'mobile/custom payment flows. Optionally applies user balance as ' +
        'partial payment. Calculates currency conversion and processes ' +
        'discounts.',
      tags: ['Payment'],
      summary: 'Create payment checkout',
      body: {
        type: 'object',
        required: ['bookingId', 'token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          useBalance: { type: 'boolean', default: true },
          stripeMode: {
            type: 'string',
            enum: ['sandbox', 'live'],
            default: 'sandbox',
          },
          bookingId: {
            type: 'string',
            description: 'ID of the booking to pay',
          },
          type: {
            type: 'string',
            enum: ['session', 'intent'],
            default: 'session',
          },
        },
      },
      response: {
        200: {
          description: 'CheckoutSession created',
          type: 'object',
          properties: {
            checkOutSession: {
              type: 'object',
              additionalProperties: true,
            },
            paymentSheetData: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  },
};
