'use strict';

const createDefaultChatbotSettings = () => ({
  status: 'draft',
  title: 'MoMicro Assist Bot',
  botName: 'MoMicro Assist',
  initialMessage: 'Hi. How can I help you today?',
  inputPlaceholder: 'Write a message...',
  inputHeight: 42,
  auth: false,
  inactivityHours: 3,
  defaultLanguage: 'english',
  enabledLanguages: ['english'],
  widgetLocation: 'right',
  rounded: true,
  cornerRadius: 24,
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
    logoBackgroundColor: '',
    bubbleIconUrl: '',
  },
  theme: {
    light: {
      accentColor: '#099ad9',
      backgroundColor: '#fcfff8',
      surfaceColor: '#ffffff',
      launcherBackgroundColor: '#099ad9',
      inputBackgroundColor: '#ffffff',
      textColor: '#173a55',
      accentTextColor: '#fcfff8',
      borderColor: '#beebf0',
    },
    dark: {
      accentColor: '#5cd7d3',
      backgroundColor: '#0b1c2a',
      surfaceColor: '#102536',
      launcherBackgroundColor: '#5cd7d3',
      inputBackgroundColor: '#102536',
      textColor: '#ecfdff',
      accentTextColor: '#0b1c2a',
      borderColor: '#214d6f',
    },
  },
  ai: {
    enabled: false,
    template: 'Support assistant',
    responseLength: 'medium',
    guidelines: 'Answer clearly, politely and only using available context.',
  },
  translations: {},
  translationSourceHash: '',
});

module.exports = { createDefaultChatbotSettings };
