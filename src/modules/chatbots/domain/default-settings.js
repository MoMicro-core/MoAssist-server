'use strict';

const createDefaultChatbotSettings = () => ({
  status: 'draft',
  title: 'MoMicro Assist Bot',
  botName: 'MoMicro Assist',
  initialMessage: 'Hi. How can I help you today?',
  inputPlaceholder: 'Write a message...',
  widgetLocation: 'right',
  rounded: true,
  domains: ['*'],
  suggestedMessages: [],
  leadsFormTitle: 'Leave your contact information',
  leadsForm: [
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
  brand: {
    logoUrl: '',
    bubbleIconUrl: '',
  },
  theme: {
    light: {
      accentColor: '#0f766e',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      textColor: '#0f172a',
      accentTextColor: '#ffffff',
      borderColor: '#cbd5e1',
    },
    dark: {
      accentColor: '#14b8a6',
      backgroundColor: '#0f172a',
      surfaceColor: '#111827',
      textColor: '#e5e7eb',
      accentTextColor: '#042f2e',
      borderColor: '#1f2937',
    },
  },
  ai: {
    enabled: false,
    template: 'Support assistant',
    responseLength: 'medium',
    guidelines: 'Answer clearly, politely and only using available context.',
  },
});

module.exports = { createDefaultChatbotSettings };
