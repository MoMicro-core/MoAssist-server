'use strict';

const { toWebsocketUrl } = require('../../../shared/application/url');

const escapeScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const DEFAULT_COLOR_FALLBACK = 'rgba(15, 23, 42, 0.12)';

const withAlpha = (
  value = '',
  alpha = 1,
  fallback = DEFAULT_COLOR_FALLBACK,
) => {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim();
  if (!normalized) return fallback;

  const longHex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const int = Number.parseInt(longHex[1], 16);
    const red = (int >> 16) & 255;
    const green = (int >> 8) & 255;
    const blue = int & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [red, green, blue] = shortHex[1]
      .split('')
      .map((part) => Number.parseInt(part + part, 16));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgb = normalized.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
  );
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }

  return fallback;
};

const formatLanguageLabel = (value = '') =>
  String(value || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'English';

const createPreviewConversation = (chatbot) => {
  const firstSuggestion =
    chatbot.settings.suggestedMessages?.find(Boolean) ||
    'I need help choosing the right option.';
  const assistantReply = chatbot.settings.ai.enabled
    ? 'Absolutely. I can answer questions about products, delivery, pricing, and returns.'
    : 'A teammate will reply here with product, delivery, or order help.';

  return {
    status: 'active',
    messages: [
      {
        id: 'preview-assistant-1',
        authorType: 'assistant',
        author: chatbot.settings.ai.enabled ? 'ai' : 'human',
        content:
          chatbot.settings.initialMessage || 'Hi. How can I help you today?',
        read: true,
        readByOwner: true,
        readByVisitor: true,
      },
      {
        id: 'preview-visitor-1',
        authorType: 'visitor',
        author: 'human',
        content: firstSuggestion,
        read: true,
        readByOwner: true,
        readByVisitor: true,
      },
      {
        id: 'preview-assistant-2',
        authorType: chatbot.settings.ai.enabled ? 'assistant' : 'owner',
        author: chatbot.settings.ai.enabled ? 'ai' : 'human',
        content: assistantReply,
        read: true,
        readByOwner: true,
        readByVisitor: true,
      },
    ],
  };
};

class EmbedService {
  renderScript({ chatbot, baseUrl }) {
    const language = chatbot.settings.defaultLanguage || 'english';
    const iframeBaseUrl = `${baseUrl}/chat/iframe/${chatbot.id}?lang=${encodeURIComponent(language)}`;
    const widgetLocation = chatbot.settings.widgetLocation || 'right';
    const isTop =
      widgetLocation === 'top-left' || widgetLocation === 'top-right';
    const isLeft = widgetLocation === 'left' || widgetLocation === 'top-left';
    const verticalEdge = isTop ? 'top' : 'bottom';
    const horizontalEdge = isLeft ? 'left' : 'right';
    const flexDirection = isTop ? 'column' : 'column-reverse';
    const alignItems = isLeft ? 'flex-start' : 'flex-end';
    const transformOrigin = `${isTop ? 'top' : 'bottom'} ${isLeft ? 'left' : 'right'}`;
    const closedTranslateY = isTop ? '-18px' : '18px';
    const lightTheme = chatbot.settings.theme.light;
    const accent = lightTheme.accentColor;
    const accentText = lightTheme.accentTextColor;
    const surface = lightTheme.surfaceColor;
    const border = lightTheme.borderColor;
    const text = lightTheme.textColor;
    const rounded = chatbot.settings.rounded !== false;
    const launcherRadius = rounded ? '26px' : '18px';
    const panelRadius = rounded ? '30px' : '20px';
    const iconRadius = rounded ? '18px' : '12px';
    const launcherShadow = `0 18px 42px ${withAlpha(
      accent,
      0.28,
      'rgba(15, 23, 42, 0.18)',
    )}`;
    const panelShadow = `0 28px 64px ${withAlpha(
      accent,
      0.18,
      'rgba(15, 23, 42, 0.22)',
    )}`;
    const accentSoft = withAlpha(accent, 0.16, 'rgba(15, 23, 42, 0.08)');
    const launcherIconUrl =
      chatbot.settings.brand.bubbleIconUrl || chatbot.settings.brand.logoUrl;
    const launcherTitle = chatbot.settings.botName;
    const launcherInitial = chatbot.settings.botName.slice(0, 1).toUpperCase();

    return `
(function () {
  var existing = document.getElementById('momicro-assist-${chatbot.id}');
  if (existing) return;
  var globalConfig = window.MOMICRO_ASSIST_CONFIG;
  var widgetConfig =
    globalConfig && typeof globalConfig === 'object'
      ? globalConfig[${escapeScript(chatbot.id)}] || globalConfig
      : null;
  var authClient =
    widgetConfig && typeof widgetConfig.authClient === 'string'
      ? widgetConfig.authClient
      : '';
  var chatbotId = ${escapeScript(chatbot.id)};
  var iframeSrc =
    ${escapeScript(iframeBaseUrl)} +
    (authClient ? '&authClient=' + encodeURIComponent(authClient) : '');
  var wrapper = document.createElement('div');
  wrapper.id = 'momicro-assist-${chatbot.id}';
  wrapper.style.position = 'fixed';
  wrapper.style.${verticalEdge} = '18px';
  wrapper.style.${horizontalEdge} = '18px';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.maxWidth = 'min(440px, calc(100vw - 18px))';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = ${escapeScript(flexDirection)};
  wrapper.style.alignItems = ${escapeScript(alignItems)};
  wrapper.style.gap = '12px';
  wrapper.style.fontFamily =
    '"SF Pro Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif';
  var button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', ${escapeScript(
    `Open ${chatbot.settings.botName}`,
  )});
  button.style.display = 'grid';
  button.style.gridTemplateColumns = '52px minmax(0, 1fr)';
  button.style.alignItems = 'center';
  button.style.gap = '12px';
  button.style.width = 'min(320px, calc(100vw - 18px))';
  button.style.border = '0';
  button.style.borderRadius = ${escapeScript(launcherRadius)};
  button.style.padding = '10px 14px 10px 10px';
  button.style.cursor = 'pointer';
  button.style.textAlign = 'left';
  button.style.color = ${escapeScript(text)};
  button.style.background =
    'linear-gradient(180deg, ${surface}, ${surface}) padding-box, linear-gradient(135deg, ${accentSoft}, ${border}) border-box';
  button.style.border = '1px solid transparent';
  button.style.boxShadow = ${escapeScript(launcherShadow)};
  button.style.backdropFilter = 'blur(18px)';
  var icon = document.createElement('span');
  icon.style.width = '52px';
  icon.style.height = '52px';
  icon.style.borderRadius = ${escapeScript(iconRadius)};
  icon.style.display = 'flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';
  icon.style.overflow = 'hidden';
  icon.style.flex = 'none';
  icon.style.background = ${escapeScript(
    chatbot.settings.brand.logoBackgroundColor || accentSoft,
  )};
  icon.style.boxShadow = 'inset 0 0 0 1px ${border}';
  if (${launcherIconUrl ? 'true' : 'false'}) {
    var iconImage = document.createElement('img');
    iconImage.src = ${escapeScript(launcherIconUrl || '')};
    iconImage.alt = ${escapeScript(`${chatbot.settings.botName} icon`)};
    iconImage.style.width = '100%';
    iconImage.style.height = '100%';
    iconImage.style.objectFit = 'cover';
    icon.appendChild(iconImage);
  } else {
    icon.textContent = ${escapeScript(launcherInitial)};
    icon.style.fontSize = '18px';
    icon.style.fontWeight = '800';
    icon.style.color = ${escapeScript(accentText)};
    icon.style.background =
      'linear-gradient(135deg, ${accent}, ${accent})';
  }
  var copy = document.createElement('span');
  copy.style.display = 'grid';
  copy.style.gap = '0';
  copy.style.minWidth = '0';
  var copyTitle = document.createElement('span');
  copyTitle.textContent = ${escapeScript(launcherTitle)};
  copyTitle.style.fontSize = '15px';
  copyTitle.style.fontWeight = '800';
  copyTitle.style.lineHeight = '1.1';
  copyTitle.style.whiteSpace = 'nowrap';
  copyTitle.style.overflow = 'hidden';
  copyTitle.style.textOverflow = 'ellipsis';
  copy.appendChild(copyTitle);
  button.appendChild(icon);
  button.appendChild(copy);
  var panel = document.createElement('div');
  panel.style.width = '420px';
  panel.style.maxWidth = 'calc(100vw - 18px)';
  panel.style.maxHeight = '0px';
  panel.style.overflow = 'hidden';
  panel.style.opacity = '0';
  panel.style.transform = ${escapeScript(
    `translateY(${closedTranslateY}) scale(0.98)`,
  )};
  panel.style.transformOrigin = ${escapeScript(transformOrigin)};
  panel.style.pointerEvents = 'none';
  panel.style.transition =
    'max-height 240ms ease, opacity 180ms ease, transform 240ms ease';
  panel.style.borderRadius = ${escapeScript(panelRadius)};
  panel.style.border = '1px solid ${border}';
  panel.style.background = ${escapeScript(surface)};
  panel.style.boxShadow = ${escapeScript(panelShadow)};
  panel.style.backdropFilter = 'blur(18px)';
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.title = ${escapeScript(chatbot.settings.botName)};
  iframe.loading = 'lazy';
  iframe.style.width = '420px';
  iframe.style.maxWidth = 'calc(100vw - 32px)';
  iframe.style.height = '680px';
  iframe.style.maxHeight = 'calc(100vh - 96px)';
  iframe.style.border = '0';
  iframe.style.borderRadius = ${escapeScript(panelRadius)};
  iframe.style.background = ${escapeScript(surface)};
  var isOpen = false;
  var notifyIframe = function (action) {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: 'momicro-assist',
        action: action,
        chatbotId: chatbotId
      },
      '*'
    );
  };
  var setOpen = function (next) {
    isOpen = !!next;
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    panel.style.maxHeight = isOpen ? 'calc(100vh - 92px)' : '0px';
    panel.style.opacity = isOpen ? '1' : '0';
    panel.style.transform = isOpen
      ? 'translateY(0) scale(1)'
      : ${escapeScript(`translateY(${closedTranslateY}) scale(0.98)`)};
    panel.style.pointerEvents = isOpen ? 'auto' : 'none';
    notifyIframe(isOpen ? 'open' : 'hide');
    if (!isOpen) {
      button.focus();
    }
  };
  iframe.addEventListener('load', function () {
    notifyIframe(isOpen ? 'open' : 'hide');
  });
  button.addEventListener('click', function () {
    setOpen(!isOpen);
  });
  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow) return;
    var data = event.data || {};
    if (data.type !== 'momicro-assist' || data.chatbotId !== chatbotId) return;
    if (data.action === 'hide') {
      setOpen(false);
      return;
    }
    if (data.action === 'open') {
      setOpen(true);
    }
  });
  panel.appendChild(iframe);
  wrapper.appendChild(button);
  wrapper.appendChild(panel);
  document.body.appendChild(wrapper);
}());
`.trim();
  }

  renderIframe({ chatbot, baseUrl, authClient = '', preview = null }) {
    const websocketUrl = `${toWebsocketUrl(baseUrl)}/ws`;
    const lightTheme = chatbot.settings.theme.light;
    const darkTheme = chatbot.settings.theme.dark;
    const widgetLocation = chatbot.settings.widgetLocation || 'right';
    const previewEnabled = Boolean(preview?.enabled);
    const previewMode = preview?.mode === 'dark' ? 'dark' : 'light';
    const rounded = chatbot.settings.rounded !== false;
    const radiusXl = rounded ? '30px' : '20px';
    const radiusLg = rounded ? '24px' : '16px';
    const radiusMd = rounded ? '18px' : '12px';
    const radiusSm = rounded ? '14px' : '10px';
    const launcherIconUrl =
      chatbot.settings.brand.bubbleIconUrl || chatbot.settings.brand.logoUrl;
    const brandIconUrl =
      chatbot.settings.brand.logoUrl || chatbot.settings.brand.bubbleIconUrl;
    const activityLabel = `${chatbot.settings.inactivityHours}h inactivity window`;
    const languageLabel = formatLanguageLabel(chatbot.settings.defaultLanguage);
    const responseModeLabel = chatbot.settings.ai.enabled
      ? 'AI replies'
      : 'Human follow-up';
    const sessionModeLabel = chatbot.settings.auth
      ? 'Secure session'
      : 'Guest chat';
    const payload = {
      chatbot,
      apiBaseUrl: baseUrl,
      websocketUrl,
      authClient,
    };
    if (previewEnabled) {
      payload.preview = {
        enabled: true,
        mode: previewMode,
        selectedPart: preview?.selectedPart || 'launcher',
        conversation: createPreviewConversation(chatbot),
      };
    }

    return `<!DOCTYPE html>
<html lang="${chatbot.settings.defaultLanguage || 'english'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${chatbot.settings.title || chatbot.settings.botName}</title>
  <style>
    :root {
      color-scheme: light dark;
      --accent: ${lightTheme.accentColor};
      --accent-text: ${lightTheme.accentTextColor};
      --accent-soft: ${withAlpha(
        lightTheme.accentColor,
        0.14,
        'rgba(9, 154, 217, 0.14)',
      )};
      --accent-fog: ${withAlpha(
        lightTheme.accentColor,
        0.08,
        'rgba(9, 154, 217, 0.08)',
      )};
      --accent-glow: ${withAlpha(
        lightTheme.accentColor,
        0.24,
        'rgba(9, 154, 217, 0.24)',
      )};
      --bg: ${lightTheme.backgroundColor};
      --surface: ${lightTheme.surfaceColor};
      --surface-soft: ${withAlpha(
        lightTheme.surfaceColor,
        0.92,
        lightTheme.surfaceColor,
      )};
      --text: ${lightTheme.textColor};
      --text-soft: ${withAlpha(
        lightTheme.textColor,
        0.72,
        'rgba(15, 23, 42, 0.72)',
      )};
      --border: ${lightTheme.borderColor};
      --border-soft: ${withAlpha(
        lightTheme.borderColor,
        0.65,
        lightTheme.borderColor,
      )};
      --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || lightTheme.surfaceColor};
      --radius-xl: ${radiusXl};
      --radius-lg: ${radiusLg};
      --radius-md: ${radiusMd};
      --radius-sm: ${radiusSm};
      --shadow: 0 28px 64px ${withAlpha(
        lightTheme.accentColor,
        0.18,
        'rgba(15, 23, 42, 0.18)',
      )};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, var(--accent-glow), transparent 36%),
        radial-gradient(circle at bottom right, var(--accent-fog), transparent 28%),
        var(--bg);
      font-family: "SF Pro Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
      color: var(--text);
    }
    body.widget-hidden .shell {
      display: none;
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: linear-gradient(180deg, var(--surface-soft), var(--surface));
    }
    body.preview {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: transparent;
    }
    body.preview.preview-light {
      --accent: ${lightTheme.accentColor};
      --accent-text: ${lightTheme.accentTextColor};
      --accent-soft: ${withAlpha(
        lightTheme.accentColor,
        0.14,
        'rgba(9, 154, 217, 0.14)',
      )};
      --accent-fog: ${withAlpha(
        lightTheme.accentColor,
        0.08,
        'rgba(9, 154, 217, 0.08)',
      )};
      --accent-glow: ${withAlpha(
        lightTheme.accentColor,
        0.24,
        'rgba(9, 154, 217, 0.24)',
      )};
      --bg: ${lightTheme.backgroundColor};
      --surface: ${lightTheme.surfaceColor};
      --surface-soft: ${withAlpha(
        lightTheme.surfaceColor,
        0.92,
        lightTheme.surfaceColor,
      )};
      --text: ${lightTheme.textColor};
      --text-soft: ${withAlpha(
        lightTheme.textColor,
        0.72,
        'rgba(15, 23, 42, 0.72)',
      )};
      --border: ${lightTheme.borderColor};
      --border-soft: ${withAlpha(
        lightTheme.borderColor,
        0.65,
        lightTheme.borderColor,
      )};
      --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || lightTheme.surfaceColor};
      --shadow: 0 28px 64px ${withAlpha(
        lightTheme.accentColor,
        0.18,
        'rgba(15, 23, 42, 0.18)',
      )};
    }
    body.preview.preview-dark {
      --accent: ${darkTheme.accentColor};
      --accent-text: ${darkTheme.accentTextColor};
      --accent-soft: ${withAlpha(
        darkTheme.accentColor,
        0.16,
        'rgba(92, 215, 211, 0.16)',
      )};
      --accent-fog: ${withAlpha(
        darkTheme.accentColor,
        0.1,
        'rgba(92, 215, 211, 0.1)',
      )};
      --accent-glow: ${withAlpha(
        darkTheme.accentColor,
        0.28,
        'rgba(92, 215, 211, 0.28)',
      )};
      --bg: ${darkTheme.backgroundColor};
      --surface: ${darkTheme.surfaceColor};
      --surface-soft: ${withAlpha(
        darkTheme.surfaceColor,
        0.94,
        darkTheme.surfaceColor,
      )};
      --text: ${darkTheme.textColor};
      --text-soft: ${withAlpha(
        darkTheme.textColor,
        0.76,
        'rgba(236, 253, 255, 0.76)',
      )};
      --border: ${darkTheme.borderColor};
      --border-soft: ${withAlpha(
        darkTheme.borderColor,
        0.72,
        darkTheme.borderColor,
      )};
      --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || darkTheme.surfaceColor};
      --shadow: 0 28px 64px ${withAlpha(
        darkTheme.accentColor,
        0.18,
        'rgba(0, 0, 0, 0.28)',
      )};
    }
    .preview-stage {
      position: relative;
      width: min(100%, 520px);
      height: min(760px, 100vh);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    body.preview .shell {
      width: min(420px, 100%);
      height: min(700px, 100vh);
      max-height: 100%;
    }
    .standalone-launcher {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 10;
      display: inline-grid;
      grid-template-columns: 46px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      width: min(300px, calc(100vw - 24px));
      border: 1px solid transparent;
      border-radius: var(--radius-lg);
      padding: 10px 14px 10px 10px;
      background:
        linear-gradient(180deg, var(--surface), var(--surface)) padding-box,
        linear-gradient(135deg, var(--accent-soft), var(--border-soft)) border-box;
      box-shadow: var(--shadow);
      color: var(--text);
      cursor: pointer;
      text-align: left;
    }
    body.preview .standalone-launcher {
      position: absolute;
      margin: 0;
      z-index: 2;
    }
    body.preview .preview-stage.right .standalone-launcher {
      right: 0;
      bottom: 0;
    }
    body.preview .preview-stage.left .standalone-launcher {
      left: 0;
      bottom: 0;
    }
    body.preview .preview-stage.top-left .standalone-launcher {
      left: 0;
      top: 0;
    }
    body.preview .preview-stage.top-right .standalone-launcher {
      right: 0;
      top: 0;
    }
    .standalone-launcher[hidden] {
      display: none;
    }
    body.preview [data-preview-part] {
      cursor: pointer;
    }
    body.preview [data-preview-selected="true"] {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    body.preview .message[data-preview-selected="true"] {
      outline-offset: 2px;
    }
    .standalone-icon,
    .brand-mark {
      width: 46px;
      height: 46px;
      border-radius: calc(var(--radius-md) - 2px);
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--logo-bg);
      border: 1px solid var(--border-soft);
      color: var(--text);
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .standalone-icon img,
    .brand-mark img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .standalone-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .standalone-title {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .standalone-subtitle {
      font-size: 12px;
      color: var(--text-soft);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--border);
      background:
        linear-gradient(135deg, var(--accent-soft), transparent 64%),
        linear-gradient(180deg, var(--surface), transparent);
    }
    .header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .brand-lockup {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
    }
    .brand-copy {
      min-width: 0;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 7px 10px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      max-width: 100%;
    }
    .eyebrow span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .title {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.05;
    }
    .title[contenteditable="plaintext-only"] {
      outline: none;
    }
    .message-content[contenteditable="plaintext-only"] {
      outline: none;
    }
    .chip[contenteditable="plaintext-only"] {
      outline: none;
    }
    textarea.preview-placeholder-edit {
      color: var(--text-soft);
      font-style: normal;
    }
    .subtitle {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-soft);
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: rgba(255, 255, 255, 0.42);
    }
    .status-badge.active {
      color: var(--accent);
      background: var(--accent-soft);
      border-color: transparent;
    }
    .status-badge.pending {
      color: #9a6700;
      background: rgba(245, 158, 11, 0.14);
      border-color: rgba(245, 158, 11, 0.22);
    }
    .status-badge.closed {
      color: #b42318;
      background: rgba(180, 35, 24, 0.1);
      border-color: rgba(180, 35, 24, 0.2);
    }
    .header-tray {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .info-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 7px 10px;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.5);
      color: var(--text-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .icon-button,
    .end-chat {
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.52);
      color: inherit;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .end-chat {
      color: #b42318;
      background: rgba(180, 35, 24, 0.08);
      border-color: rgba(180, 35, 24, 0.16);
    }
    .messages {
      padding: 18px 16px 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background:
        radial-gradient(circle at top right, var(--accent-fog), transparent 24%),
        transparent;
    }
    .message {
      max-width: 85%;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      line-height: 1.55;
      font-size: 14px;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.streaming {
      opacity: 0.96;
    }
    .message.streaming .message-content::after {
      content: '';
      display: inline-block;
      width: 0.42em;
      height: 1em;
      margin-left: 2px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.45;
      vertical-align: -0.12em;
      animation: momicro-widget-caret 0.9s steps(1, end) infinite;
    }
    .message.visitor {
      align-self: flex-end;
      background: linear-gradient(135deg, var(--accent), var(--accent));
      color: var(--accent-text);
      border-bottom-right-radius: calc(var(--radius-sm) - 4px);
    }
    .message.owner,
    .message.assistant,
    .message.system {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.74);
      color: var(--text);
      border: 1px solid var(--border-soft);
      border-bottom-left-radius: calc(var(--radius-sm) - 4px);
    }
    .composer {
      padding: 14px;
      border-top: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(255, 255, 255, 0)),
        var(--surface);
    }
    .composer.locked {
      opacity: 0.7;
    }
    .suggestions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .suggestions[hidden] {
      display: none;
    }
    .chip {
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.78);
      color: var(--text);
      border-radius: 999px;
      padding: 7px 11px;
      cursor: pointer;
      font-size: 12px;
      transition: transform 120ms ease, border-color 120ms ease;
    }
    .chip:hover {
      transform: translateY(-1px);
      border-color: var(--accent);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    textarea {
      width: 100%;
      min-height: 44px;
      max-height: 140px;
      resize: none;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.86);
      color: inherit;
      font: inherit;
      box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
    }
    textarea:disabled,
    button:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
    button.send {
      border: 0;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--accent-text);
      padding: 0 18px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 18px 32px var(--accent-glow);
    }
    .composer-meta {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      color: var(--text-soft);
      font-size: 12px;
      line-height: 1.5;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.42);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 360px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      padding: 18px;
      border: 1px solid var(--border-soft);
      box-shadow: var(--shadow);
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .card p {
      margin: -4px 0 14px;
      color: var(--text-soft);
      font-size: 13px;
      line-height: 1.5;
    }
    .field {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
    }
    .field label {
      font-size: 12px;
      opacity: 0.8;
    }
    .field input {
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font: inherit;
      color: inherit;
      background: rgba(255, 255, 255, 0.88);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .ghost {
      background: rgba(255, 255, 255, 0.66);
      color: inherit;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      cursor: pointer;
    }
    .primary {
      background: var(--accent);
      color: var(--accent-text);
      border: 0;
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      cursor: pointer;
    }
    @media (max-width: 520px) {
      .header-row {
        flex-direction: column;
      }
      .meta {
        width: 100%;
        justify-content: flex-start;
      }
      .message {
        max-width: 92%;
      }
      .composer-meta {
        flex-direction: column;
        align-items: flex-start;
      }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --accent: ${darkTheme.accentColor};
        --accent-text: ${darkTheme.accentTextColor};
        --accent-soft: ${withAlpha(
          darkTheme.accentColor,
          0.16,
          'rgba(92, 215, 211, 0.16)',
        )};
        --accent-fog: ${withAlpha(
          darkTheme.accentColor,
          0.1,
          'rgba(92, 215, 211, 0.1)',
        )};
        --accent-glow: ${withAlpha(
          darkTheme.accentColor,
          0.28,
          'rgba(92, 215, 211, 0.28)',
        )};
        --bg: ${darkTheme.backgroundColor};
        --surface: ${darkTheme.surfaceColor};
        --surface-soft: ${withAlpha(
          darkTheme.surfaceColor,
          0.94,
          darkTheme.surfaceColor,
        )};
        --text: ${darkTheme.textColor};
        --text-soft: ${withAlpha(
          darkTheme.textColor,
          0.76,
          'rgba(236, 253, 255, 0.76)',
        )};
        --border: ${darkTheme.borderColor};
        --border-soft: ${withAlpha(
          darkTheme.borderColor,
          0.72,
          darkTheme.borderColor,
        )};
        --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || darkTheme.surfaceColor};
        --shadow: 0 28px 64px ${withAlpha(
          darkTheme.accentColor,
          0.18,
          'rgba(0, 0, 0, 0.28)',
        )};
      }
      .message.owner,
      .message.assistant,
      .message.system {
        background: rgba(255, 255, 255, 0.08);
      }
    }
    @keyframes momicro-widget-caret {
      0%, 50% {
        opacity: 0.45;
      }
      50.01%, 100% {
        opacity: 0;
      }
    }
  </style>
</head>
<body${previewEnabled ? ` class="preview preview-${previewMode}"` : ''}>
  ${previewEnabled ? `<div class="preview-stage ${widgetLocation}">` : ''}
  <button id="standaloneLauncher" class="standalone-launcher" type="button" hidden data-preview-part="launcher">
    <span class="standalone-icon">
      ${
        launcherIconUrl
          ? `<img src="${launcherIconUrl}" alt="${chatbot.settings.botName} icon" />`
          : chatbot.settings.botName.slice(0, 1).toUpperCase()
      }
    </span>
    <span class="standalone-copy">
      <span class="standalone-title">${chatbot.settings.botName}</span>
    </span>
  </button>
  <div id="shell" class="shell">
    <header class="header" data-preview-part="header">
      <div class="header-row">
        <div class="brand-lockup">
          <div class="brand-mark">
            ${
              brandIconUrl
                ? `<img src="${brandIconUrl}" alt="${chatbot.settings.botName} logo" />`
                : chatbot.settings.botName.slice(0, 1).toUpperCase()
            }
          </div>
          <div class="brand-copy">
            <h1 id="previewBotName" class="title"${previewEnabled ? ' data-preview-editable="true" data-preview-field="botName" contenteditable="plaintext-only"' : ''}>${chatbot.settings.botName}</h1>
          </div>
        </div>
        <div class="meta">
          <span id="statusBadge" class="status-badge active">Active</span>
          <button id="hideChat" class="icon-button" type="button">Hide</button>
          <button id="endChat" class="end-chat" type="button">End Chat</button>
        </div>
      </div>
      <div class="header-tray">
        <span class="info-chip">${responseModeLabel}</span>
        <span class="info-chip">${sessionModeLabel}</span>
        <span class="info-chip">${languageLabel}</span>
      </div>
    </header>
    <main id="messages" class="messages" data-preview-part="canvas"></main>
    <footer id="composer" class="composer" data-preview-part="composer">
      <div id="suggestions" class="suggestions" data-preview-part="suggested"></div>
      <div class="row">
        <textarea id="input" placeholder="${chatbot.settings.inputPlaceholder}"></textarea>
        <button id="send" class="send" type="button">Send</button>
      </div>
      <div class="composer-meta">
        <span>${
          chatbot.settings.auth
            ? 'This chat is linked to your website session when authClient is provided.'
            : 'This chat works without website login.'
        }</span>
        <span>${activityLabel}</span>
      </div>
    </footer>
  </div>
  ${previewEnabled ? '</div>' : ''}
  <div id="overlay" class="overlay">
    <div class="card">
      <h2>${chatbot.settings.leadsFormTitle}</h2>
      <p>Leave your details and continue chatting. Your session stays active for up to ${chatbot.settings.inactivityHours} hours after your last message.</p>
      <form id="leadForm"></form>
      <div class="actions">
        <button id="cancelLead" type="button" class="ghost">Cancel</button>
        <button id="submitLead" type="button" class="primary">Continue</button>
      </div>
    </div>
  </div>
  <script>
    window.MOMICRO_WIDGET = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
  </script>
  <script>
    (() => {
      const runtime = window.MOMICRO_WIDGET;
      const preview = runtime.preview || null;
      const previewEnabled = Boolean(preview && preview.enabled);
      const storageKey = 'momicro-assist-widget:' + runtime.chatbot.id;
      const messages = document.getElementById('messages');
      const input = document.getElementById('input');
      const send = document.getElementById('send');
      const suggestions = document.getElementById('suggestions');
      const overlay = document.getElementById('overlay');
      const leadForm = document.getElementById('leadForm');
      const submitLead = document.getElementById('submitLead');
      const cancelLead = document.getElementById('cancelLead');
      const hideChat = document.getElementById('hideChat');
      const standaloneLauncher = document.getElementById('standaloneLauncher');
      const endChat = document.getElementById('endChat');
      const statusBadge = document.getElementById('statusBadge');
      const composer = document.getElementById('composer');
      const defaultPlaceholder =
        runtime.chatbot.settings.inputPlaceholder || 'Write a message...';
      let socket = null;
      let widgetToken = localStorage.getItem(storageKey) || '';
      let queuedMessage = '';
      let currentConversation = null;
      const messageNodes = new Map();
      const streamStates = new Map();

      const statusLabels = {
        active: 'Active',
        pending: 'Pending',
        closed: 'Closed',
      };

      const isEmbedded = () => window.parent && window.parent !== window;

      const emitPreviewChange = (payload) => {
        if (!previewEnabled || !isEmbedded()) return;
        window.parent.postMessage(
          {
            type: 'momicro-assist-preview',
            action: 'change',
            chatbotId: runtime.chatbot.id,
            ...payload,
          },
          '*',
        );
      };

      const bindPreviewEditable = (element, descriptor = {}) => {
        if (!previewEnabled || !element || !descriptor.field) return;
        element.setAttribute('data-preview-editable', 'true');

        const commit = () => {
          const rawValue =
            typeof element.value === 'string'
              ? element.value
              : element.textContent || '';
          emitPreviewChange({
            field: descriptor.field,
            index: descriptor.index,
            value: rawValue.replace(/\u00a0/g, ' ').trim(),
          });
        };

        element.addEventListener('blur', commit);

        if (typeof element.value !== 'string') {
          element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              element.blur();
            }
          });
        }
      };

      const setPreviewSelection = (part) => {
        document
          .querySelectorAll('[data-preview-selected="true"]')
          .forEach((node) => {
            node.removeAttribute('data-preview-selected');
          });

        if (!part) return;

        document
          .querySelectorAll('[data-preview-part="' + part + '"]')
          .forEach((node) => {
            node.setAttribute('data-preview-selected', 'true');
          });
      };

      const bindPreviewSelection = () => {
        document.addEventListener(
          'click',
          (event) => {
            const target = event.target.closest('[data-preview-part]');
            if (!target) return;
            const part = target.getAttribute('data-preview-part') || '';
            const editable = event.target.closest('[data-preview-editable="true"]');
            setPreviewSelection(part);
            if (isEmbedded()) {
              window.parent.postMessage(
                {
                  type: 'momicro-assist-preview',
                  action: 'select',
                  chatbotId: runtime.chatbot.id,
                  part,
                },
                '*',
              );
            }
            if (!editable) {
              event.preventDefault();
              event.stopPropagation();
            }
          },
          true,
        );

        window.addEventListener('message', (event) => {
          const data = event.data || {};
          if (
            data.type !== 'momicro-assist-preview' ||
            data.chatbotId !== runtime.chatbot.id
          ) {
            return;
          }

          if (data.action === 'highlight') {
            setPreviewSelection(data.part || '');
          }
        });
      };

      const setWidgetHidden = (hidden) => {
        document.body.classList.toggle('widget-hidden', Boolean(hidden));
        standaloneLauncher.hidden = !hidden;
        if (!hidden && !previewEnabled) {
          window.setTimeout(() => {
            if (!input.disabled) input.focus();
          }, 50);
        }
      };

      const syncParentVisibility = (action) => {
        if (!isEmbedded()) return;
        window.parent.postMessage(
          {
            type: 'momicro-assist',
            action,
            chatbotId: runtime.chatbot.id,
          },
          '*',
        );
      };

      const requestHideWidget = () => {
        setWidgetHidden(true);
        syncParentVisibility('hide');
      };

      const scrollMessagesToBottom = () => {
        messages.scrollTop = messages.scrollHeight;
      };

      const clearStreamStates = () => {
        streamStates.forEach((state) => {
          if (state.timer) window.clearTimeout(state.timer);
        });
        streamStates.clear();
      };

      const ensureConversationMessages = () => {
        if (!currentConversation) return [];
        if (!Array.isArray(currentConversation.messages)) {
          currentConversation.messages = [];
        }
        return currentConversation.messages;
      };

      const findConversationMessage = (messageId) =>
        ensureConversationMessages().find((item) => item.id === messageId) || null;

      const upsertConversationMessage = (message) => {
        const items = ensureConversationMessages();
        const index = items.findIndex((item) => item.id === message.id);
        if (index === -1) {
          const created = {
            ...message,
          };
          items.push(created);
          return created;
        }

        items[index] = {
          ...items[index],
          ...message,
        };
        return items[index];
      };

      const removeConversationMessage = (messageId) => {
        const items = ensureConversationMessages();
        const index = items.findIndex((item) => item.id === messageId);
        if (index !== -1) items.splice(index, 1);
      };

      const createMessageNode = (message, options = {}) => {
        const node = document.createElement('div');
        node.className = 'message ' + (message.authorType || 'system');
        node.classList.toggle('streaming', Boolean(options.streaming));
        node.setAttribute(
          'data-preview-part',
          message.authorType === 'visitor' ? 'visitorBubble' : 'assistantBubble',
        );

        const contentNode = document.createElement('div');
        contentNode.className = 'message-content';
        contentNode.textContent = message.content || '';
        if (previewEnabled && message.id === 'preview-assistant-1') {
          contentNode.setAttribute('contenteditable', 'plaintext-only');
          contentNode.setAttribute('data-preview-field', 'initialMessage');
          bindPreviewEditable(contentNode, {
            field: 'initialMessage',
          });
        }
        node.appendChild(contentNode);

        messages.appendChild(node);
        if (message.id) {
          messageNodes.set(message.id, {
            node,
            contentNode,
          });
        }
        scrollMessagesToBottom();

        return {
          node,
          contentNode,
        };
      };

      const syncMessageNode = (message, options = {}) => {
        if (!message?.id) {
          return createMessageNode(message, options);
        }

        const existing = messageNodes.get(message.id);
        if (!existing) {
          return createMessageNode(message, options);
        }

        existing.node.className = 'message ' + (message.authorType || 'system');
        existing.node.classList.toggle('streaming', Boolean(options.streaming));
        existing.contentNode.textContent = message.content || '';
        scrollMessagesToBottom();
        return existing;
      };

      const addMessage = (authorType, content) => {
        createMessageNode({
          authorType,
          content,
        });
      };

      const settleStreamState = (messageId) => {
        const state = streamStates.get(messageId);
        if (!state) return;
        if (state.timer || state.queue.length) return;

        const record = messageNodes.get(messageId);
        if (record) {
          record.node.classList.remove('streaming');
        }

        if (state.failed && !findConversationMessage(messageId)?.content) {
          record?.node.remove();
          messageNodes.delete(messageId);
          removeConversationMessage(messageId);
        }

        if (state.completed || state.failed) {
          streamStates.delete(messageId);
        }
      };

      const flushStreamQueue = (messageId) => {
        const state = streamStates.get(messageId);
        if (!state) return;

        if (!state.queue.length) {
          state.timer = null;
          settleStreamState(messageId);
          return;
        }

        const nextChunk = state.queue.shift();
        const message = findConversationMessage(messageId);
        if (!message) {
          state.queue = [];
          state.timer = null;
          streamStates.delete(messageId);
          return;
        }

        message.content = (message.content || '') + nextChunk;
        syncMessageNode(message, {
          streaming: true,
        });

        state.timer = window.setTimeout(() => {
          flushStreamQueue(messageId);
        }, 28);
      };

      const startStreamingMessage = (message) => {
        const entry = upsertConversationMessage({
          ...message,
          content: message.content || '',
        });
        syncMessageNode(entry, {
          streaming: true,
        });
      };

      const queueStreamingChunk = (messageId, chunk) => {
        let state = streamStates.get(messageId);
        if (!state) {
          state = {
            queue: [],
            timer: null,
            completed: false,
            failed: false,
          };
          streamStates.set(messageId, state);
        }

        state.queue.push(chunk);
        if (!state.timer) {
          state.timer = window.setTimeout(() => {
            flushStreamQueue(messageId);
          }, 28);
        }
      };

      const completeStreamingMessage = (messageId) => {
        const state = streamStates.get(messageId);
        if (!state) {
          const record = messageNodes.get(messageId);
          if (record) record.node.classList.remove('streaming');
          return;
        }

        state.completed = true;
        settleStreamState(messageId);
      };

      const failStreamingMessage = (messageId) => {
        let state = streamStates.get(messageId);
        if (!state) {
          state = {
            queue: [],
            timer: null,
            completed: false,
            failed: true,
          };
          streamStates.set(messageId, state);
        } else {
          state.failed = true;
        }

        settleStreamState(messageId);
      };

      const renderConversation = (conversation) => {
        clearStreamStates();
        messageNodes.clear();
        messages.innerHTML = '';
        currentConversation = conversation;
        (conversation.messages || []).forEach((message) => {
          syncMessageNode(message);
        });
        if (!conversation.messages || !conversation.messages.length) {
          addMessage('system', runtime.chatbot.settings.initialMessage);
        }
        applyConversationState(conversation);
      };

      const applyComposerState = (disabled, placeholder) => {
        input.disabled = disabled;
        send.disabled = disabled;
        input.placeholder = placeholder || defaultPlaceholder;
        composer.classList.toggle('locked', disabled);
        suggestions
          .querySelectorAll('button')
          .forEach((button) => {
            button.disabled = disabled;
          });
      };

      const applyConversationState = (conversation) => {
        currentConversation = conversation;
        const status = conversation?.status || 'active';
        statusBadge.textContent = statusLabels[status] || 'Active';
        statusBadge.className = 'status-badge ' + status;
        const hideEndChat =
          runtime.chatbot.settings.auth ||
          !conversation ||
          conversation.status === 'closed';
        endChat.hidden = hideEndChat;

        if (status === 'closed') {
          applyComposerState(true, 'This chat is closed');
          if (!runtime.chatbot.settings.auth) {
            localStorage.removeItem(storageKey);
          }
          return;
        }

        applyComposerState(false, defaultPlaceholder);
      };

      const queueVisitorRead = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({
          action: 'widget.read',
          payload: {}
        }));
      };

      const renderSuggestions = () => {
        suggestions.innerHTML = '';
        const items = Array.isArray(runtime.chatbot.settings.suggestedMessages)
          ? runtime.chatbot.settings.suggestedMessages.filter(Boolean)
          : [];
        suggestions.hidden = items.length === 0;
        items.forEach((item, index) => {
          if (previewEnabled) {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.textContent = item;
            chip.setAttribute('contenteditable', 'plaintext-only');
            chip.setAttribute('data-preview-field', 'suggestedMessages');
            bindPreviewEditable(chip, {
              field: 'suggestedMessages',
              index,
            });
            suggestions.appendChild(chip);
          } else {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chip';
            button.textContent = item;
            button.addEventListener('click', () => {
              input.value = item;
              dispatchMessage();
            });
            suggestions.appendChild(button);
          }
        });
      };

      const renderLeadForm = () => {
        leadForm.innerHTML = '';
        runtime.chatbot.settings.leadsForm.forEach((field) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'field';
          const label = document.createElement('label');
          label.textContent = field.label + (field.required ? ' *' : '');
          const control = document.createElement('input');
          control.name = field.key;
          control.type = field.type || 'text';
          if (field.required) control.required = true;
          wrapper.appendChild(label);
          wrapper.appendChild(control);
          leadForm.appendChild(wrapper);
        });
      };

      if (previewEnabled) {
        renderLeadForm();
        renderSuggestions();
        renderConversation(preview.conversation || {
          status: 'active',
          messages: [],
        });
        applyComposerState(false, defaultPlaceholder);
        input.value = defaultPlaceholder;
        input.placeholder = '';
        input.classList.add('preview-placeholder-edit');
        bindPreviewEditable(input, {
          field: 'inputPlaceholder',
        });
        bindPreviewEditable(document.getElementById('previewBotName'), {
          field: 'botName',
        });
        setWidgetHidden(false);
        bindPreviewSelection();
        setPreviewSelection(preview.selectedPart || 'launcher');
        return;
      }

      const handleSocketError = async (packet) => {
        const message = packet?.payload?.message || 'Widget request failed';
        const code = packet?.payload?.code || '';

        if (runtime.chatbot.settings.auth && (code === 'forbidden' || code === 'bad_request' || code === 'not_found')) {
          localStorage.removeItem(storageKey);
          widgetToken = '';
          currentConversation = null;
          if (socket) socket.close();
          socket = null;
          if (runtime.authClient) {
            try {
              await createSession();
              return;
            } catch (error) {
              alert(error.message);
              return;
            }
          }
        }

        alert(message);
      };

      const connectSocket = () => {
        if (!widgetToken) return;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          return;
        }

        socket = new WebSocket(runtime.websocketUrl);
        socket.addEventListener('open', () => {
          socket.send(JSON.stringify({
            action: 'widget.authenticate',
            payload: {
              token: widgetToken,
              authClient: runtime.authClient || ''
            }
          }));
        });
        socket.addEventListener('message', async (event) => {
          const packet = JSON.parse(event.data);

          if (packet.event === 'authenticated') {
            renderConversation(packet.payload.conversation);
            queueVisitorRead();
            if (queuedMessage) {
              const text = queuedMessage;
              queuedMessage = '';
              sendWidgetMessage(text);
            }
            return;
          }

          if (packet.event === 'message.created') {
            const message = packet.payload.message;
            if (currentConversation) {
              upsertConversationMessage(message);
            }
            syncMessageNode(message);
            completeStreamingMessage(message.id);
            if (message.authorType !== 'visitor') queueVisitorRead();
            return;
          }

          if (packet.event === 'message.stream.started') {
            if (currentConversation) {
              startStreamingMessage(packet.payload.message);
            }
            return;
          }

          if (packet.event === 'message.stream.delta') {
            if (!currentConversation) return;
            const targetMessage =
              findConversationMessage(packet.payload.messageId) ||
              upsertConversationMessage({
                id: packet.payload.messageId,
                authorType: 'assistant',
                author: 'ai',
                content: '',
                createdAt: new Date(),
                read: false,
                readByOwner: true,
                readByVisitor: false,
              });
            syncMessageNode(targetMessage, {
              streaming: true,
            });
            queueStreamingChunk(packet.payload.messageId, packet.payload.chunk);
            return;
          }

          if (packet.event === 'message.stream.completed') {
            completeStreamingMessage(packet.payload.messageId);
            queueVisitorRead();
            return;
          }

          if (packet.event === 'message.stream.failed') {
            failStreamingMessage(packet.payload.messageId);
            return;
          }

          if (packet.event === 'conversation.updated' || packet.event === 'conversation.closed') {
            if (packet.payload?.conversation) {
              applyConversationState(packet.payload.conversation);
            }
            return;
          }

          if (packet.event === 'error') {
            await handleSocketError(packet);
          }
        });
        socket.addEventListener('close', () => {
          socket = null;
        });
      };

      window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type !== 'momicro-assist' || data.chatbotId !== runtime.chatbot.id) {
          return;
        }

        if (data.action === 'open') {
          setWidgetHidden(false);
          return;
        }

        if (data.action === 'hide') {
          setWidgetHidden(true);
        }
      });

      const createSession = async () => {
        const visitor = {};
        Array.from(leadForm.elements).forEach((element) => {
          if (element.name) visitor[element.name] = element.value;
        });
        const response = await fetch(runtime.apiBaseUrl + '/v1/widget/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatbotId: runtime.chatbot.id,
            token: widgetToken,
            visitor,
            language: runtime.chatbot.settings.defaultLanguage || 'english',
            authClient: runtime.authClient || ''
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Failed to create session');
        widgetToken = payload.token;
        localStorage.setItem(storageKey, widgetToken);
        overlay.style.display = 'none';
        connectSocket();
        return payload;
      };

      const sendWidgetMessage = (text) => {
        socket.send(JSON.stringify({
          action: 'widget.message',
          payload: { content: text }
        }));
        input.value = '';
      };

      const dispatchMessage = async () => {
        const text = input.value.trim();
        if (!text) return;
        if (currentConversation && currentConversation.status === 'closed') return;

        if (runtime.chatbot.settings.auth && !runtime.authClient) {
          alert('authClient is required for this chatbot');
          return;
        }

        if (!widgetToken) {
          queuedMessage = text;
          if (runtime.chatbot.settings.auth) {
            try {
              await createSession();
            } catch (error) {
              alert(error.message);
            }
            return;
          }

          overlay.style.display = 'flex';
          return;
        }

        if (!socket || socket.readyState !== WebSocket.OPEN) {
          queuedMessage = text;
          connectSocket();
          return;
        }

        sendWidgetMessage(text);
      };

      renderLeadForm();
      renderSuggestions();
      hideChat.addEventListener('click', requestHideWidget);
      standaloneLauncher.addEventListener('click', () => {
        setWidgetHidden(false);
        syncParentVisibility('open');
      });
      endChat.addEventListener('click', () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (!currentConversation || currentConversation.status === 'closed') return;
        socket.send(JSON.stringify({
          action: 'widget.close',
          payload: {}
        }));
      });
      send.addEventListener('click', dispatchMessage);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          dispatchMessage();
        }
      });
      submitLead.addEventListener('click', async () => {
        try {
          await createSession();
        } catch (error) {
          alert(error.message);
        }
      });
      cancelLead.addEventListener('click', () => {
        overlay.style.display = 'none';
        queuedMessage = '';
      });

      if (widgetToken) {
        connectSocket();
      } else if (runtime.chatbot.settings.auth && runtime.authClient) {
        createSession().catch((error) => {
          alert(error.message);
          addMessage('system', runtime.chatbot.settings.initialMessage);
          applyComposerState(false, defaultPlaceholder);
        });
      } else {
        addMessage('system', runtime.chatbot.settings.initialMessage);
        applyComposerState(false, defaultPlaceholder);
      }

      setWidgetHidden(false);
    })();
  </script>
</body>
</html>`;
  }

  renderDashboardScript({ chatbotId, baseUrl }) {
    const iframeBaseUrl = `${baseUrl}/chat/dashboard/iframe/${chatbotId}`;

    return `
(function () {
  var existing = document.getElementById('momicro-assist-dashboard-${chatbotId}');
  if (existing) return;
  var globalConfig = window.MOMICRO_ASSIST_DASHBOARD_CONFIG;
  var dashboardConfig =
    globalConfig && typeof globalConfig === 'object'
      ? globalConfig[${escapeScript(chatbotId)}] || globalConfig
      : null;
  var sessionToken =
    dashboardConfig && typeof dashboardConfig.sessionToken === 'string'
      ? dashboardConfig.sessionToken
      : '';
  var selector =
    dashboardConfig && typeof dashboardConfig.selector === 'string'
      ? dashboardConfig.selector
      : '';
  var height =
    dashboardConfig && typeof dashboardConfig.height === 'string'
      ? dashboardConfig.height
      : '760px';
  var iframeSrc =
    ${escapeScript(iframeBaseUrl)} +
    (sessionToken ? '?sessionToken=' + encodeURIComponent(sessionToken) : '');
  var host = selector ? document.querySelector(selector) : null;
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
  }
  var iframe = document.createElement('iframe');
  iframe.id = 'momicro-assist-dashboard-${chatbotId}';
  iframe.src = iframeSrc;
  iframe.title = 'MoMicro Assist Dashboard';
  iframe.style.width = '100%';
  iframe.style.height = height;
  iframe.style.border = '0';
  iframe.style.borderRadius = '24px';
  iframe.style.background = '#fff';
  iframe.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.12)';
  host.appendChild(iframe);
}());
`.trim();
  }

  renderDashboardIframe({ chatbotId, baseUrl, sessionToken = '' }) {
    const websocketUrl = `${toWebsocketUrl(baseUrl)}/ws`;
    const payload = {
      chatbotId,
      apiBaseUrl: baseUrl,
      websocketUrl,
      sessionToken,
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MoMicro Assist Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #edf3f8;
      --surface: rgba(255, 255, 255, 0.86);
      --surface-strong: #ffffff;
      --text: #102033;
      --muted: #5f7084;
      --border: rgba(148, 163, 184, 0.28);
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --danger: #b42318;
      --danger-soft: rgba(180, 35, 24, 0.1);
      --shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "SF Pro Display", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(20, 184, 166, 0.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.12), transparent 24%),
        var(--bg);
      color: var(--text);
    }
    .shell {
      height: 100vh;
      padding: 18px;
      display: grid;
    }
    .frame {
      min-height: 0;
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 16px;
    }
    .panel {
      min-height: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 28px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px);
    }
    .sidebar {
      display: grid;
      grid-template-rows: auto auto 1fr;
      overflow: hidden;
    }
    .sidebar-head {
      padding: 20px 20px 12px;
      border-bottom: 1px solid var(--border);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .sidebar-head h1 {
      margin: 14px 0 0;
      font-size: 24px;
      line-height: 1.05;
    }
    .sidebar-head p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .status-bar {
      padding: 14px 20px 0;
      color: var(--muted);
      font-size: 13px;
      min-height: 34px;
    }
    .conversation-list {
      overflow: auto;
      padding: 16px;
      display: grid;
      gap: 10px;
    }
    .conversation-item {
      width: 100%;
      border: 1px solid transparent;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.66);
      color: inherit;
      text-align: left;
      padding: 14px;
      cursor: pointer;
      display: grid;
      gap: 8px;
      transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    }
    .conversation-item:hover {
      transform: translateY(-1px);
      border-color: rgba(15, 118, 110, 0.18);
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
    }
    .conversation-item.active {
      border-color: rgba(15, 118, 110, 0.3);
      background: rgba(255, 255, 255, 0.92);
    }
    .conversation-item-head,
    .thread-head-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .conversation-title,
    .thread-title {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.2;
      word-break: break-word;
    }
    .conversation-meta,
    .thread-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      word-break: break-word;
    }
    .conversation-preview {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      min-height: 20px;
      word-break: break-word;
    }
    .pill-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pill,
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.03);
    }
    .pill.active,
    .badge.active {
      color: var(--accent);
      background: var(--accent-soft);
      border-color: rgba(15, 118, 110, 0.2);
    }
    .pill.pending,
    .badge.pending {
      color: #9a6700;
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.22);
    }
    .pill.closed,
    .badge.closed {
      color: var(--danger);
      background: var(--danger-soft);
      border-color: rgba(180, 35, 24, 0.18);
    }
    .badge.unread {
      color: #0f172a;
      background: rgba(15, 23, 42, 0.08);
    }
    .thread {
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
    }
    .thread-head {
      padding: 22px 24px 18px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(255, 255, 255, 0.2));
    }
    .thread-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .button {
      border: 0;
      border-radius: 16px;
      padding: 12px 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .button.primary {
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      color: #fff;
    }
    .button.ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: inherit;
    }
    .button.danger {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid rgba(180, 35, 24, 0.14);
    }
    .button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .thread-body {
      min-height: 0;
      overflow: auto;
      padding: 18px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: min(78%, 720px);
      padding: 12px 14px;
      border-radius: 22px;
      line-height: 1.55;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.streaming {
      opacity: 0.96;
    }
    .message.streaming .message-content::after {
      content: '';
      display: inline-block;
      width: 0.42em;
      height: 1em;
      margin-left: 2px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.45;
      vertical-align: -0.12em;
      animation: momicro-dashboard-caret 0.9s steps(1, end) infinite;
    }
    .message.visitor {
      align-self: flex-start;
      background: rgba(15, 23, 42, 0.05);
      color: var(--text);
      border-bottom-left-radius: 8px;
    }
    .message.owner,
    .message.assistant {
      align-self: flex-end;
      background: linear-gradient(135deg, #0f766e, #14b8a6);
      color: #fff;
      border-bottom-right-radius: 8px;
    }
    .message-meta {
      margin-top: 8px;
      font-size: 11px;
      opacity: 0.72;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .thread-empty,
    .list-empty {
      min-height: 220px;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 24px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .composer {
      padding: 18px 24px 24px;
      border-top: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.72);
    }
    .composer textarea {
      width: 100%;
      min-height: 108px;
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 14px 16px;
      font: inherit;
      color: inherit;
      background: #fff;
      resize: vertical;
    }
    .composer-foot {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .composer-note {
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 980px) {
      .shell {
        height: auto;
        min-height: 100vh;
        padding: 12px;
      }
      .frame {
        grid-template-columns: 1fr;
      }
      .sidebar {
        min-height: 320px;
      }
      .thread {
        min-height: 70vh;
      }
      .message {
        max-width: 100%;
      }
    }
    @keyframes momicro-dashboard-caret {
      0%, 50% {
        opacity: 0.45;
      }
      50.01%, 100% {
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="frame">
      <aside class="panel sidebar">
        <div class="sidebar-head">
          <span class="eyebrow">Owner Inbox</span>
          <h1 id="chatbotTitle">Loading dashboard</h1>
          <p id="chatbotSubtitle">Live conversations for your chatbot.</p>
        </div>
        <div id="statusBar" class="status-bar"></div>
        <div id="conversationList" class="conversation-list"></div>
      </aside>
      <section class="panel thread">
        <header class="thread-head">
          <div class="thread-head-top">
            <div>
              <div id="threadTitle" class="thread-title">Select a conversation</div>
              <div id="threadMeta" class="thread-meta"></div>
            </div>
            <div class="thread-actions">
              <span id="threadStatus" class="badge active">Active</span>
              <button id="closeConversation" class="button danger" type="button">Close Chat</button>
            </div>
          </div>
        </header>
        <main id="threadBody" class="thread-body">
          <div class="thread-empty">Choose a conversation on the left to load the thread.</div>
        </main>
        <footer class="composer">
          <textarea id="replyInput" placeholder="Reply to the customer..."></textarea>
          <div class="composer-foot">
            <div id="composerNote" class="composer-note">Replies are sent as the owner.</div>
            <button id="sendReply" class="button primary" type="button">Send Reply</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
  <script>
    window.MOMICRO_OWNER_DASHBOARD = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
  </script>
  <script>
    (() => {
      const runtime = window.MOMICRO_OWNER_DASHBOARD;
      const chatbotTitle = document.getElementById('chatbotTitle');
      const chatbotSubtitle = document.getElementById('chatbotSubtitle');
      const statusBar = document.getElementById('statusBar');
      const conversationList = document.getElementById('conversationList');
      const threadTitle = document.getElementById('threadTitle');
      const threadMeta = document.getElementById('threadMeta');
      const threadStatus = document.getElementById('threadStatus');
      const threadBody = document.getElementById('threadBody');
      const replyInput = document.getElementById('replyInput');
      const sendReply = document.getElementById('sendReply');
      const closeConversation = document.getElementById('closeConversation');
      const composerNote = document.getElementById('composerNote');

      const state = {
        chatbot: null,
        conversations: [],
        selectedConversationId: '',
        socket: null,
        socketReady: false,
        subscribedConversationId: '',
      };
      const threadMessageNodes = new Map();
      const threadStreamStates = new Map();

      const formatTime = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
      };

      const getConversationTitle = (conversation) =>
        conversation.visitor?.name ||
        conversation.visitor?.email ||
        conversation.authClient ||
        ('Conversation ' + String(conversation.id || '').slice(0, 8));

      const getConversationMeta = (conversation) => {
        const parts = [];
        if (conversation.visitor?.email) parts.push(conversation.visitor.email);
        if (conversation.visitor?.name && conversation.authClient) {
          parts.push(conversation.authClient);
        } else if (!conversation.visitor?.email && conversation.authClient) {
          parts.push(conversation.authClient);
        }
        const lastActivity = formatTime(
          conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt
        );
        if (lastActivity) parts.push(lastActivity);
        return parts.join(' · ') || 'No visitor details yet';
      };

      const normalizeConversation = (conversation) => ({
        ...conversation,
        visitor: conversation?.visitor || {},
        messages: Array.isArray(conversation?.messages) ? conversation.messages : [],
      });

      const clearThreadStreamStates = () => {
        threadStreamStates.forEach((state) => {
          if (state.timer) window.clearTimeout(state.timer);
        });
        threadStreamStates.clear();
      };

      const resetThreadRenderState = () => {
        threadMessageNodes.clear();
        clearThreadStreamStates();
      };

      const getMessageSource = (message) =>
        message.authorType === 'assistant'
          ? 'AI'
          : message.authorType === 'owner'
            ? 'Owner'
            : 'Visitor';

      const isMessageRead = (message) =>
        message.authorType === 'visitor'
          ? message.readByOwner
          : message.readByVisitor;

      const buildMessageMeta = (message) =>
        getMessageSource(message) +
        ' · ' +
        formatTime(message.createdAt) +
        ' · ' +
        (isMessageRead(message) ? 'Read' : 'Unread');

      const compareActivity = (left, right) => {
        const leftTime = new Date(
          left.updatedAt || left.lastMessageAt || left.createdAt || 0
        ).getTime();
        const rightTime = new Date(
          right.updatedAt || right.lastMessageAt || right.createdAt || 0
        ).getTime();
        return rightTime - leftTime;
      };

      const currentConversation = () =>
        state.conversations.find((item) => item.id === state.selectedConversationId) || null;

      const setStatus = (message, isError) => {
        statusBar.textContent = message || '';
        statusBar.style.color = isError ? 'var(--danger)' : 'var(--muted)';
      };

      const authHeaders = (includeJson) => {
        const headers = {
          Authorization: 'Bearer ' + runtime.sessionToken,
        };
        if (includeJson) headers['Content-Type'] = 'application/json';
        return headers;
      };

      const api = async (path, options = {}) => {
        const hasBody = Object.prototype.hasOwnProperty.call(options, 'body');
        const response = await fetch(runtime.apiBaseUrl + path, {
          ...options,
          headers: {
            ...authHeaders(hasBody),
            ...(options.headers || {}),
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'Request failed');
        }
        return payload;
      };

      const upsertConversation = (conversation) => {
        const normalized = normalizeConversation(conversation);
        const index = state.conversations.findIndex((item) => item.id === normalized.id);

        if (index === -1) {
          state.conversations.push(normalized);
        } else {
          const previous = state.conversations[index];
          state.conversations[index] = {
            ...previous,
            ...normalized,
            messages:
              normalized.messages.length || !previous.messages?.length
                ? normalized.messages
                : previous.messages,
          };
        }

        state.conversations.sort(compareActivity);
        renderConversationList();

        if (state.selectedConversationId === normalized.id) {
          renderSelectedConversation();
        }
      };

      const updateConversation = (
        conversationId,
        updater,
        options = { renderSelected: true },
      ) => {
        const index = state.conversations.findIndex((item) => item.id === conversationId);
        if (index === -1) return;
        state.conversations[index] = normalizeConversation(
          updater(state.conversations[index])
        );
        state.conversations.sort(compareActivity);
        renderConversationList();
        if (
          options.renderSelected !== false &&
          state.selectedConversationId === conversationId
        ) {
          renderSelectedConversation();
        }
      };

      const findConversationMessage = (conversationId, messageId) => {
        const conversation =
          state.conversations.find((item) => item.id === conversationId) || null;
        if (!conversation) return null;
        return (
          (conversation.messages || []).find((item) => item.id === messageId) || null
        );
      };

      const upsertConversationMessage = (conversationId, message) => {
        let targetMessage = null;

        updateConversation(
          conversationId,
          (conversation) => {
            const messages = Array.isArray(conversation.messages)
              ? [...conversation.messages]
              : [];
            const index = messages.findIndex((item) => item.id === message.id);

            if (index === -1) {
              targetMessage = {
                ...message,
              };
              messages.push(targetMessage);
            } else {
              messages[index] = {
                ...messages[index],
                ...message,
              };
              targetMessage = messages[index];
            }

            return {
              ...conversation,
              messages,
            };
          },
          { renderSelected: false },
        );

        return targetMessage;
      };

      const removeConversationMessage = (conversationId, messageId) => {
        updateConversation(
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: (conversation.messages || []).filter(
              (item) => item.id !== messageId
            ),
          }),
          { renderSelected: false },
        );
      };

      const createThreadMessageNode = (message, options = {}) => {
        const node = document.createElement('div');
        node.className = 'message ' + (message.authorType || 'visitor');
        node.classList.toggle('streaming', Boolean(options.streaming));

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = message.content || '';
        node.appendChild(content);

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = buildMessageMeta(message);
        node.appendChild(meta);

        threadBody.appendChild(node);
        if (message.id) {
          threadMessageNodes.set(message.id, {
            node,
            content,
            meta,
          });
        }
        threadBody.scrollTop = threadBody.scrollHeight;

        return {
          node,
          content,
          meta,
        };
      };

      const syncThreadMessageNode = (message, options = {}) => {
        if (!message?.id) {
          return createThreadMessageNode(message, options);
        }

        const existing = threadMessageNodes.get(message.id);
        if (!existing) {
          return createThreadMessageNode(message, options);
        }

        existing.node.className = 'message ' + (message.authorType || 'visitor');
        existing.node.classList.toggle('streaming', Boolean(options.streaming));
        existing.content.textContent = message.content || '';
        existing.meta.textContent = buildMessageMeta(message);
        threadBody.scrollTop = threadBody.scrollHeight;
        return existing;
      };

      const settleThreadStreamState = (conversationId, messageId) => {
        const state = threadStreamStates.get(messageId);
        if (!state || state.timer || state.queue.length) return;

        const record = threadMessageNodes.get(messageId);
        if (record) {
          record.node.classList.remove('streaming');
        }

        if (state.failed && !findConversationMessage(conversationId, messageId)?.content) {
          record?.node.remove();
          threadMessageNodes.delete(messageId);
          removeConversationMessage(conversationId, messageId);
        }

        if (state.completed || state.failed) {
          threadStreamStates.delete(messageId);
        }
      };

      const flushThreadStreamQueue = (conversationId, messageId) => {
        const state = threadStreamStates.get(messageId);
        if (!state) return;

        if (!state.queue.length) {
          state.timer = null;
          settleThreadStreamState(conversationId, messageId);
          return;
        }

        const nextChunk = state.queue.shift();
        const message = findConversationMessage(conversationId, messageId);
        if (!message) {
          state.queue = [];
          state.timer = null;
          threadStreamStates.delete(messageId);
          return;
        }

        message.content = (message.content || '') + nextChunk;
        syncThreadMessageNode(message, {
          streaming: true,
        });
        updateConversation(
          conversationId,
          (conversation) => ({
            ...conversation,
            lastMessagePreview: message.content.slice(0, 120),
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
          }),
          { renderSelected: false },
        );

        state.timer = window.setTimeout(() => {
          flushThreadStreamQueue(conversationId, messageId);
        }, 28);
      };

      const startThreadStreamingMessage = (conversationId, message) => {
        if (state.selectedConversationId !== conversationId) return;
        syncThreadMessageNode(message, {
          streaming: true,
        });
      };

      const queueThreadStreamingChunk = (conversationId, messageId, chunk) => {
        if (state.selectedConversationId !== conversationId) return;

        let stateEntry = threadStreamStates.get(messageId);
        if (!stateEntry) {
          stateEntry = {
            queue: [],
            timer: null,
            completed: false,
            failed: false,
          };
          threadStreamStates.set(messageId, stateEntry);
        }

        stateEntry.queue.push(chunk);
        if (!stateEntry.timer) {
          stateEntry.timer = window.setTimeout(() => {
            flushThreadStreamQueue(conversationId, messageId);
          }, 28);
        }
      };

      const completeThreadStreamingMessage = (conversationId, messageId) => {
        const stateEntry = threadStreamStates.get(messageId);
        if (!stateEntry) {
          const record = threadMessageNodes.get(messageId);
          if (record) record.node.classList.remove('streaming');
          return;
        }

        stateEntry.completed = true;
        settleThreadStreamState(conversationId, messageId);
      };

      const failThreadStreamingMessage = (conversationId, messageId) => {
        let stateEntry = threadStreamStates.get(messageId);
        if (!stateEntry) {
          stateEntry = {
            queue: [],
            timer: null,
            completed: false,
            failed: true,
          };
          threadStreamStates.set(messageId, stateEntry);
        } else {
          stateEntry.failed = true;
        }

        settleThreadStreamState(conversationId, messageId);
      };

      const renderConversationList = () => {
        conversationList.innerHTML = '';
        if (!state.conversations.length) {
          const empty = document.createElement('div');
          empty.className = 'list-empty';
          empty.textContent = 'No conversations yet. New chats will appear here automatically.';
          conversationList.appendChild(empty);
          return;
        }

        state.conversations.forEach((conversation) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            'conversation-item' +
            (conversation.id === state.selectedConversationId ? ' active' : '');
          button.addEventListener('click', () => {
            selectConversation(conversation.id).catch((error) => {
              setStatus(error.message, true);
            });
          });

          const head = document.createElement('div');
          head.className = 'conversation-item-head';

          const titleWrap = document.createElement('div');
          const title = document.createElement('div');
          title.className = 'conversation-title';
          title.textContent = getConversationTitle(conversation);
          const meta = document.createElement('div');
          meta.className = 'conversation-meta';
          meta.textContent = getConversationMeta(conversation);
          titleWrap.appendChild(title);
          titleWrap.appendChild(meta);

          const pills = document.createElement('div');
          pills.className = 'pill-row';
          const status = document.createElement('span');
          status.className = 'pill ' + (conversation.status || 'active');
          status.textContent = conversation.status || 'active';
          pills.appendChild(status);
          if (conversation.unreadForOwner > 0) {
            const unread = document.createElement('span');
            unread.className = 'pill unread';
            unread.textContent = conversation.unreadForOwner + ' new';
            pills.appendChild(unread);
          }

          head.appendChild(titleWrap);
          head.appendChild(pills);

          const preview = document.createElement('div');
          preview.className = 'conversation-preview';
          preview.textContent = conversation.lastMessagePreview || 'No messages yet';

          button.appendChild(head);
          button.appendChild(preview);
          conversationList.appendChild(button);
        });
      };

      const renderSelectedConversation = () => {
        resetThreadRenderState();
        const conversation = currentConversation();
        if (!conversation) {
          threadTitle.textContent = 'Select a conversation';
          threadMeta.textContent = '';
          threadStatus.textContent = 'Active';
          threadStatus.className = 'badge active';
          closeConversation.hidden = true;
          replyInput.disabled = true;
          sendReply.disabled = true;
          composerNote.textContent = 'Choose a conversation to send a reply.';
          threadBody.innerHTML =
            '<div class="thread-empty">Choose a conversation on the left to load the thread.</div>';
          return;
        }

        threadTitle.textContent = getConversationTitle(conversation);
        threadMeta.textContent = getConversationMeta(conversation);
        threadStatus.textContent = conversation.status || 'active';
        threadStatus.className = 'badge ' + (conversation.status || 'active');
        closeConversation.hidden =
          Boolean(conversation.authClient) || conversation.status === 'closed';

        const locked = conversation.status === 'closed';
        replyInput.disabled = locked;
        sendReply.disabled = locked;
        composerNote.textContent = locked
          ? 'This conversation is closed.'
          : 'Replies are sent as the owner.';

        threadBody.innerHTML = '';
        if (!conversation.messages.length) {
          threadBody.innerHTML =
            '<div class="thread-empty">No messages in this conversation yet.</div>';
          return;
        }

        conversation.messages.forEach((message) => {
          syncThreadMessageNode(message);
        });

        threadBody.scrollTop = threadBody.scrollHeight;
      };

      const ensureConversationSubscription = () => {
        if (!state.socketReady || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
          return;
        }
        if (!state.selectedConversationId) return;
        if (state.subscribedConversationId === state.selectedConversationId) return;

        state.socket.send(JSON.stringify({
          action: 'conversation.subscribe',
          payload: { conversationId: state.selectedConversationId }
        }));
        state.subscribedConversationId = state.selectedConversationId;
      };

      const markConversationRead = async (conversationId) => {
        const conversation = state.conversations.find((item) => item.id === conversationId);
        if (!conversation || conversation.unreadForOwner <= 0) return;

        await api('/v1/conversations/' + conversationId + '/read', {
          method: 'POST',
        });

        updateConversation(conversationId, (item) => ({
          ...item,
          unreadForOwner: 0,
          messages: item.messages.map((message) =>
            message.authorType === 'visitor'
              ? { ...message, read: true, readByOwner: true }
              : message
          ),
        }));
      };

      const loadConversation = async (conversationId) => {
        const conversation = await api('/v1/conversations/' + conversationId);
        upsertConversation(conversation);
        state.selectedConversationId = conversationId;
        renderConversationList();
        renderSelectedConversation();
        ensureConversationSubscription();
        await markConversationRead(conversationId);
      };

      const selectConversation = async (conversationId) => {
        state.selectedConversationId = conversationId;
        renderConversationList();
        renderSelectedConversation();
        ensureConversationSubscription();
        await loadConversation(conversationId);
      };

      const handleMessageCreated = async (payload) => {
        const { conversationId, message } = payload;
        const existing =
          state.conversations.find((item) => item.id === conversationId) || {
            id: conversationId,
            visitor: {},
            messages: [],
            unreadForOwner: 0,
          status: 'active',
        };
        const hasMessage = (existing.messages || []).some((item) => item.id === message.id);
        const nextMessages = hasMessage
          ? (existing.messages || []).map((item) =>
              item.id === message.id
                ? {
                    ...item,
                    ...message,
                  }
                : item
            )
          : [...(existing.messages || []), message];

        upsertConversation({
          ...existing,
          messages: nextMessages,
          lastMessagePreview: message.content.slice(0, 120),
          lastMessageAt: message.createdAt,
          updatedAt: message.createdAt,
          unreadForOwner:
            message.authorType === 'visitor' &&
            conversationId !== state.selectedConversationId
              ? (existing.unreadForOwner || 0) + 1
              : existing.unreadForOwner || 0,
          status:
            message.authorType === 'visitor' && existing.status !== 'closed'
              ? 'active'
              : existing.status,
        });

        if (conversationId === state.selectedConversationId) {
          syncThreadMessageNode(message);
          completeThreadStreamingMessage(conversationId, message.id);
          if (message.authorType === 'visitor') {
            try {
              await markConversationRead(conversationId);
            } catch (error) {
              setStatus(error.message, true);
            }
          }
        }
      };

      const connectSocket = () => {
        if (!runtime.sessionToken) return;
        state.socket = new WebSocket(runtime.websocketUrl);

        state.socket.addEventListener('open', () => {
          state.socket.send(JSON.stringify({
            action: 'user.authenticate',
            payload: { token: runtime.sessionToken }
          }));
        });

        state.socket.addEventListener('message', async (event) => {
          const packet = JSON.parse(event.data);

          if (packet.event === 'authenticated') {
            state.socketReady = true;
            state.socket.send(JSON.stringify({
              action: 'chatbot.subscribe',
              payload: { chatbotId: runtime.chatbotId }
            }));
            ensureConversationSubscription();
            return;
          }

          if (packet.event === 'conversation.created') {
            upsertConversation(packet.payload.conversation);
            if (!state.selectedConversationId) {
              state.selectedConversationId = packet.payload.conversation.id;
              renderSelectedConversation();
            }
            return;
          }

          if (packet.event === 'message.created') {
            await handleMessageCreated(packet.payload);
            return;
          }

          if (packet.event === 'message.stream.started') {
            const { conversationId, message } = packet.payload;
            upsertConversation({
              id: conversationId,
              visitor: {},
              messages: [],
              unreadForOwner: 0,
              status: 'active',
            });
            const streamedMessage = upsertConversationMessage(conversationId, message);
            updateConversation(
              conversationId,
              (conversation) => ({
                ...conversation,
                lastMessagePreview: '',
                lastMessageAt: message.createdAt,
                updatedAt: message.createdAt,
              }),
              { renderSelected: false },
            );
            startThreadStreamingMessage(conversationId, streamedMessage || message);
            return;
          }

          if (packet.event === 'message.stream.delta') {
            const { conversationId, messageId, chunk } = packet.payload;
            const isSelectedConversation =
              state.selectedConversationId === conversationId;
            const streamedMessage =
              findConversationMessage(conversationId, messageId) ||
              upsertConversationMessage(conversationId, {
                id: messageId,
                authorType: 'assistant',
                author: 'ai',
                content: '',
                createdAt: new Date(),
                read: false,
                readByOwner: true,
                readByVisitor: false,
              });

            if (streamedMessage && !isSelectedConversation) {
              updateConversation(
                conversationId,
                (conversation) => ({
                  ...conversation,
                  messages: (conversation.messages || []).map((message) =>
                    message.id === messageId
                      ? {
                          ...message,
                          content: (message.content || '') + chunk,
                        }
                      : message
                  ),
                }),
                { renderSelected: false },
              );
            }

            if (streamedMessage) {
              updateConversation(
                conversationId,
                (conversation) => ({
                  ...conversation,
                  lastMessagePreview: (
                    (streamedMessage.content || '') + chunk
                  ).slice(0, 120),
                }),
                { renderSelected: false },
              );
            }

            queueThreadStreamingChunk(conversationId, messageId, chunk);
            return;
          }

          if (packet.event === 'message.stream.completed') {
            completeThreadStreamingMessage(
              packet.payload.conversationId,
              packet.payload.messageId,
            );
            return;
          }

          if (packet.event === 'message.stream.failed') {
            failThreadStreamingMessage(
              packet.payload.conversationId,
              packet.payload.messageId,
            );
            return;
          }

          if (packet.event === 'conversation.updated') {
            upsertConversation(packet.payload.conversation);
            return;
          }

          if (packet.event === 'conversation.read') {
            const { conversationId, actorType } = packet.payload || {};
            if (!conversationId) return;

            updateConversation(conversationId, (item) => ({
              ...item,
              unreadForOwner: actorType === 'owner' ? 0 : item.unreadForOwner,
              messages: item.messages.map((message) => {
                if (actorType === 'owner' && message.authorType === 'visitor') {
                  return {
                    ...message,
                    read: true,
                    readByOwner: true,
                  };
                }
                if (
                  actorType === 'visitor' &&
                  (message.authorType === 'owner' || message.authorType === 'assistant')
                ) {
                  return {
                    ...message,
                    read: true,
                    readByVisitor: true,
                  };
                }
                return message;
              }),
            }));
            return;
          }

          if (packet.event === 'error') {
            setStatus(packet.payload?.message || 'Websocket request failed', true);
          }
        });

        state.socket.addEventListener('close', () => {
          state.socketReady = false;
          state.subscribedConversationId = '';
          setStatus('Realtime connection closed.', true);
        });
      };

      const loadDashboard = async () => {
        if (!runtime.sessionToken) {
          setStatus('sessionToken is required for the owner dashboard embed.', true);
          return;
        }

        try {
          const [chatbot, conversations] = await Promise.all([
            api('/v1/chatbots/' + runtime.chatbotId),
            api('/v1/chatbots/' + runtime.chatbotId + '/conversations'),
          ]);

          state.chatbot = chatbot;
          state.conversations = conversations
            .map(normalizeConversation)
            .sort(compareActivity);

          chatbotTitle.textContent =
            chatbot.settings?.botName || chatbot.settings?.title || 'Inbox';
          chatbotSubtitle.textContent =
            (state.conversations.length
              ? state.conversations.length + ' conversations loaded.'
              : 'No conversations yet. New chats will appear here.') +
            ' Realtime sync is enabled.';

          renderConversationList();

          if (state.conversations.length) {
            await selectConversation(state.conversations[0].id);
          } else {
            renderSelectedConversation();
          }

          setStatus('Connected to dashboard data.', false);
          connectSocket();
        } catch (error) {
          setStatus(error.message, true);
        }
      };

      sendReply.addEventListener('click', async () => {
        const conversation = currentConversation();
        const content = replyInput.value.trim();
        if (!conversation || !content) return;
        if (conversation.status === 'closed') return;

        sendReply.disabled = true;
        try {
          await api('/v1/conversations/' + conversation.id + '/messages', {
            method: 'POST',
            body: JSON.stringify({ content }),
          });
          replyInput.value = '';
          setStatus('Reply sent.', false);
        } catch (error) {
          setStatus(error.message, true);
        } finally {
          sendReply.disabled = false;
        }
      });

      replyInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          sendReply.click();
        }
      });

      closeConversation.addEventListener('click', async () => {
        const conversation = currentConversation();
        if (!conversation) return;
        if (conversation.authClient || conversation.status === 'closed') return;

        closeConversation.disabled = true;
        try {
          await api('/v1/conversations/' + conversation.id + '/close', {
            method: 'POST',
          });
          setStatus('Conversation closed.', false);
        } catch (error) {
          setStatus(error.message, true);
        } finally {
          closeConversation.disabled = false;
        }
      });

      loadDashboard();
    })();
  </script>
</body>
</html>`;
  }
}

module.exports = { EmbedService };
