'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    ownerUid: { type: String, required: true, index: true },
    premiumStatus: {
      type: String,
      default: 'free',
      enum: ['free', 'active', 'trialing', 'past_due', 'canceled'],
    },
    premiumPlan: { type: String, default: 'free' },
    premiumCurrentPeriodEnd: { type: Date, default: null },
    trialUsedAt: { type: Date, default: null },
    settings: {
      status: {
        type: String,
        default: 'draft',
        enum: ['draft', 'published'],
      },
      title: { type: String, default: 'MoMicro Assist Bot' },
      botName: { type: String, default: 'MoMicro Assist' },
      initialMessage: {
        type: String,
        default: 'Hi. How can I help you today?',
      },
      inputPlaceholder: {
        type: String,
        default: 'Write a message...',
      },
      auth: { type: Boolean, default: false },
      inactivityHours: {
        type: Number,
        default: 3,
        min: 1,
        max: 24,
      },
      defaultLanguage: {
        type: String,
        default: 'english',
      },
      enabledLanguages: {
        type: [String],
        default: ['english'],
      },
      widgetLocation: {
        type: String,
        default: 'right',
        enum: ['left', 'right'],
      },
      rounded: { type: Boolean, default: true },
      domains: { type: [String], default: ['*'] },
      suggestedMessages: { type: [String], default: [] },
      leadsFormTitle: {
        type: String,
        default: 'Leave your contact information',
      },
      leadsForm: {
        type: [
          {
            key: { type: String, required: true },
            label: { type: String, required: true },
            type: { type: String, required: true },
            required: { type: Boolean, default: false },
          },
        ],
        default: [
          {
            key: 'name',
            label: 'Name',
            type: 'text',
            required: true,
          },
          {
            key: 'email',
            label: 'Email',
            type: 'email',
            required: true,
          },
        ],
      },
      brand: {
        logoUrl: { type: String, default: '' },
        logoBackgroundColor: { type: String, default: '' },
        bubbleIconUrl: { type: String, default: '' },
      },
      theme: {
        light: {
          accentColor: { type: String, default: '#099ad9' },
          backgroundColor: { type: String, default: '#fcfff8' },
          surfaceColor: { type: String, default: '#ffffff' },
          textColor: { type: String, default: '#173a55' },
          accentTextColor: { type: String, default: '#fcfff8' },
          borderColor: { type: String, default: '#beebf0' },
        },
        dark: {
          accentColor: { type: String, default: '#5cd7d3' },
          backgroundColor: { type: String, default: '#0b1c2a' },
          surfaceColor: { type: String, default: '#102536' },
          textColor: { type: String, default: '#ecfdff' },
          accentTextColor: { type: String, default: '#0b1c2a' },
          borderColor: { type: String, default: '#214d6f' },
        },
      },
      ai: {
        enabled: { type: Boolean, default: false },
        template: { type: String, default: 'Support assistant' },
        responseLength: {
          type: String,
          default: 'medium',
          enum: ['short', 'medium', 'long'],
        },
        guidelines: {
          type: String,
          default: 'Answer clearly, politely and only using available context.',
        },
      },
      translations: {
        type: Object,
        default: {},
      },
      translationSourceHash: {
        type: String,
        default: '',
      },
    },
  },
  params: { timestamps: true },
  indexes: [],
};
