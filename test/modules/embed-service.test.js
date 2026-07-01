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
    inputHeight: 48,
    inactivityHours: 6,
    defaultLanguage: 'german',
    widgetLocation: 'left',
    rounded: true,
    cornerRadius: 20,
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
        launcherBackgroundColor: '#166534',
        inputBackgroundColor: '#f7fff9',
        textColor: '#163025',
        borderColor: '#b8e0c8',
      },
      dark: {
        accentColor: '#86efac',
        accentTextColor: '#0c1f16',
        backgroundColor: '#08120d',
        surfaceColor: '#102018',
        launcherBackgroundColor: '#4ade80',
        inputBackgroundColor: '#163124',
        textColor: '#effff5',
        borderColor: '#24523a',
      },
    },
    ai: {
      enabled: true,
      responseLength: 'medium',
      mood: 'normal',
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
    // The script wraps its own launcher/panel, so the iframe it loads must opt
    // out of the standalone launcher.
    expect(script).toContain('/chat/iframe/chatbot-1?embedded=1&lang=');
  });

  test('iframe embed exposes polished ui controls and uses key widget settings', () => {
    const service = new EmbedService();
    const html = service.renderIframe({
      chatbot: createChatbot(),
      baseUrl: 'https://api.example.com',
    });

    expect(html).toContain(
      '<button id="hideChat" class="icon-button" type="button" aria-label="Hide chat"><img src="',
    );
    expect(html).toContain('Sales Concierge');
    expect(html).toContain('Acme Copilot');
    expect(html).toContain('Request the human');
    expect(html).toContain('Powered by MoMicro');
    expect(html).not.toContain('Active');
    expect(html).not.toContain('End Chat');
    expect(html).toContain('https://cdn.example.com/bubble.png');
    expect(html).toContain('--radius-xl: 20px;');
    expect(html).toContain('--launcher-bg: #166534;');
    expect(html).toContain('--input-bg: #f7fff9;');
    expect(html).toContain('height: var(--input-height, 42px);');
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

  test('iframe enters standalone mode via the standalone flag and animates open/close', () => {
    const service = new EmbedService();
    const html = service.renderIframe({
      chatbot: createChatbot(),
      baseUrl: 'https://api.example.com',
    });

    // The iframe page defaults to the floating standalone widget; only the
    // install script opts out with embedded=1.
    expect(html).toContain(
      `new URLSearchParams(window.location.search).get('embedded') !== '1'`,
    );
    // The collapsed shell animates (opacity/transform) instead of snapping
    // away with display:none.
    expect(html).toContain('body.standalone.widget-hidden .shell {');
    expect(html).toContain(
      'transition: opacity 200ms ease, transform 240ms ease;',
    );
    // The standalone body stays transparent so nothing shows when collapsed.
    expect(html).toContain('body.standalone {\n      background: transparent;');
    // ...and the root is forced transparent with a neutral color-scheme so a
    // dark-mode OS does not paint a black canvas behind the iframe.
    expect(html).toContain(
      `document.documentElement.style.background = 'transparent';`,
    );
    expect(html).toContain(
      `document.documentElement.style.colorScheme = 'normal';`,
    );
  });
});
