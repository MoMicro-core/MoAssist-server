'use strict';
const crypto = require('crypto');

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
function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}
const formatDateTime = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');

function generateBookingId(digits = 10) {
  const uuid = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(uuid).digest('hex');
  const num = BigInt('0x' + hash);
  const id = (num % BigInt(10 ** digits)).toString().padStart(digits, '0');
  return id;
}

module.exports = {
  create: {
    type: 'post',
    access: ['guest', 'unregistered'],
    handler: async (props) => {
      const { fastify, client, unitIds = [], listingId, comment } = props;
      const { checkIn, checkOut, guests, withPets, ...userInfo } = props;
      const { promo = null } = props;
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        status: 'active',
      });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid === client.session.uid) {
        return {
          message: 'You cannot book your own listing',
          statusCode: 400,
        };
      }
      if (
        listing.fom === 'multiunit' &&
        !unitIds.every((u) =>
          listing.multiunit.some((unit) => unit.id === u.id),
        )
      ) {
        return { message: 'Unit is not part of this listing', statusCode: 404 };
      }
      const inDate = new Date(checkIn);
      const outDate = new Date(checkOut);

      if (!isValidDate(inDate) || !isValidDate(outDate)) {
        return { message: 'Invalid date', statusCode: 400 };
      }
      const today = new Date();
      const todayDate = new Date(today).setHours(0, 0, 0, 0);
      console.log({ today, inDate });
      if (todayDate > inDate) {
        return { message: 'checkIn must be in the future.', statusCode: 400 };
      }
      if (outDate <= inDate) {
        return { message: 'checkOut must be after checkIn.', statusCode: 400 };
      }

      const totalNights = Math.floor(
        (outDate - inDate) / (1000 * 60 * 60 * 24),
      );
      const dates = [];
      for (let i = 0; i < totalNights; i++) {
        const date = new Date(inDate);
        date.setDate(inDate.getDate() + i);
        dates.push(date.toISOString().slice(0, 10));
      }
      const units = [];
      const bookingId = generateBookingId();

      const translatedListing = await fastify.listings
        .getFull({
          listings: [listing],
          lang: client.session?.language,
          currency: client.session?.currency,
        })
        .then((res) => res[0]);
      if (listing.form === 'multiunit') {
        if (!unitIds.length) {
          return { message: 'No units selected', statusCode: 400 };
        }
        const ids = unitIds.map((u) => u.id);
        const multiunits = await fastify.mongodb.multiunit.find({
          id: { $in: ids },
        });
        for (const unit of multiunits) {
          if (
            totalNights > unit.bookingRequirements.maxNights ||
            totalNights < unit.bookingRequirements.minNights
          ) {
            return { message: 'max or min nights not met', statusCode: 400 };
          }
          const requiredQuantity = unitIds.find(
            (u) => u.id === unit.id,
          ).quantity;
          const requiredServices = unitIds.find(
            (u) => u.id === unit.id,
          ).services;
          const ratePlanId = unitIds.find((u) => u.id === unit.id).ratePlanId;
          let ratePlan = null;
          if (ratePlanId === 'basic') {
            ratePlan = null;
          } else if (unit.ratePlans.includes(ratePlanId)) {
            ratePlan = await fastify.mongodb.ratePlans.findOne({
              id: ratePlanId,
            });
            if (!ratePlan) ratePlan = null;
          }
          const dateRates = [];
          const available = dates.reduce((freeUnits, day) => {
            const date = unit.notAvailable.find((d) => d.date === day);
            if (date?.price) dateRates.push(date);
            const booked = date ? date.units.flatMap((u) => u.numbers) : [];
            const freeToday = unit.units.filter(
              (uNum) => !booked.includes(uNum),
            );
            return freeUnits.filter((uNum) => freeToday.includes(uNum));
          }, unit.units.slice());

          if (available.length < requiredQuantity) {
            return { message: 'Not enough units available', statusCode: 400 };
          }
          for (const day of dates) {
            const date = unit.notAvailable.find((d) => d.date === day);
            const bookingInfo = {
              numbers: available.slice(0, requiredQuantity),
              bookingId,
              source: 'rstays',
            };
            if (date) {
              date.units.push(bookingInfo);
              continue;
            }
            unit.notAvailable.push({
              date: day,
              units: [bookingInfo],
            });
          }
          for (let i = 0; i < requiredQuantity; i++) {
            units.push({ unit, dateRates, requiredServices, ratePlan });
          }
        }
      } else {
        const unit = await fastify.mongodb.unit.findOne({
          id: listing.unit,
          // notAvailable: { $not: { $elemMatch: { date: { $in: dates } } } },
        });
        if (!unit) return { message: 'Unit not found', statusCode: 400 };
        if (unitIds.length > 1) {
          return {
            message: 'Only one unit can be selected for that listing',
            statusCode: 400,
          };
        }
        const requiredServices = unitIds[0].services;
        if (
          totalNights > unit.bookingRequirements.maxNights ||
          totalNights < unit.bookingRequirements.minNights
        ) {
          return { message: 'max or min nights not met', statusCode: 400 };
        }
        const dateRates = [];
        for (const day of dates) {
          const date = unit.notAvailable.find((d) => d.date === day);
          if (date) {
            if (date.price) dateRates.push(date);
            if (date.bookingId) {
              return { message: 'Unit is not available', statusCode: 400 };
            }
            date.bookingId = bookingId;
            date.source = 'rstays';
            continue;
          } else {
            unit.notAvailable.push({
              date: day,
              source: 'rstays',
              bookingId,
            });
          }
        }
        const ratePlanId = unitIds[0].ratePlanId;
        let ratePlan = null;
        if (ratePlanId === 'basic') {
          ratePlan = null;
        } else if (unit.ratePlans.includes(ratePlanId)) {
          ratePlan = await fastify.mongodb.ratePlans.findOne({
            id: ratePlanId,
          });
          if (!ratePlan) ratePlan = null;
        }
        units.push({ unit, dateRates, requiredServices, ratePlan });
      }
      if (guests.adults <= 0) return { message: 'One adult is required' };
      const totalAvailableGuests = units.reduce(
        (acc, unit) => acc + unit.unit.guests,
        0,
      );
      if (
        totalAvailableGuests <
        guests.adults + guests.children + guests.infants
      ) {
        return { message: 'Guests are more than allowed', statusCode: 400 };
      }
      const currency = client.session.currency;
      const allRatePlans = units
        .map((u) => u.ratePlan)
        .filter((r) => r !== null);
      const translatedRatePlans =
        await fastify.localization.getRatePlanTranslation(
          allRatePlans,
          client.session.language,
        );
      for (const tr of translatedRatePlans) {
        const unit = units.find((u) => u.ratePlan?.id === tr.ratePlanId);
        if (unit) unit.ratePlan = tr;
      }

      function calculateOtherPrices(defaultUnit, rate, requiredServices) {
        let totalPrice = 0;
        const servicePrices = [];
        const taxPrices = [];
        let unit;
        if (listing.form === 'multiunit') {
          unit = translatedListing.previewMultiunit.find(
            (u) => u.id === defaultUnit.id,
          );
        } else {
          unit = translatedListing.previewUnit;
        }

        for (const fee of unit.prices.otherFee) {
          const service = requiredServices.find((s) => s.id === fee.id);
          if (!service) continue;
          const quantity = fee?.reuse ? service.quantity || 1 : 1;
          if (fee.price && fee.type === 'fixed') {
            totalPrice += fee.price;
            servicePrices.push({
              name: fee.name,
              price: Math.round(fee.price * quantity),
              type: fee.type,
              id: fee.id,
              quantity,
              unitId: unit.id,
            });
          }
        }
        for (const tax of unit.prices.taxes) {
          if (tax.price && tax.type === 'fixed') {
            totalPrice += tax.price;
            taxPrices.push({
              name: tax.name,
              price: tax.price,
              id: tax.id,
              type: tax.type,
              unitId: unit.id,
            });
          }
        }
        for (const fee of unit.prices.otherFee) {
          if (fee.type === 'fixed') continue;
          const service = requiredServices.find((s) => s.id === fee.id);
          if (!service) continue;
          const quantity = fee?.reuse ? service.quantity || 1 : 1;
          let price = rate * (fee.price / 100);
          price = Math.round(price * quantity);
          servicePrices.push({
            name: fee.name,
            price,
            type: fee.type,
            percentage: fee.price,
            id: fee.id,
            quantity,
            unitId: unit.id,
          });
          totalPrice += price;
        }
        for (const tax of unit.prices.taxes) {
          if (tax.type === 'fixed') continue;
          let price = (rate + totalPrice) * (tax.price / 100);
          price = Math.round(price);
          console.log({ price });
          taxPrices.push({
            name: tax.name,
            price,
            type: tax.type,
            id: tax.id,
            percentage: tax.price,
            unitId: unit.id,
          });
          // totalPrice += price;
        }
        for (const tax of taxPrices) totalPrice += tax.price;

        // if (percentage !== 0) {
        //   const newPrice = (rate + totalPrice) * (percentage / 100);
        //   totalPrice = Math.round(newPrice);
        // }
        return {
          unitTotal: totalPrice,
          unitServies: servicePrices,
          unitTaxes: taxPrices,
        };
      }
      let totalPrice = 0;
      let servicePrices = [];
      let taxPrices = [];
      const bookingUnits = unitIds.map((u) => ({
        id: listing.form === 'multiunit' ? u.id : listing.unit,
        quantity: u.quantity,
        totalPrice: 0,
        servicePrices: u.services,
      }));

      const discounts = [];
      const countDiscount = (sum, discount, type = 'reduce') => {
        const rounded = Math.round(sum * discount);
        return type === 'reduce' ? -rounded : rounded;
      };
      const weekends = await fastify.holidays.isWeekend(dates);

      for (const { unit, dateRates, requiredServices, ratePlan } of units) {
        const convertedUnit = await fastify.localization.convertUnit(
          unit,
          currency,
          dateRates,
        );
        if (ratePlan) {
          unit.prices.rate = ratePlan.prices.rate;
          // unit.prices.currency = ratePlan.prices.currency;
          unit.prices.otherFee = ratePlan.prices.otherFee;
        }
        let diffenertDays = dateRates.length;
        let unitRatesTotal = 0;
        const unitDiscounts = unit.prices.rules;
        const weekendsDeal = unitDiscounts?.weekendsDeal;
        if (weekends.length > 0 && weekendsDeal) {
          for (const date of weekends) {
            if (dateRates.find((d) => d.date === date)) continue;
            diffenertDays++;
            const rate = unit.prices.rate + unit.prices.rate * weekendsDeal;
            totalPrice += rate;
            unitRatesTotal += rate;
            bookingUnits.find((u) => u.id === unit.id).totalPrice += rate;
          }
        }
        const holidays = await fastify.holidays.findHolidayDaysInRange(
          unitDiscounts.holidays,
          dates,
        );

        for (const holiday of holidays) {
          if (dateRates.find((d) => d.date === holiday.date)) continue;
          diffenertDays++;
          let rate = unit.prices.rate;
          const dealProcent = unitDiscounts.holidays.find(
            (h) => h.name === holiday.holiday,
          );
          const deal = Math.round(unit.prices.rate * dealProcent);
          if (holiday.type === 'reduce') rate -= deal;
          else rate += deal;

          totalPrice += rate;
          unitRatesTotal += rate;
          bookingUnits.find((u) => u.id === unit.id).totalPrice += rate;
        }
        for (const date of dateRates) {
          let rate;
          if (date.percentagePrice) {
            rate = unit.prices.rate * date.percentage;
          } else if (!date.price.rate) {
            rate = unit.prices.rate;
          } else {
            rate = date.price.rate;
          }

          totalPrice += rate;
          unitRatesTotal += rate;
          bookingUnits.find((u) => u.id === unit.id).totalPrice += rate;
        }

        const ratePriceTotal = unit.prices.rate * (totalNights - diffenertDays);
        totalPrice += ratePriceTotal;
        unitRatesTotal += ratePriceTotal;
        bookingUnits.find((u) => u.id === unit.id).totalPrice += ratePriceTotal;
        let totalDiscounts = 0;
        const baseDiscount = unitDiscounts?.baseDiscount || 0;
        if (baseDiscount) {
          totalDiscounts += baseDiscount;
          discounts.push({
            name: 'Base Discount',
            price: countDiscount(totalPrice, baseDiscount),
          });
        }
        const lastMinuteDiscount = unitDiscounts?.lastMinuteDiscount || 0;
        if (lastMinuteDiscount) {
          const today = new Date();
          const checkInDate = new Date(checkIn);
          const diffInMs = checkInDate - today;
          const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
          if (diffInDays <= 14) {
            discounts.push({
              name: 'Last Minute Discount',
              price: countDiscount(totalPrice, lastMinuteDiscount),
            });
            totalDiscounts += lastMinuteDiscount;
          }
        }
        const daysDiscount = unitDiscounts.daysDiscounts.filter(
          (d) => d.days <= totalNights,
        );
        const largestDayDiscount = Math.max(...daysDiscount.map((d) => d.days));
        const largestDayDiscountItem = unitDiscounts.daysDiscounts.find(
          (d) => d.days === largestDayDiscount,
        );
        const dayDiscount = largestDayDiscount ? largestDayDiscountItem : null;
        if (dayDiscount) {
          if (dayDiscount.type === 'reduce') {
            totalDiscounts += dayDiscount.discount;
          } else {
            totalDiscounts -= dayDiscount.discount;
          }
          discounts.push({
            name: 'Day Deal',
            price: countDiscount(
              totalPrice,
              dayDiscount.discount,
              dayDiscount.type,
            ),
          });
        }

        const countriesDiscounts = unitDiscounts.countriesDiscounts.find(
          (c) => c.country === userInfo.country,
        );
        if (countriesDiscounts) {
          if (countriesDiscounts.type === 'reduce') {
            totalDiscounts += countriesDiscounts.discount;
          } else {
            totalDiscounts -= countriesDiscounts.discount;
          }
          discounts.push({
            name: 'Country Discount',
            price: countDiscount(
              totalPrice,
              countriesDiscounts.discount,
              countriesDiscounts.type,
            ),
          });
        }
        const guestsDiscounts = unitDiscounts.guestsDiscounts.find(
          (g) => g.guests === guests.adults + guests.children,
        );
        if (guestsDiscounts) {
          if (guestsDiscounts.type === 'reduce') {
            totalDiscounts += guestsDiscounts.discount;
          } else {
            totalDiscounts -= guestsDiscounts.discount;
          }
          discounts.push({
            name: 'Guests Deal',
            price: countDiscount(
              totalPrice,
              guestsDiscounts.discount,
              guestsDiscounts.type,
            ),
          });
        }
        if (totalDiscounts !== 0) {
          const discount = Math.round(unit.prices.rate * totalDiscounts);
          totalPrice -= discount;
          unitRatesTotal -= discount;
          bookingUnits.find((u) => u.id === unit.id).totalPrice -= discount;
        }

        const { unitTotal, unitServies, unitTaxes } = calculateOtherPrices(
          convertedUnit,
          unitRatesTotal,
          requiredServices,
        );
        totalPrice += unitTotal;
        servicePrices = [...servicePrices, ...unitServies];
        taxPrices = [...taxPrices, ...unitTaxes];
      }
      const informal = {
        checkIn: new Date(checkIn + 'T' + units[0].unit.checkInTime),
        checkOut: new Date(checkOut + 'T' + units[0].unit.checkOutTime),
      };

      if (promo) {
        const promoDiscount = await fastify.mongodb.promo.findOne({
          code: promo,
        });
        if (!promoDiscount) return { message: 'No such code', statusCode: 404 };
        discounts.push({
          name: 'Promocode',
          price: -Math.round(totalPrice * (promoDiscount.discount / 100)),
        });
      }

      console.log({ totalPrice });
      totalPrice = Math.round(totalPrice);
      const booking = await fastify.mongodb.bookings.create({
        currency,
        title: translatedListing.title,
        bookingId,
        discounts,
        listingOwner: listing.ownerUid,
        informal,
        // previewImage: listing.previewImages ? listing.previewImages[0] : '',
        user: client.session.uid,
        taxes: taxPrices,
        withPets,
        comment,
        promo,
        services: servicePrices,
        type: listing.form,
        units: bookingUnits,
        listing: listing.id,
        checkIn: dates[0],
        checkOut: dates[dates.length - 1],
        guests,
        totalPrice,
        ...userInfo,
      });
      if (!booking) {
        return { message: 'Error creating booking', statusCode: 500 };
      }

      for (const { unit } of units) await unit.save();

      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      const calendarEvent = {
        DTSTAMP: formatDateTime(new Date()),
        DTSTART: {
          parameters: {
            TZID: user.timezone,
          },
          value: formatDateTime(inDate),
        },
        SUMMARY: 'Apartment Booking: ' + translatedListing.title,
        DESCRIPTION: 'Guests: ' + guests.adults.length,
        UID: crypto.randomBytes(16).toString('hex'),
      };
      await fastify.mongodb.calendars.findOneAndUpdate(
        { owner: client.session.uid },
        { $push: { 'data.VEVENT': calendarEvent } },
      );
      const bookingToReturn = {
        ...booking.toObject(),
        title: translatedListing.title,
        previewImage: listing.previewImages ? listing.previewImages[0] : '',
      };
      const localizedPricesBookings =
        await fastify.localization.translateBookingPrices(
          [bookingToReturn],
          client.session.language,
        );

      const bookingsWithTranslatedUnits = await translateUnits(
        fastify,
        localizedPricesBookings,
        client.session.language,
      );

      return {
        booking: bookingsWithTranslatedUnits[0],
        message: 'Booking created',
      };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Create a new booking',
      description:
        'Create a reservation for a property listing. Calculates total ' +
        'price including nightly rates, services, taxes, and applicable ' +
        'discounts (promo codes, length-of-stay discounts, last-minute ' +
        'deals). Validates availability, guest limits, and date ' +
        'requirements. Blocks the reserved dates and adds the booking ' +
        'to the guest calendar. Requires guest contact information.',
      body: {
        type: 'object',
        required: [
          'token',
          'listingId',
          'checkIn',
          'checkOut',
          'guests',
          'phone',
          'country',
          'email',
          'lastName',
          'firstName',
        ],
        properties: {
          token: { type: 'string', description: 'Session token' },
          unitIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', default: 'unitId' },
                quantity: { type: 'number', default: 1 },
                ratePlanId: { type: 'string', default: 'basic' },
                services: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', default: 'serviceId' },
                      quantity: { type: 'number', default: 1 },
                    },
                  },
                },
              },
            },
            minItems: 1,
          },
          withPets: { type: 'boolean', default: false },
          comment: { type: 'string', default: '' },
          listingId: { type: 'string', default: 'ListinId' },
          phone: { type: 'string', default: 'Phone number' },
          country: { type: 'string', default: 'Country' },
          email: { type: 'string', description: 'Email' },
          lastName: { type: 'string', description: 'Last name' },
          firstName: { type: 'string', description: 'First name' },
          promo: { type: 'string', default: '' },
          checkIn: {
            type: 'string',
            format: 'date',
            description: 'Check-in date (YYYY-MM-DD)',
          },
          checkOut: {
            type: 'string',
            format: 'date',
            description: 'Check-out date (YYYY-MM-DD)',
          },
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
};
