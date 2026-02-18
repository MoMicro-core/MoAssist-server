'use strict';

const translateUnits = async (fastify, bookings, lang) => {
  const multiunitIds = bookings
    .filter((b) => b.type === 'multiunit')
    .flatMap((b) => b.units.map((u) => u.id));

  const translationsMultiunits =
    await fastify.mongodb.translationMultiunit.aggregate([
      { $match: { id: { $in: multiunitIds } } },
      {
        $project: {
          id: 1,
          languages: {
            $filter: {
              input: '$languages',
              as: 'l',
              cond: {
                $eq: ['$$l.name', lang || '$baselang'],
              },
            },
          },
        },
      },
    ]);
  for (const booking of bookings) {
    if (booking.type !== 'multiunit') continue;
    for (const unit of booking.units) {
      const translation = translationsMultiunits.find((t) => t.id === unit.id);
      console.log({ translation });
      if (translation) {
        unit.title = translation.languages[0].translation.title;
        console.log({ unitTitle: unit.title });
      }
    }
  }

  return bookings;
};

module.exports = {
  setRead: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, bookingId }) => {
      const booking = await fastify.mongodb.bookings.findOne({ id: bookingId });
      if (!booking) return { message: 'Booking not found', statusCode: 404 };
      const listing = await fastify.mongodb.listings.findOne({
        id: booking.listing,
      });
      if (!listing) {
        return { message: 'Listing to booking not found', statusCode: 404 };
      }
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid)
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      booking.read = true;
      await booking.save();
      return { booking, message: 'Booking updated' };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Mark a booking as read',
      description:
        'Mark a booking notification as read by the host. Only the ' +
        'listing owner or managers can mark bookings as read. Used to ' +
        'track which bookings have been reviewed.',
      body: {
        type: 'object',
        required: ['token', 'bookingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          bookingId: { type: 'string', description: 'Booking MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            booking: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  get: {
    type: 'post',
    access: ['guest', 'unregistered'],
    handler: async ({ fastify, client }) => {
      const bookings = await fastify.mongodb.bookings
        .find({
          user: client.session.uid,
        })
        .lean();
      if (!bookings) return { message: 'Bookings not found', statusCode: 404 };
      const listingsIds = bookings.map((booking) => booking.listing);
      const previewImages = await fastify.mongodb.listings
        .find(
          {
            id: { $in: listingsIds },
          },
          {
            id: 1,
            previewImage: { $arrayElemAt: ['$previewImages', 0] },
          },
        )
        .lean();

      const listingTitles = await fastify.mongodb.translationListing.aggregate([
        {
          $match: {
            id: { $in: listingsIds },
          },
        },
        {
          $project: {
            id: 1,
            language: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: '$languages',
                    as: 'lang',
                    cond: { $eq: ['$$lang.name', client.session.language] },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $project: {
            id: 1,
            'language.translation.title': 1,
          },
        },
      ]);

      const localizedPricesBookings =
        await fastify.localization.translateBookingPrices(
          bookings,
          client.session.language,
        );

      for (const booking of localizedPricesBookings) {
        const listing = previewImages.find((l) => l.id === booking.listing);
        const title = listingTitles.find((l) => l.id === booking.listing);
        booking.title = title?.language?.translation?.title;
        booking.previewImage = listing?.previewImage;
      }

      const bookingsWithTranslatedUnits = await translateUnits(
        fastify,
        localizedPricesBookings,
        client.session.language,
      );

      return { bookings: bookingsWithTranslatedUnits };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Get user bookings',
      description:
        'Retrieve all bookings made by the authenticated user. Returns ' +
        'booking details with localized prices, listing preview images, ' +
        'and translated titles based on user language preference.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            bookings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getForListing: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, listingId }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid)
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      const bookings = await fastify.mongodb.bookings
        .find({
          listing: listingId,
        })
        .lean();
      if (!bookings) return { message: 'Bookings not found', statusCode: 404 };
      const listingsIds = bookings.map((booking) => booking.listing);
      const previewImages = await fastify.mongodb.listings
        .find(
          {
            id: { $in: listingsIds },
          },
          {
            id: 1,
            previewImage: { $arrayElemAt: ['$previewImages', 0] },
          },
        )
        .lean();
      const listingTitles = await fastify.mongodb.translationListing.aggregate([
        {
          $match: {
            id: { $in: listingsIds },
          },
        },
        {
          $project: {
            id: 1,
            language: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: '$languages',
                    as: 'lang',
                    cond: { $eq: ['$$lang.name', client.session.language] },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $project: {
            id: 1,
            'language.translation.title': 1,
          },
        },
      ]);
      const usersIds = bookings.map((booking) => booking.user);

      const users = await fastify.mongodb.user.aggregate([
        { $match: { uid: { $in: usersIds } } },
        {
          $project: {
            uid: 1,
            name: 1,
            lastName: 1,
            image: 1,
            email: 1,
            responseRate: 1,
            permissions: 1,
            description: {
              $filter: {
                input: '$description',
                as: 'desc',
                cond: {
                  $eq: [
                    '$$desc.language',
                    client.session.language || 'english',
                  ],
                },
              },
            },
          },
        },
      ]);

      const localizedPricesBookings =
        await fastify.localization.translateBookingPrices(
          bookings,
          client.session.language,
        );

      for (const booking of localizedPricesBookings) {
        const listing = previewImages.find((l) => l.id === booking.listing);
        const title = listingTitles.find((l) => l.id === booking.listing);
        const user = users.find((u) => u.uid === booking.user);
        booking.userPreview = user;
        booking.title = title?.language?.translation?.title;
        booking.previewImage = listing?.previewImage;
        const unitIds = booking.units.map((u) => u.id);
        if (booking.type === 'multiunit') {
          const units = await fastify.mongodb.translationMultiunit.aggregate([
            {
              $match: {
                id: { $in: unitIds },
              },
            },
            {
              $project: {
                id: 1,
                language: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$languages',
                        as: 'lang',
                        cond: { $eq: ['$$lang.name', client.session.language] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
            {
              $project: {
                id: 1,
                'language.translation.title': 1,
                'language.translation.description': 1,
              },
            },
          ]);
          booking.unitsPreview = units;
        }
      }
      const bookingsWithTranslatedUnits = await translateUnits(
        fastify,
        localizedPricesBookings,
        client.session.language,
      );
      return { bookings: bookingsWithTranslatedUnits };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Get bookings for listing',
      description:
        'Retrieve all bookings for a specific property listing. Returns ' +
        'booking details with guest information, localized prices, ' +
        'preview images, and unit details. Only accessible by listing ' +
        'owner or managers.',
      body: {
        type: 'object',
        required: ['token', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            bookings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  updateGuests: {
    type: 'post',
    access: ['guest', 'host'],
    handler: async ({ fastify, client, id, guests }) => {
      const booking = await fastify.mongodb.bookings
        .findOne({ id })
        .select('user listingOwner id');
      if (!booking) return { message: 'Booking not found', statusCode: 404 };
      if (
        booking.user !== client.session.uid &&
        booking.listingOwner !== client.session.uid
      ) {
        const listingManagers = await fastify.mongodb.listings
          .findOne({ id: booking.listing })
          .select('managers ownerUid');
        if (!listingManagers.managers.includes(client.session.uid)) {
          return { message: 'No permission', statusCode: 403 };
        }
      }
      await fastify.mongodb.bookings.findOneAndUpdate(
        { id },
        { $set: { guests } },
      );
      return { message: 'Booking updated' };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Update booking guests',
      description:
        'Modify the guest count for an existing booking. Updates the ' +
        'number of adults, children, and infants. Only the booking owner ' +
        'can update their reservation.',
      body: {
        type: 'object',
        required: ['token', 'id', 'guests'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Booking MongoDB id' },
          guests: {
            type: 'object',
            required: ['adults', 'children', 'infants'],
            properties: {
              adults: {
                type: 'number',
                description: 'Number of adults',
                minimum: 1,
              },
              children: {
                type: 'number',
                description: 'Number of children',
                minimum: 0,
              },
              infants: {
                type: 'number',
                description: 'Number of infants',
                minimum: 0,
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            booking: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getUnreaded: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client }) => {
      const count = await fastify.mongodb.bookings.countDocuments({
        user: client.session.uid,
        read: false,
      });
      return { count };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Get unread booking count',
      description:
        'Get the count of unread bookings for the authenticated host. ' +
        'Useful for displaying notification badges indicating new ' +
        'reservations that need attention.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            count: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  reviewStatus: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, id, status }) => {
      const booking = await fastify.mongodb.bookings.findOne({
        id,
        status: 'paid',
      });
      if (!booking) return { message: 'Booking not found', statusCode: 404 };
      const intentId = booking.paymentInfo?.paymentIntentId;
      if (!intentId) {
        return { message: 'Payment not found', statusCode: 404 };
      }
      const listing = await fastify.mongodb.listings
        .findOne({
          ownerUid: client.session.uid,
          id: booking.listing,
        })
        .lean();
      if (!listing) return { message: 'Not yours', statusCode: 404 };
      booking.status = status;
      await booking.save();
      const stripeManager =
        booking.stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      if (status === 'confirmed') {
        const intent = await stripeManager.capturePayment(intentId);
        const charge = intent.latest_charge;
        const balanceTx =
          await stripeManager.stripe.balanceTransactions.retrieve(
            charge.balance_transaction,
          );

        const allFees = balanceTx.fee_details.map((fee) => ({
          name: fee.type, // stripe_fee, tax etc.
          price: fee.amount / 100,
        }));
        const stripeFeesPrice = allFees.reduce(
          (acc, fee) => acc + fee.price,
          0,
        );
        await fastify.mongodb.payments.updateOne(
          {
            bookingId: id,
          },
          {
            $set: {
              stripeFee: allFees,
            },
            $inc: {
              payoutAmount: -stripeFeesPrice,
            },
          },
        );

        if (booking.email) {
          const checkIn = new Date(booking.informal.checkIn);
          checkIn.setHours(0, 0, 0, 0);
          const checkOut = new Date(booking.informal.checkOut);
          checkOut.setHours(0, 0, 0, 0);
          const nights = Math.floor(
            (checkOut - checkIn) / (1000 * 60 * 60 * 24),
          );

          const user = await fastify.mongodb.user
            .findOne({
              uid: booking.listingOwner,
            })
            .select('name lastName phoneNumber');
          // eslint-disable-next-line max-len
          const html = `<p> We are pleased to confirm that your booking has been successfully completed. </p> <p> <strong>Booking Details</strong><br /> Check-in date: ${booking.informal.checkIn}<br /> Check-out date: ${booking.informal.checkOut}<br /> Total nights: ${nights} </p> <p> <strong>Listing Address</strong><br /> ${listing.location.street}<br /> ${listing.location.city}, ${listing.location.postalCode}<br /> ${listing.location.area.name}, ${listing.location.country}<br /> ${listing.location.googleMapsUrl} <a href="${listing.location.googleMapsUrl}">View on Google Maps</a> </p> <p> <strong>Host Contact Information</strong><br /> Phone number: ${user.phoneNumber} - ${user.name} ${user.lastName} </p> <p> If you have any questions regarding your stay or need assistance before your arrival, please contact the host directly using the phone number above. </p> <p> We wish you a pleasant stay and thank you for your booking. </p> <p> Kind regards,<br /> The RStays Team </p> </td> `;
          try {
            await fastify.email.sendMail({
              to: booking.email,
              subject: 'Booking was confirmed',
              text: html,
            });
          } catch (err) {
            fastify.log.error({ err }, '❌ Failed to send email');
          }
        }
        return { intent };
      }
      const intent = await stripeManager.declinePayment(intentId);
      return { intent };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Confirm or decline booking',
      description:
        'Host action to confirm or decline a paid booking. If confirmed, ' +
        'captures the payment, calculates Stripe fees, and sends ' +
        'confirmation email with property address and host contact. If ' +
        'declined, refunds the payment. Only listing owner can review ' +
        'bookings.',
      body: {
        type: 'object',
        required: ['token', 'id', 'status'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Booking MongoDB id' },
          status: {
            type: 'string',
            description: 'Booking status',
            enum: ['confirmed', 'declined'],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            booking: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
            intent: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  cancel: {
    type: 'post',
    access: ['guest', 'unregistered'],
    handler: async ({ fastify, client, id }) => {
      const booking = await fastify.mongodb.bookings.findOne({
        id,
        user: client.session.uid,
      });
      if (!booking) return { message: 'Booking not found', statusCode: 404 };
      if (booking.status === 'cancelled') {
        return { message: 'Booking already cancelled', statusCode: 404 };
      }
      let cancelationData;
      let percentage;
      const unitIds = booking.units.map((u) => u.id);
      let units;
      if (booking.type === 'unit') {
        units = await fastify.mongodb.unit
          .find({ id: { $in: unitIds } })
          .select('cancellation notAvailable id');
      } else {
        units = await fastify.mongodb.multiunit
          .find({ id: { $in: unitIds } })
          .select('cancellation notAvailable id');
      }
      const start = new Date(booking.checkIn);
      const end = new Date(booking.checkOut);
      const dates = [];
      const daysCount = Math.round((end - start) / 86400000); // ms in a day
      for (let i = 0; i <= daysCount; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const formatted = date.toISOString().slice(0, 10);
        dates.push(formatted);
      }
      if (daysCount < 0) {
        return {
          message: 'Already gone',
          statusCode: 400,
        };
      }
      console.log(dates);
      for (const unit of units) {
        if (booking.type === 'unit') {
          const cleanedNotAvailable = unit.notAvailable.filter((d) => {
            if (!dates.includes(d.date)) return true;
            return false;
          });
          await fastify.mongodb.unit.updateOne(
            { id: unit.id },
            { $set: { notAvailable: cleanedNotAvailable } },
          );
        } else {
          const count = booking.units.find((u) => u.id === unit.id).quantity;
          for (const day of dates) {
            const dateEntry = unit.notAvailable.find((d) => d.date === day);
            if (!dateEntry) continue;

            for (const u of dateEntry.units) {
              if (u.bookingId === 'Blocked') {
                u.numbers.splice(-count);
              }
            }

            dateEntry.units = dateEntry.units.filter(
              (u) => u.numbers.length > 0,
            );
          }

          unit.notAvailable = unit.notAvailable.filter(
            (d) => d.units.length > 0,
          );
          await fastify.mongodb.multiunit.updateOne(
            { id: unit.id },
            { $set: { notAvailable: unit.notAvailable } },
          );
        }
        if (!unit.cancellation) continue;
        if (!cancelationData || cancelationData < unit.cancellation.days) {
          cancelationData = unit.cancellation.days;
        }
        if (!percentage || percentage > unit.cancellation.procent) {
          percentage = unit.cancellation.procent;
        }
      }
      const payment = await fastify.mongodb.payments.findOne({
        bookingId: booking.id,
      });
      if (!payment) {
        booking.status = 'cancelled';
        await booking.save();
        return { message: 'Booking cancelled without payment' };
      }
      if (!cancelationData) cancelationData = 7;
      if (!percentage) percentage = 1;
      const today = new Date();
      const checkInDate = new Date(booking.checkIn);
      const diffInMs = checkInDate - today;
      const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
      console.log({ diffInDays, cancelationData, percentage });
      const stripeManager =
        booking.stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      if (diffInDays < cancelationData && booking.status === 'confirmed') {
        payment.amountAfterCancelling =
          payment.payoutAmount - payment.payoutAmount * percentage;
        // booking.paymentInfo.amount * (1 - percentage);
        await stripeManager.refundBooking(
          booking.paymentInfo.paymentIntentId,
          percentage,
        );
      } else {
        payment.amountAfterCancelling = 0;
        await stripeManager.refundBooking(booking.paymentInfo.paymentIntentId);
      }
      // payment.amountAfterCancelling =
      //   booking.totalPrice - payment.amountAfterCancelling * percentage;
      payment.status = 'cancelled';
      booking.status = 'cancelled';
      if (payment.useBalance) {
        await fastify.mongodb.user.findOneAndUpdate(
          { uid: client.session.uid },
          { $inc: { balance: payment.balance } },
        );
      }
      await payment.save();
      await booking.save();
      return { message: 'Booking cancelled' };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Cancel a booking',
      description:
        'Cancel an existing booking. Applies cancellation policy based ' +
        'on unit settings - refund percentage depends on days until ' +
        'check-in. Frees up blocked dates, processes refund through ' +
        'Stripe, and restores any user balance used. Only the booking ' +
        'guest can cancel.',
      body: {
        type: 'object',
        required: ['token', 'id'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Booking MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            booking: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
