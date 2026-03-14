'use strict';

module.exports = {
  properties: {
    id: { type: String, required: true, unique: true },
    ownerUid: { type: String, required: true, index: true },
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
        bubbleIconUrl: { type: String, default: '' },
      },
      theme: {
        light: {
          accentColor: { type: String, default: '#0f766e' },
          backgroundColor: { type: String, default: '#f8fafc' },
          surfaceColor: { type: String, default: '#ffffff' },
          textColor: { type: String, default: '#0f172a' },
          accentTextColor: { type: String, default: '#ffffff' },
          borderColor: { type: String, default: '#cbd5e1' },
        },
        dark: {
          accentColor: { type: String, default: '#14b8a6' },
          backgroundColor: { type: String, default: '#0f172a' },
          surfaceColor: { type: String, default: '#111827' },
          textColor: { type: String, default: '#e5e7eb' },
          accentTextColor: { type: String, default: '#042f2e' },
          borderColor: { type: String, default: '#1f2937' },
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
    },
  },
  params: { timestamps: true },
  indexes: [[{ id: 1 }, { unique: true }], [{ ownerUid: 1 }]],
};
