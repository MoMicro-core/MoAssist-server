'use strict';
const config = require('../../config/environment.js');
const countriesCodes = require('i18n-iso-countries');
const countries = Object.keys(countriesCodes.getAlpha2Codes());

module.exports = {
  login: {
    type: 'post',
    access: ['public'],
    handler: async (
      { fastify, firebaseToken, client, fcmToken = null, request = null },
      socket = null,
    ) => {
      const decodedToken = await fastify.firebase
        .auth()
        .verifyIdToken(firebaseToken);
      const user = await fastify.mongodb.user.findOne({
        uid: decodedToken.uid,
      });
      if (!user) return { message: 'User not found' };
      const token = await client.initializeSession({
        request,
        uid: decodedToken.uid,
        data: {
          email: user.email,
          verified: user.verified,
          language: user.language,
          currency: user.currency,
          uid: decodedToken.uid,
          name: user.name + ' ' + user.lastName,
          role: user.role,
          stripeLive: user.stripeLive,
          stripeId: user.stripeId,
          stripeAccountId: user.stripeAccountId,
          fcmToken,
        },
        socket,
      });
      if (user.lastLogins.length >= 10) {
        user.lastLogins.shift();
      }
      user.lastLogins.push({ date: new Date() });
      await user.save();
      return { token };
    },
    schema: {
      summary: 'Authenticate with Firebase',
      description:
        'Authenticates a user using a Firebase ID token. Returns a ' +
        'session token for subsequent API requests. Tracks login ' +
        'history and supports optional FCM token for push notifications.',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['firebaseToken'],
        properties: {
          firebaseToken: { type: 'string', description: 'Firebase ID token' },
          fcmToken: {
            type: 'string',
            description: 'Firebase Cloud Messaging token',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Session token if login successful',
            },
            message: { type: 'string', description: 'Error message' },
          },
        },
      },
    },
  },

  'register/:referralId?': {
    type: 'post',
    access: ['public'],
    handler: async (
      { fastify, request, firebaseToken, client, fcmToken = null, ...userData },
      socket = null,
    ) => {
      const decodedToken = await fastify.firebase
        .auth()
        .verifyIdToken(firebaseToken);
      const uid = decodedToken.uid;
      const firebaseName = decodedToken.name || '';
      const { name, lastName, country, timeZone } = userData;
      const { phoneNumber, language = 'english', currency } = userData;
      const { description, languagesSpoken = [] } = userData;
      const user = await fastify.mongodb.user.findOne({ uid });
      if (user) return { message: 'User already exists', statusCode: 500 };
      const permissions = [];
      if (decodedToken.email) {
        const invitions = await fastify.mongodb.invitations.find({
          invitedEmail: decodedToken.email,
        });
        if (invitions) {
          const invitionsIds = [];
          for (const invition of invitions) {
            await fastify.mongodb.listings.findOneAndUpdate(
              { id: invition.listing },
              { $push: { managers: uid } },
            );
            permissions.push({
              role: 'co-host',
              listingId: invition.listing,
            });
          }
          await fastify.mongodb.invitations.deleteMany({
            id: { $in: invitionsIds },
          });
        }
      }
      let countryCode = country;
      if (!country) {
        countryCode = await fastify.geo.getCountry(request);
      }
      const descriptions = [];
      const descriptionText = description || 'Here for your comfort';
      const translationDescription = await fastify.openai.translate({
        data: {
          description: descriptionText,
        },
        languages: fastify.config.environment.languages.filter(
          (l) => l !== (description ? client.session.language : 'english'),
        ),
      });
      descriptions.push({
        content: descriptionText,
        language: description ? client.session.language : 'english',
      });
      for (const language of translationDescription.languages) {
        descriptions.push({
          content: language.translation.description,
          language: language.name,
        });
      }
      let referralUser = null;
      if (request?.params?.referralId) {
        const { referralId } = request.params;
        if (referralId) {
          referralUser = await fastify.mongodb.user.findOne({
            uid: referralId,
          });
          if (referralUser) {
            referralUser.referrals.push(uid);
            await referralUser.save();
          }
        }
      }
      let stripeId = '';
      let stripeAccountId = '';
      let stripeIdLive = '';
      let stripeAccountIdLive = '';
      if (decodedToken.email) {
        const { customer, account } =
          await fastify.stripeManager.createCustomer({
            country: countryCode,
            uid,
            email: decodedToken.email,
          });
        stripeId = customer.id;
        stripeAccountId = account.id;

        const { customer: cusLive, account: accLive } =
          await fastify.stripeManagerLive.createCustomer({
            country: countryCode,
            uid,
            email: decodedToken.email,
          });
        stripeIdLive = cusLive.id;
        stripeAccountIdLive = accLive.id;
      }
      const newUser = await fastify.mongodb.user.create({
        permissions,
        language,
        description: descriptions,
        currency,
        invitedBy: referralUser ? request.params.referralId : '',
        uid,
        email: decodedToken.email || '',
        role: 'user',
        name: name || firebaseName || '',
        lastName: lastName || '',
        country: countryCode || '',
        stripeAccountId,
        phoneNumber: phoneNumber || '',
        timezone: timeZone || '',
        stripeId,
        stripeLive: {
          stripeAccountId: stripeAccountIdLive,
          stripeId: stripeIdLive,
        },
        languagesSpoken,
      });
      const calendar = await fastify.mongodb.calendars.create({
        owner: uid,
        data: {
          VTIMEZONE: {
            TZID: timeZone,
          },
          VEVENT: [],
        },
      });
      const token = await client.initializeSession({
        request,
        uid: decodedToken.uid,
        data: {
          email: decodedToken.email || '',
          uid,
          verified: false,
          language: newUser.language,
          currency: newUser.currency,
          name: newUser.name + ' ' + newUser.lastName,
          role: newUser.role,
          stripeId,
          stripeLive: {
            stripeAccountId: stripeAccountIdLive,
            stripeId: stripeIdLive,
          },

          stripeAccountId,
          fcmToken,
        },
        socket,
      });
      return { token, calendar: calendar.id };
    },
    schema: {
      summary: 'Register new user',
      description:
        'Registers a new user account using Firebase authentication. ' +
        'Creates Stripe customer and connected accounts for payment ' +
        'processing. Supports optional referral tracking and ' +
        'auto-translates user profile to multiple languages.',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['firebaseToken'],
        properties: {
          firebaseToken: { type: 'string', description: 'Firebase ID token' },
          fcmToken: {
            type: 'string',
            description: 'Firebase Cloud Messaging token',
          },
          name: { type: 'string' },
          lastName: { type: 'string' },
          description: { type: 'string' },
          country: { type: 'string', enum: countries.concat('') },
          timeZone: { type: 'string' },
          phoneNumber: { type: 'string' },
          languagesSpoken: { type: 'array', items: { type: 'string' } },
          language: {
            type: 'string',
            enum: config.languages,
          },
          currency: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Session token after registration',
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  logout: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ client }) => {
      await client.destroy();
      return { message: 'session has been closed' };
    },
    schema: {
      summary: 'End user session',
      description:
        'Terminates the current user session and invalidates the ' +
        'session token. Available to all authenticated users including ' +
        'unregistered accounts.',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token for logout' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'session has been closed' },
          },
        },
      },
    },
  },
};
