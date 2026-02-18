'use strict';

const mongoose = require('mongoose');
const config = require('../config/environment.js');

module.exports = {
  properties: {
    uid: { type: String, required: true, unique: true },
    role: { type: String, required: true },
    email: {
      type: String,
      default: '',
      // required: true,
      // unique: true,
      trim: true,
    },
    status: { type: String, default: 'active', enum: ['active', 'blocked'] },
    verified: { type: Boolean, default: false },
    referrals: [String], // user ids
    invitedBy: String,

   

    stripeId: { type: String, default: '' },
    stripeAccountId: { type: String, default: '' },
    stripeLive: {
      stripeAccountId: { type: String, default: '' },
      stripeId: { type: String, default: '' },
    },
    name: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    
    language: {
      type: String,
      trim: true,
      default: 'english',
      enum: config.languages,
    },
    currency: {
      type: String,
      trim: true,
      default: 'USD',
    },
    
  },
  params: { timestamps: true },
};
