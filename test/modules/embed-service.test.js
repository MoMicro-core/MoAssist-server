'use strict';

const {
  EmbedService,
} = require('../../src/modules/widget/application/embed-service');

const createChatbot = (overrides = {}) => ({
  id: 'chatbot-1',
  settings: {
    title: 'Sales Concierge',
    botName: 'Acme Copilot',
    initialMessage: 'Ask anything about plans, onboarding, or support.',
    inputPlaceholder: 'Write your question...',
    auth: true,
    inactivityHours: 6,
    defaultLanguage: 'german',
    widgetLocation: 'left',
    rounded: false,
    suggestedMessages: ['Show me pricing', 'Talk to support'],
    leadsFormTitle: 'Share your contact details',
    leadsForm: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
    brand: {
      logoUrl: 'https://cdn.example.com/logo.png',
      logoBackgroundColor: '#e9fff8',
      bubbleIconUrl: 'https://cdn.example.com/bubble.png',
    },
    theme: {
      light: {
        accentColor: '#15803d',
        accentTextColor: '#ffffff',
        backgroundColor: '#f4fff8',
        surfaceColor: '#ffffff',
        textColor: '#163025',
        borderColor: '#b8e0c8',
      },
      dark: {
        accentColor: '#86efac',
        accentTextColor: '#0c1f16',
        backgroundColor: '#08120d',
        surfaceColor: '#102018',
        textColor: '#effff5',
        borderColor: '#24523a',
      },
    },
    ai: {
      enabled: true,
      template: 'Support assistant',
      responseLength: 'medium',
      guidelines: 'Answer clearly.',
    },
    ...overrides,
  },
});

describe('embed service', () => {
  test('script embed uses launcher settings and listens for hide/open actions', () => {
    const service = new EmbedService();
    const script = service.renderScript({
      chatbot: createChatbot(),
      baseUrl: 'https://api.example.com',
    });

    expect(script).toContain(`wrapper.style.left = '18px';`);
    expect(script).toContain('https://cdn.example.com/bubble.png');
    expect(script).toContain(`data.action === 'hide'`);
    expect(script).toContain(`data.action === 'open'`);
    expect(script).toContain(`notifyIframe(isOpen ? 'open' : 'hide')`);
  });

  test('iframe embed exposes polished ui controls and uses key widget settings', () => {
    const service = new EmbedService();
    const html = service.renderIframe({
      chatbot: createChatbot(),
      baseUrl: 'https://api.example.com',
      authClient: 'website-user-7',
    });

    expect(html).toContain(
      '<button id="hideChat" class="icon-button" type="button">Hide</button>',
    );
    expect(html).toContain('End Chat');
    expect(html).toContain('Sales Concierge');
    expect(html).toContain('Acme Copilot');
    expect(html).toContain('AI replies');
    expect(html).toContain('Secure session');
    expect(html).toContain('German');
    expect(html).toContain('6h inactivity window');
    expect(html).toContain('https://cdn.example.com/bubble.png');
    expect(html).toContain('--radius-xl: 20px;');
  });

  test('iframe preview renders the live widget in preview mode without relying on the normal boot flow', () => {
    const service = new EmbedService();
    const html = service.renderIframe({
      chatbot: createChatbot({ widgetLocation: 'top-right' }),
      baseUrl: 'https://api.example.com',
      preview: {
        enabled: true,
        mode: 'dark',
        selectedPart: 'composer',
      },
    });

    expect(html).toContain('<body class="preview preview-dark">');
    expect(html).toContain('<div class="preview-stage top-right">');
    expect(html).toContain('data-preview-part="composer"');
    expect(html).toContain(`type: 'momicro-assist-preview'`);
    expect(html).toContain('"selectedPart":"composer"');
    expect(html).toContain('"conversation"');
  });
});
