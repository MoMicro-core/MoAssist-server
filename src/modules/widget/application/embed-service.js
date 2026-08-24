'use strict';

const { toWebsocketUrl } = require('../../../shared/application/url');

const escapeScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Chatbot settings are owner-controlled free text. Everything that reaches the
// iframe template must go through one of these three, matched to the context it
// lands in: escapeHtml for element text, escapeAttr for quoted attributes, and
// safeColor for anything interpolated into a <style> block.
const HTML_ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  [String.fromCharCode(39), '&#39;'],
]);

const escapeHtml = (value = '') =>
  String(value === null || value === undefined ? '' : value).replace(
    /[&<>"']/g,
    (char) => HTML_ESCAPES.get(char),
  );

// Attributes are always emitted double-quoted, so this is escapeHtml; kept as a
// separate name so the call site documents which context it is protecting.
const escapeAttr = escapeHtml;

// A URL destined for src/href. Rejects anything that is not http(s) or a data
// image, so `javascript:` and attribute-breakout payloads cannot survive.
const safeUrl = (value = '') => {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) {
    return escapeAttr(raw);
  }
  return '';
};

const DEFAULT_COLOR_FALLBACK = 'rgba(15, 23, 42, 0.12)';

// Only shapes that cannot terminate a CSS declaration or a <style> element.
const COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;

const safeColor = (value = '', fallback = 'transparent') => {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw || !COLOR_PATTERN.test(raw)) return fallback;
  return raw;
};

// Sanitize the whole theme once, at the point it is read, so every downstream
// `${theme.someColor}` interpolation is safe by construction rather than by
// each call site remembering. An empty value stays empty because several
// templates rely on `||` falling through to another token.
const sanitizeTheme = (theme = {}) => {
  const source = theme && typeof theme === 'object' ? theme : {};
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      if (!/color$/i.test(key)) return [key, value];
      const raw = String(
        value === null || value === undefined ? '' : value,
      ).trim();
      return [key, raw ? safeColor(raw, 'transparent') : ''];
    }),
  );
};

const sanitizeBrand = (brand = {}) => {
  const source = brand && typeof brand === 'object' ? brand : {};
  return {
    ...source,
    logoUrl: safeUrl(source.logoUrl),
    bubbleIconUrl: safeUrl(source.bubbleIconUrl),
    logoBackgroundColor: source.logoBackgroundColor
      ? safeColor(source.logoBackgroundColor, '')
      : '',
  };
};

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

const chatBubbleIcon = (color = '#ffffff') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    // Tabler "message-circle" adapted for inline data URI usage.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 20l1.3-3.9c-2.324-3.437-1.426-7.872 2.1-10.374c3.526-2.501 8.59-2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235-7.615 4.215-11.574 2.293l-4.7 1"/></svg>`,
  )}`;

const closeIcon = (color = '#111111') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    // Tabler "x" adapted for inline data URI usage.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  )}`;

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
    const iframeBaseUrl = `${baseUrl}/chat/iframe/${chatbot.id}?embedded=1&lang=${encodeURIComponent(language)}`;
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
    const lightTheme = sanitizeTheme(chatbot.settings.theme.light);
    const launcherBackground =
      lightTheme.launcherBackgroundColor || lightTheme.accentColor;
    const surface = lightTheme.surfaceColor;
    const rounded = chatbot.settings.rounded !== false;
    const cornerRadius = Number.isFinite(chatbot.settings.cornerRadius)
      ? Math.max(0, Math.min(40, chatbot.settings.cornerRadius))
      : 24;
    const launcherRadius = rounded ? `${Math.max(18, cornerRadius)}px` : '12px';
    const panelRadius = rounded ? `${Math.max(16, cornerRadius)}px` : '0px';
    const launcherShadow = `0 18px 42px ${withAlpha(
      launcherBackground,
      0.28,
      'rgba(15, 23, 42, 0.18)',
    )}`;
    const panelShadow = `0 28px 64px ${withAlpha(
      launcherBackground,
      0.18,
      'rgba(15, 23, 42, 0.22)',
    )}`;
    // Honour the owner's custom bubble icon; fall back to the built-in glyph.
    // The launcher previously always used the built-in one, so custom branding
    // applied inside the panel but never to the button people actually see.
    const launcherBrand = sanitizeBrand(chatbot.settings.brand);
    const launcherIcon =
      launcherBrand.bubbleIconUrl ||
      launcherBrand.logoUrl ||
      chatBubbleIcon(lightTheme.accentTextColor || '#ffffff');

    return `
(function () {
  var existing = document.getElementById('momicro-assist-${chatbot.id}');
  if (existing) return;
  var chatbotId = ${escapeScript(chatbot.id)};
  var iframeSrc = ${escapeScript(iframeBaseUrl)};
  // The host page can hand over the signed-in customer's auth token so the
  // assistant can answer with live account data (verified server-side once):
  // either data-realtime-token on the script tag or
  // window.MOMICRO_ASSIST_CONFIG = { realtimeToken: '...' }.
  var hostConfig = window.MOMICRO_ASSIST_CONFIG || {};
  var hostEntry = hostConfig[chatbotId] || {};
  var scriptTag = document.currentScript;
  var realtimeToken =
    (scriptTag && scriptTag.getAttribute('data-realtime-token')) ||
    hostConfig.realtimeToken ||
    hostEntry.realtimeToken ||
    '';
  if (realtimeToken) {
    iframeSrc += '&realtimeToken=' + encodeURIComponent(realtimeToken);
  }
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
  button.style.width = '58px';
  button.style.height = '58px';
  button.style.border = '0';
  button.style.borderRadius = ${escapeScript(launcherRadius)};
  button.style.padding = '0';
  button.style.cursor = 'pointer';
  button.style.background = ${escapeScript(launcherBackground)};
  button.style.boxShadow = ${escapeScript(launcherShadow)};
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  var prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) {
    button.style.transition =
      'transform 180ms ease-out, box-shadow 180ms ease-out';
    button.addEventListener('mouseenter', function () {
      button.style.transform = 'translateY(-2px)';
    });
    button.addEventListener('mouseleave', function () {
      button.style.transform = 'none';
    });
    button.addEventListener('mousedown', function () {
      button.style.transform = 'scale(.94)';
    });
    button.addEventListener('mouseup', function () {
      button.style.transform = 'translateY(-2px)';
    });
  }
  // Unread count, shown only while the panel is closed. Without it a human
  // reply that arrives on a collapsed widget is invisible until the visitor
  // happens to reopen it.
  var unread = document.createElement('span');
  unread.setAttribute('aria-hidden', 'true');
  unread.style.position = 'absolute';
  unread.style.top = '-4px';
  unread.style.right = '-4px';
  unread.style.minWidth = '20px';
  unread.style.height = '20px';
  unread.style.borderRadius = '999px';
  unread.style.background = '#e5484d';
  unread.style.color = '#fff';
  unread.style.fontSize = '11px';
  unread.style.fontWeight = '600';
  unread.style.lineHeight = '20px';
  unread.style.textAlign = 'center';
  unread.style.padding = '0 5px';
  unread.style.boxShadow = '0 2px 6px rgba(0,0,0,.25)';
  unread.style.transform = 'scale(0)';
  unread.style.display = 'none';
  if (!prefersReducedMotion) {
    unread.style.transition = 'transform 340ms cubic-bezier(.34,1.56,.64,1)';
  }
  button.style.position = 'relative';
  var unreadCount = 0;
  var setUnread = function (count) {
    unreadCount = Math.max(0, count || 0);
    if (!unreadCount) {
      unread.style.transform = 'scale(0)';
      unread.style.display = 'none';
      return;
    }
    unread.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    unread.style.display = 'block';
    // Next frame, so the transition has a start value to animate from.
    window.requestAnimationFrame(function () {
      unread.style.transform = 'scale(1)';
    });
  };
  var icon = document.createElement('img');
  icon.src = ${escapeScript(launcherIcon)};
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.width = '24px';
  icon.style.height = '24px';
  icon.style.objectFit = 'contain';
  button.appendChild(icon);
  button.appendChild(unread);
  var panel = document.createElement('div');
  panel.style.width = '420px';
  panel.style.maxWidth = 'calc(100vw - 18px)';
  panel.style.height = '0px';
  panel.style.overflow = 'hidden';
  panel.style.opacity = '0';
  panel.style.willChange = 'transform, opacity';
  panel.style.transform = ${escapeScript(
    `translateY(${closedTranslateY}) scale(0.98)`,
  )};
  panel.style.transformOrigin = ${escapeScript(transformOrigin)};
  panel.style.pointerEvents = 'none';
  panel.style.transition = prefersReducedMotion
    ? 'none'
    : 'opacity 200ms ease, transform 320ms cubic-bezier(.32,.72,0,1)';
  panel.style.borderRadius = ${escapeScript(panelRadius)};
  panel.style.border = '0';
  panel.style.background = 'transparent';
  panel.style.boxShadow = ${escapeScript(panelShadow)};
  panel.style.zIndex = '99999';
  var iframe = document.createElement('iframe');
  iframe.title = ${escapeScript(chatbot.settings.botName)};
  iframe.loading = 'lazy';
  // The src is assigned on first intent (hover/click) or when the browser goes
  // idle, whichever comes first. A lazy loading hint does not help here: the
  // wrapper is position:fixed and therefore always "in viewport".
  var iframeLoaded = false;
  var loadIframe = function () {
    if (iframeLoaded) return;
    iframeLoaded = true;
    iframe.src = iframeSrc;
  };
  iframe.style.width = '420px';
  iframe.style.maxWidth = 'calc(100vw - 32px)';
  iframe.style.height = '680px';
  iframe.style.maxHeight = 'calc(100vh - 96px)';
  iframe.style.border = '0';
  iframe.style.borderRadius = ${escapeScript(panelRadius)};
  iframe.style.background = ${escapeScript(surface)};
  iframe.style.zIndex = '99999';
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
    if (isOpen) setUnread(0);
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    // Height is toggled outright so the closed panel takes no space and cannot
    // intercept clicks; only transform and opacity are animated.
    panel.style.height = isOpen ? 'auto' : '0px';
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
  button.addEventListener('mouseenter', loadIframe);
  button.addEventListener('focus', loadIframe);
  button.addEventListener('click', function () {
    loadIframe();
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
    if (data.action === 'unread') {
      if (!isOpen) setUnread(data.count);
      return;
    }
    if (data.action === 'open') {
      setOpen(true);
    }
  });
  panel.appendChild(iframe);
  wrapper.appendChild(button);
  wrapper.appendChild(panel);

  var mount = function () {
    if (!document.body) return;
    document.body.appendChild(wrapper);
    // Warm the iframe once the page is done with its own work, so opening is
    // instant without competing for bandwidth during load.
    var warm = function () {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(loadIframe, { timeout: 4000 });
      } else {
        window.setTimeout(loadIframe, 2500);
      }
    };
    if (document.readyState === 'complete') warm();
    else window.addEventListener('load', warm, { once: true });
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  // SPA hook: report a login/logout without a page reload. Pass the signed-in
  // customer's token, or an empty value on logout.
  //   window.MoMicroAssist.setRealtimeToken('<token>');
  //   window.MoMicroAssist.setRealtimeToken('');
  window.MoMicroAssist = window.MoMicroAssist || {};
  window.MoMicroAssist.setRealtimeToken = function (token) {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'momicro-assist',
      chatbotId: chatbotId,
      action: 'realtime-token',
      token: token || ''
    }, '*');
  };
}());
`.trim();
  }

  renderIframe({ chatbot, baseUrl, preview = null }) {
    const websocketUrl = `${toWebsocketUrl(baseUrl)}/ws`;
    const lightTheme = sanitizeTheme(chatbot.settings.theme.light);
    const darkTheme = sanitizeTheme(chatbot.settings.theme.dark);
    const brand = sanitizeBrand(chatbot.settings.brand);
    // Optional per-mode overrides for suggestion chips. Only emitted when the
    // owner set a value, so blank falls back to the theme (via the var() default
    // in the .suggestion-chip rule).
    const suggestionVars = (theme) =>
      [
        theme.suggestionBackgroundColor &&
          `--suggestion-bg: ${theme.suggestionBackgroundColor};`,
        theme.suggestionTextColor &&
          `--suggestion-text: ${theme.suggestionTextColor};`,
        theme.suggestionBorderColor &&
          `--suggestion-border: ${theme.suggestionBorderColor};`,
      ]
        .filter(Boolean)
        .join(' ');
    const widgetLocation = chatbot.settings.widgetLocation || 'right';
    const launcherIsTop =
      widgetLocation === 'top-left' || widgetLocation === 'top-right';
    const launcherIsLeft =
      widgetLocation === 'left' || widgetLocation === 'top-left';
    const launcherVerticalEdge = launcherIsTop ? 'top' : 'bottom';
    const launcherHorizontalEdge = launcherIsLeft ? 'left' : 'right';
    const standaloneTransformOrigin = `${launcherIsTop ? 'top' : 'bottom'} ${
      launcherIsLeft ? 'left' : 'right'
    }`;
    const standaloneClosedShift = launcherIsTop ? '-18px' : '18px';
    const previewEnabled = Boolean(preview?.enabled);
    const previewMode = preview?.mode === 'dark' ? 'dark' : 'light';
    const rounded = chatbot.settings.rounded !== false;
    const cornerRadius = Number.isFinite(chatbot.settings.cornerRadius)
      ? Math.max(0, Math.min(40, chatbot.settings.cornerRadius))
      : 24;
    const baseRadius = rounded ? cornerRadius : 0;
    const launcherRadiusValue = rounded
      ? `${Math.max(18, cornerRadius)}px`
      : '12px';
    const radiusXl = `${baseRadius}px`;
    const radiusLg = `${Math.max(0, baseRadius - 6)}px`;
    const radiusMd = `${Math.max(0, baseRadius - 12)}px`;
    const radiusSm = `${Math.max(0, baseRadius - 14)}px`;
    const brandIconUrl = brand.logoUrl || brand.bubbleIconUrl;
    const launcherIcon = chatBubbleIcon(
      lightTheme.accentTextColor || '#ffffff',
    );
    const closeSvg = closeIcon(lightTheme.accentTextColor || '#111111');
    // Hand the client the sanitized settings, not the raw ones, so any future
    // consumer of runtime.chatbot inherits the same guarantees as the template.
    const payload = {
      chatbot: {
        ...chatbot,
        settings: {
          ...chatbot.settings,
          brand,
          theme: { light: lightTheme, dark: darkTheme },
        },
      },
      apiBaseUrl: baseUrl,
      websocketUrl,
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
<html lang="${escapeAttr(chatbot.settings.defaultLanguage || 'english')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(chatbot.settings.title || chatbot.settings.botName)}</title>
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
      --launcher-bg: ${lightTheme.launcherBackgroundColor || lightTheme.accentColor};
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
      ${suggestionVars(lightTheme)}
      --logo-bg: ${brand.logoBackgroundColor || lightTheme.surfaceColor};
      --input-bg: ${lightTheme.inputBackgroundColor || lightTheme.surfaceColor};
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
      min-height: 100dvh;
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
      height: 100dvh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: var(--surface);
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
      ${suggestionVars(lightTheme)}
      --logo-bg: ${brand.logoBackgroundColor || lightTheme.surfaceColor};
      --launcher-bg: ${lightTheme.launcherBackgroundColor || lightTheme.accentColor};
      --input-bg: ${lightTheme.inputBackgroundColor || lightTheme.surfaceColor};
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
      ${suggestionVars(darkTheme)}
      --logo-bg: ${brand.logoBackgroundColor || darkTheme.surfaceColor};
      --launcher-bg: ${darkTheme.launcherBackgroundColor || darkTheme.accentColor};
      --input-bg: ${darkTheme.inputBackgroundColor || darkTheme.surfaceColor};
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
      ${launcherHorizontalEdge}: 18px;
      ${launcherVerticalEdge}: 18px;
      z-index: 10;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      border: 0;
      border-radius: ${launcherRadiusValue};
      padding: 0;
      background: var(--launcher-bg);
      box-shadow: var(--shadow);
      cursor: pointer;
    }
    body.standalone {
      background: transparent;
    }
    body.standalone .shell {
      position: fixed;
      ${launcherHorizontalEdge}: 18px;
      ${launcherVerticalEdge}: 88px;
      width: min(420px, calc(100vw - 36px));
      height: min(680px, calc(100vh - 106px));
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-soft);
      box-shadow: var(--shadow);
      overflow: hidden;
      z-index: 9;
      transform-origin: ${standaloneTransformOrigin};
      transition: opacity 200ms ease, transform 240ms ease;
    }
    body.standalone.widget-hidden .shell {
      display: grid;
      opacity: 0;
      transform: translateY(${standaloneClosedShift}) scale(0.98);
      pointer-events: none;
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
    .standalone-icon {
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-copy {
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: 16px;
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
    .icon-button {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 0;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .icon-button img {
      width: 16px;
      height: 16px;
      display: block;
      margin: auto;
    }
    .messages {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--surface);
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
    .message.action {
      max-width: 100%;
      align-self: stretch;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .human-request-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.72);
    }
    .human-request-copy {
      color: var(--text-soft);
      font-size: 12px;
      line-height: 1.5;
    }
    .human-request-button {
      border: 0;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      padding: 8px 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .composer {
      padding: 14px;
      border-top: 1px solid var(--border);
      background: var(--surface);
    }
    .composer.locked {
      opacity: 0.7;
    }
    .suggestions {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 10px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .suggestions::-webkit-scrollbar { display: none; }
    .suggestions:empty { display: none; }
    .suggestion-chip {
      flex: 0 0 auto;
      white-space: nowrap;
      border: 1px solid var(--suggestion-border, var(--border-soft));
      background: var(--suggestion-bg, var(--surface));
      color: var(--suggestion-text, inherit);
      border-radius: 999px;
      padding: 7px 13px;
      font: inherit;
      font-size: 13px;
      line-height: 1.2;
      cursor: pointer;
      transition: background 150ms ease, border-color 150ms ease;
    }
    .suggestion-chip:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    textarea {
      width: 100%;
      height: var(--input-height, 42px);
      min-height: var(--input-height, 42px);
      max-height: var(--input-height, 42px);
      resize: none;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      background: var(--input-bg);
      color: inherit;
      font: inherit;
      box-shadow: none;
      outline: none;
      overflow: hidden;
      white-space: nowrap;
    }
    textarea:focus {
      outline: none;
      border-color: var(--border-soft);
      box-shadow: none;
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
      display: flex;
      align-items: center;
      justify-content: center;
    }
    button.send svg {
      width: 20px;
      height: 20px;
    }
    .composer-meta {
      margin-top: 10px;
      text-align: center;
      color: var(--text-soft);
      font-size: 11px;
      line-height: 1.4;
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
      color: var(--text);
    }
    .field input {
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font: inherit;
      color: inherit;
      background: var(--input-bg);
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
      .message {
        max-width: 92%;
      }
      .human-request-card {
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
        --launcher-bg: ${darkTheme.launcherBackgroundColor || darkTheme.accentColor};
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
        ${suggestionVars(darkTheme)}
        --logo-bg: ${brand.logoBackgroundColor || darkTheme.surfaceColor};
        --input-bg: ${darkTheme.inputBackgroundColor || darkTheme.surfaceColor};
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
    /* --- motion system -------------------------------------------------- */
    /* Every animation below is compositor-only (transform/opacity) and lives
       behind no-preference, so reduced-motion is the default rather than an
       opt-out we might forget. */
    .connection-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      font-size: 12px;
      color: var(--text-soft);
      background: var(--accent-fog);
      border-top: 1px solid var(--border-soft);
      opacity: 0;
      transform: translateY(-6px);
    }
    .connection-bar.is-visible { opacity: 1; transform: none; }
    .connection-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }
    .jump-latest {
      position: absolute;
      left: 50%;
      bottom: 96px;
      transform: translateX(-50%) translateY(6px);
      z-index: 5;
      border: 1px solid var(--border-soft);
      background: var(--surface);
      color: var(--text);
      border-radius: 999px;
      padding: 7px 14px;
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
      opacity: 0;
      pointer-events: none;
    }
    .jump-latest.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    .message-content a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .message.message-error {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      border-left: 3px solid var(--accent);
    }
    .message-retry {
      border: 1px solid var(--border-soft);
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12.5px;
      border-radius: var(--radius-sm);
      padding: 5px 11px;
      cursor: pointer;
    }
    .typing-dots {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 12px;
    }
    .typing-dots i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.4;
    }
    @media (prefers-reduced-motion: no-preference) {
      .connection-bar {
        transition: opacity 240ms ease, transform 240ms ease;
      }
      .jump-latest {
        transition: opacity 200ms ease, transform 200ms cubic-bezier(.22,1,.36,1);
      }
      .message-enter {
        animation: momicro-message-in 220ms cubic-bezier(.22, 1, .36, 1) both;
      }
      .message-retry {
        transition: background 160ms ease, border-color 160ms ease;
      }
      .message-retry:hover { background: var(--accent-soft); }
      .typing-dots i {
        animation: momicro-typing 1.2s ease-in-out infinite;
      }
      .typing-dots i:nth-child(2) { animation-delay: .16s; }
      .typing-dots i:nth-child(3) { animation-delay: .32s; }
      .message.streaming .message-content::after {
        animation: momicro-widget-caret 0.9s steps(1, end) infinite;
      }
    }
    @keyframes momicro-message-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes momicro-typing {
      0%, 60%, 100% { opacity: .32; transform: translateY(0); }
      30%           { opacity: .9;  transform: translateY(-3px); }
    }
    @media (max-width: 520px) {
      .jump-latest { bottom: 108px; }
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
  <button id="standaloneLauncher" class="standalone-launcher" type="button" hidden data-preview-part="launcher" aria-label="${escapeAttr(chatbot.settings.botName)}">
    <span class="standalone-icon">
      <img src="${launcherIcon}" alt="" aria-hidden="true" />
    </span>
  </button>
  <div id="shell" class="shell" role="dialog" aria-modal="false" aria-label="${escapeAttr(chatbot.settings.title || chatbot.settings.botName)}">
    <header class="header" data-preview-part="header">
      <div class="header-row">
        <div class="brand-lockup">
          <div class="brand-mark">
            ${
              brandIconUrl
                ? `<img src="${brandIconUrl}" alt="${escapeAttr(chatbot.settings.botName)} logo" />`
                : chatbot.settings.botName.slice(0, 1).toUpperCase()
            }
          </div>
          <div class="brand-copy">
            <h1 id="previewBotName" class="title"${previewEnabled ? ' data-preview-editable="true" data-preview-field="botName" contenteditable="plaintext-only"' : ''}>${escapeHtml(chatbot.settings.botName)}</h1>
          </div>
        </div>
        <button id="hideChat" class="icon-button" type="button" aria-label="Hide chat"><img src="${closeSvg}" alt="" aria-hidden="true" /></button>
      </div>
      <div id="connectionBar" class="connection-bar" role="status" aria-live="polite" hidden>
        <span class="connection-dot"></span><span id="connectionText">Reconnecting…</span>
      </div>
    </header>
    <main id="messages" class="messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation" data-preview-part="canvas"></main>
    <button id="jumpLatest" class="jump-latest" type="button" hidden>New messages &darr;</button>
    <footer id="composer" class="composer" data-preview-part="composer">
      <div id="suggestions" class="suggestions" data-preview-part="suggestions"></div>
      <div class="row">
        <textarea id="input" rows="1" placeholder="${escapeAttr(chatbot.settings.inputPlaceholder)}"></textarea>
        <button id="send" class="send" type="button"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M14.76 12H6.832m0 0c0-.275-.057-.55-.17-.808L4.285 5.814c-.76-1.72 1.058-3.442 2.734-2.591L20.8 10.217c1.46.74 1.46 2.826 0 3.566L7.02 20.777c-1.677.851-3.495-.872-2.735-2.591l2.375-5.378A2 2 0 0 0 6.83 12"/></svg></button>
      </div>
      <div class="composer-meta">
        <span>Powered by MoMicro</span>
      </div>
    </footer>
  </div>
  ${previewEnabled ? '</div>' : ''}
  <div id="overlay" class="overlay">
    <div class="card" data-preview-part="leadForm">
      <button id="closeLead" type="button" aria-label="${escapeAttr(chatbot.settings.leadsFormSkipLabel)}" title="${escapeAttr(chatbot.settings.leadsFormSkipLabel)}" style="position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:inherit;opacity:.55;padding:2px 6px;display:none">&times;</button>
      <h2>${escapeHtml(chatbot.settings.leadsFormTitle)}</h2>
      <p>${escapeHtml(chatbot.settings.leadsFormDescription)}</p>
      <form id="leadForm"></form>
      <div class="actions">
        <button id="cancelLead" type="button" class="ghost">${escapeHtml(chatbot.settings.leadsFormSkipLabel)}</button>
        <button id="submitLead" type="button" class="primary">${escapeHtml(chatbot.settings.leadsFormSubmitLabel)}</button>
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
      const closeLead = document.getElementById('closeLead');
      const hideChat = document.getElementById('hideChat');
      const standaloneLauncher = document.getElementById('standaloneLauncher');
      const composer = document.getElementById('composer');
      const defaultPlaceholder =
        runtime.chatbot.settings.inputPlaceholder || 'Write a message...';
      const requestedInputHeight = Number.parseInt(
        new URLSearchParams(window.location.search).get('inputHeight') || '',
        10,
      );
      let realtimeToken =
        new URLSearchParams(window.location.search).get('realtimeToken') || '';
      const configuredInputHeight = Number.parseInt(
        runtime.chatbot.settings.inputHeight || '',
        10,
      );
      const inputHeight = Number.isInteger(requestedInputHeight)
        ? requestedInputHeight
        : configuredInputHeight;
      const shell = document.getElementById('shell');
      const connectionBar = document.getElementById('connectionBar');
      const connectionText = document.getElementById('connectionText');
      const jumpLatest = document.getElementById('jumpLatest');
      let socket = null;
      // Safari ITP and Firefox TCP partition storage in cross-site iframes, and
      // in the strictest cases block it outright. Fall back to an in-memory
      // store for the life of the page rather than letting the chat fail.
      const memoryStore = {};
      const safeStorage = {
        get: function (key) {
          try {
            return localStorage.getItem(key) || memoryStore[key] || '';
          } catch (error) {
            return memoryStore[key] || '';
          }
        },
        set: function (key, value) {
          memoryStore[key] = value;
          try {
            localStorage.setItem(key, value);
          } catch (error) {
            // Partitioned or disabled; the in-memory copy above still works.
          }
        },
        remove: function (key) {
          delete memoryStore[key];
          try {
            localStorage.removeItem(key);
          } catch (error) {
            // Nothing to do.
          }
        }
      };
      let widgetToken = safeStorage.get(storageKey);
      let queuedMessage = '';
      let currentConversation = null;
      const messageNodes = new Map();
      const streamStates = new Map();
      let humanPromptDismissed = false;

      if (Number.isInteger(inputHeight) && inputHeight >= 36 && inputHeight <= 72) {
        document.documentElement.style.setProperty('--input-height', inputHeight + 'px');
      }

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

        // In preview, reveal the lead overlay only while it is the selected part
        // so owners can style it; every other part hides it again.
        if (previewEnabled) {
          overlay.style.display = part === 'leadForm' ? 'flex' : 'none';
        }

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
        if (!hidden) clearUnread();
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

      // Unread tracking for the collapsed launcher. Counted only while the panel
      // is hidden, and cleared the moment it is shown again.
      let unreadForVisitor = 0;
      const publishUnread = () => {
        if (!isEmbedded()) return;
        window.parent.postMessage(
          {
            type: 'momicro-assist',
            action: 'unread',
            chatbotId: runtime.chatbot.id,
            count: unreadForVisitor,
          },
          '*',
        );
      };

      const noteIncomingMessage = () => {
        if (!document.body.classList.contains('widget-hidden')) return;
        unreadForVisitor += 1;
        publishUnread();
      };

      const clearUnread = () => {
        if (!unreadForVisitor) return;
        unreadForVisitor = 0;
        publishUnread();
      };

      const prefersReducedMotion = () =>
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // --- connection + error surface --------------------------------------
      const setConnectionState = (state) => {
        if (!connectionBar) return;
        if (state === 'online') {
          connectionBar.hidden = true;
          connectionBar.classList.remove('is-visible');
          return;
        }
        if (connectionText) {
          connectionText.textContent =
            state === 'offline' ? 'Offline' : 'Reconnecting…';
        }
        connectionBar.hidden = false;
        connectionBar.classList.add('is-visible');
      };

      let inlineErrorNode = null;
      const showInlineError = (text) => {
        if (inlineErrorNode && inlineErrorNode.parentNode) {
          inlineErrorNode.remove();
        }
        const wasPinned =
          messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
        inlineErrorNode = document.createElement('div');
        inlineErrorNode.className = 'message system message-error message-enter';
        inlineErrorNode.setAttribute('role', 'alert');

        const copy = document.createElement('div');
        copy.className = 'message-content';
        copy.textContent = text;
        inlineErrorNode.appendChild(copy);

        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'message-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => {
          inlineErrorNode?.remove();
          inlineErrorNode = null;
          connectSocket();
        });
        inlineErrorNode.appendChild(retry);

        messages.appendChild(inlineErrorNode);
        if (wasPinned) messages.scrollTop = messages.scrollHeight;
      };

      // --- typing indicator -------------------------------------------------
      // Shown the moment a message is sent, so the gap between send and the
      // model's first token is never a static screen. It is the same node the
      // reply lands in, so the bubble never jumps.
      let typingNode = null;
      const showTypingIndicator = () => {
        if (typingNode) return;
        const wasPinned =
          messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
        typingNode = document.createElement('div');
        typingNode.className = 'message assistant typing-bubble message-enter';
        typingNode.setAttribute('aria-label', 'Assistant is typing');
        typingNode.innerHTML =
          '<span class="typing-dots"><i></i><i></i><i></i></span>';
        messages.appendChild(typingNode);
        if (wasPinned) messages.scrollTop = messages.scrollHeight;
      };

      const hideTypingIndicator = () => {
        if (!typingNode) return;
        typingNode.remove();
        typingNode = null;
      };

      // --- scrolling --------------------------------------------------------
      // Stick to the bottom only while the visitor is already there. Reading an
      // earlier message must not be interrupted by an incoming reply.
      const STICK_THRESHOLD_PX = 48;

      const isPinnedToBottom = () =>
        messages.scrollHeight - messages.scrollTop - messages.clientHeight <
        STICK_THRESHOLD_PX;

      const setJumpVisible = (visible) => {
        if (!jumpLatest) return;
        jumpLatest.hidden = !visible;
        jumpLatest.classList.toggle('is-visible', Boolean(visible));
      };

      const scrollMessagesToBottom = (smooth) => {
        if (smooth && !prefersReducedMotion()) {
          messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
        } else {
          messages.scrollTop = messages.scrollHeight;
        }
        setJumpVisible(false);
      };

      // Callers decide whether to follow BEFORE they mutate the DOM, so we never
      // read layout in the same frame we wrote to it.
      const followIfPinned = (wasPinned) => {
        if (wasPinned) scrollMessagesToBottom(false);
        else setJumpVisible(true);
      };

      messages.addEventListener('scroll', () => {
        if (isPinnedToBottom()) setJumpVisible(false);
      });

      if (jumpLatest) {
        jumpLatest.addEventListener('click', () => scrollMessagesToBottom(true));
      }

      const clearStreamStates = () => {
        streamStates.forEach((state) => {
          if (state.raf) window.cancelAnimationFrame(state.raf);
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

      const hasVisitorMessage = (conversation = currentConversation) =>
        Boolean(
          (conversation?.messages || []).some(
            (message) => message.authorType === 'visitor',
          ),
        );

      const shouldShowHumanPrompt = () =>
        !previewEnabled &&
        runtime.chatbot.settings.ai?.enabled === true &&
        !humanPromptDismissed &&
        !hasVisitorMessage();

      const renderHumanPrompt = () => {
        const existing = document.getElementById('humanRequestPrompt');
        if (!shouldShowHumanPrompt()) {
          existing?.remove();
          return;
        }
        if (existing) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'humanRequestPrompt';
        wrapper.className = 'message action';

        const card = document.createElement('div');
        card.className = 'human-request-card';

        const copy = document.createElement('div');
        copy.className = 'human-request-copy';
        copy.textContent = 'Prefer a real person? I can forward this conversation to a human teammate.';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'human-request-button';
        button.textContent = 'Request the human';
        button.addEventListener('click', () => {
          humanPromptDismissed = true;
          input.value = 'I would like to speak with a human.';
          renderHumanPrompt();
          dispatchMessage();
        });

        card.appendChild(copy);
        card.appendChild(button);
        wrapper.appendChild(card);
        messages.appendChild(wrapper);
        scrollMessagesToBottom();
      };

      // Build real anchor nodes from matched URL ranges. Deliberately DOM
      // construction rather than innerHTML: a support assistant needs to hand
      // over clickable links without reopening an injection surface.
      const URL_PATTERN = /\\b((?:https?:\\/\\/|www\\.)[^\\s<>()"']+[^\\s<>()"'.,;:!?])/gi;

      const renderRichText = (target, text) => {
        target.textContent = '';
        const value = String(text || '');
        let cursor = 0;
        let match;
        URL_PATTERN.lastIndex = 0;

        while ((match = URL_PATTERN.exec(value)) !== null) {
          if (match.index > cursor) {
            target.appendChild(
              document.createTextNode(value.slice(cursor, match.index)),
            );
          }
          const raw = match[0];
          const href = /^www\\./i.test(raw) ? 'https://' + raw : raw;
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer nofollow';
          link.textContent = raw;
          target.appendChild(link);
          cursor = match.index + raw.length;
        }

        if (cursor < value.length) {
          target.appendChild(document.createTextNode(value.slice(cursor)));
        }
      };

      const createMessageNode = (message, options = {}) => {
        const wasPinned = isPinnedToBottom();
        const node = document.createElement('div');
        node.className = 'message ' + (message.authorType || 'system');
        node.classList.toggle('streaming', Boolean(options.streaming));
        if (!options.skipEnter) node.classList.add('message-enter');
        node.setAttribute(
          'data-preview-part',
          message.authorType === 'visitor' ? 'visitorBubble' : 'assistantBubble',
        );

        const contentNode = document.createElement('div');
        contentNode.className = 'message-content';

        // While streaming we append into a bare text node so each chunk is an
        // O(1) append instead of rewriting the whole message. Links are resolved
        // once the message settles.
        let tailNode = null;
        if (options.streaming) {
          tailNode = document.createTextNode(message.content || '');
          contentNode.appendChild(tailNode);
        } else {
          renderRichText(contentNode, message.content || '');
        }

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
            tailNode,
          });
        }

        if (options.keepScroll) followIfPinned(wasPinned);
        else scrollMessagesToBottom(false);

        return {
          node,
          contentNode,
          tailNode,
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

        const wasPinned = isPinnedToBottom();
        const streaming = Boolean(options.streaming);

        // Toggle only what changed. Reassigning className here used to wipe every
        // other class on the node — including the entrance animation — on each
        // streamed chunk.
        existing.node.classList.toggle('streaming', streaming);

        if (streaming) {
          if (!existing.tailNode) {
            existing.contentNode.textContent = '';
            existing.tailNode = document.createTextNode('');
            existing.contentNode.appendChild(existing.tailNode);
          }
          existing.tailNode.data = message.content || '';
        } else {
          existing.tailNode = null;
          renderRichText(existing.contentNode, message.content || '');
        }

        if (options.keepScroll) followIfPinned(wasPinned);
        else scrollMessagesToBottom(false);
        return existing;
      };

      const addMessage = (authorType, content) => {
        createMessageNode({
          authorType,
          content,
        });
      };

      // --- streaming --------------------------------------------------------
      // One requestAnimationFrame loop per streaming message. It drains
      // characters (not words) at a rate derived from how far behind the display
      // is, so it speeds up when the model outruns it and coasts when the model
      // pauses — instead of the fixed 28ms-per-word timer, which was too slow for
      // a fast model and stuttered on a slow one.
      const STREAM_CHARS_MIN = 1;
      const STREAM_CHARS_MAX = 28;
      const STREAM_TARGET_FRAMES = 16; // catch up in roughly 260ms

      const releaseStreamState = (messageId, state) => {
        if (state.raf) window.cancelAnimationFrame(state.raf);
        state.raf = null;

        const record = messageNodes.get(messageId);
        if (record) {
          record.node.classList.remove('streaming');
          // Re-render once, now that the text is final, so URLs become links.
          const settled = findConversationMessage(messageId);
          if (settled && !state.failed) {
            record.tailNode = null;
            renderRichText(record.contentNode, settled.content || '');
          }
        }

        if (state.failed && !findConversationMessage(messageId)?.content) {
          record?.node.remove();
          messageNodes.delete(messageId);
          removeConversationMessage(messageId);
        }

        streamStates.delete(messageId);
      };

      // Only ever called once the stream is genuinely finished. An empty buffer
      // mid-stream is a pause, not an ending — treating it as one is what made
      // the caret flicker off every time the model hesitated.
      const settleStreamState = (messageId) => {
        const state = streamStates.get(messageId);
        if (!state) return;
        if (!state.completed && !state.failed) return;
        if (state.shown < state.buffer.length) return;
        releaseStreamState(messageId, state);
      };

      const streamTick = (messageId) => {
        const state = streamStates.get(messageId);
        if (!state) return;

        const message = findConversationMessage(messageId);
        if (!message) {
          releaseStreamState(messageId, state);
          return;
        }

        const remaining = state.buffer.length - state.shown;

        if (!remaining) {
          if (state.completed || state.failed) {
            settleStreamState(messageId);
            return;
          }
          // Idle between chunks — keep the loop alive so the next chunk starts
          // rendering on the very next frame instead of after a fresh delay.
          state.raf = window.requestAnimationFrame(() => streamTick(messageId));
          return;
        }

        const rate = Math.min(
          STREAM_CHARS_MAX,
          Math.max(STREAM_CHARS_MIN, Math.ceil(remaining / STREAM_TARGET_FRAMES)),
        );

        // Decide whether to follow before touching the DOM, so the append and
        // the scroll write happen without a layout read between them.
        const wasPinned = isPinnedToBottom();

        const nextShown = Math.min(state.buffer.length, state.shown + rate);
        const appended = state.buffer.slice(state.shown, nextShown);
        state.shown = nextShown;
        message.content = state.buffer.slice(0, state.shown);

        // Append to the tail text node rather than rewriting the whole message.
        const record = messageNodes.get(messageId);
        if (record && record.tailNode) {
          record.tailNode.appendData(appended);
        } else {
          syncMessageNode(message, { streaming: true, keepScroll: true });
        }

        followIfPinned(wasPinned);

        state.raf = window.requestAnimationFrame(() => streamTick(messageId));
      };

      const ensureStreamState = (messageId) => {
        let state = streamStates.get(messageId);
        if (!state) {
          state = {
            buffer: '',
            shown: 0,
            raf: null,
            completed: false,
            failed: false,
          };
          streamStates.set(messageId, state);
        }
        return state;
      };

      const startStreamingMessage = (message) => {
        hideTypingIndicator();
        const entry = upsertConversationMessage({
          ...message,
          content: message.content || '',
        });
        syncMessageNode(entry, {
          streaming: true,
        });
        const state = ensureStreamState(message.id);
        state.buffer = entry.content || '';
        state.shown = state.buffer.length;
        if (!state.raf) {
          state.raf = window.requestAnimationFrame(() => streamTick(message.id));
        }
      };

      const queueStreamingChunk = (messageId, chunk) => {
        hideTypingIndicator();
        const state = ensureStreamState(messageId);
        state.buffer += chunk;
        if (!state.raf) {
          state.raf = window.requestAnimationFrame(() => streamTick(messageId));
        }
      };

      const completeStreamingMessage = (messageId) => {
        const state = streamStates.get(messageId);
        hideTypingIndicator();
        if (!state) {
          const record = messageNodes.get(messageId);
          if (record) record.node.classList.remove('streaming');
          return;
        }

        state.completed = true;
        settleStreamState(messageId);
      };

      const failStreamingMessage = (messageId) => {
        hideTypingIndicator();
        const state = ensureStreamState(messageId);
        state.failed = true;
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
        renderHumanPrompt();
        applyConversationState(conversation);
      };

      // The composer is a one-row textarea that never grew, so a multi-sentence
      // message was typed through a single visible line.
      const MAX_INPUT_ROWS_PX = 132;
      const autoGrowInput = () => {
        input.style.height = 'auto';
        const next = Math.min(input.scrollHeight, MAX_INPUT_ROWS_PX);
        input.style.height = next + 'px';
        input.style.overflowY =
          input.scrollHeight > MAX_INPUT_ROWS_PX ? 'auto' : 'hidden';
      };

      const applyComposerState = (disabled, placeholder) => {
        input.disabled = disabled;
        send.disabled = disabled;
        input.placeholder = placeholder || defaultPlaceholder;
        composer.classList.toggle('locked', disabled);
      };

      const applyConversationState = (conversation) => {
        currentConversation = conversation;
        const status = conversation?.status || 'active';

        if (status === 'closed') {
          applyComposerState(true, 'This chat is closed');
          safeStorage.remove(storageKey);
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

      // Visitors must never see a raw server string. Map what we know to plain
      // language and keep the detail in the console for support.
      const FRIENDLY_ERRORS = {
        conversation_closed: 'This conversation has ended. Send a message to start a new one.',
        rate_limited: 'You are sending messages a little too quickly. One moment.',
        unauthorized: 'This chat session expired. Reloading the page will start a new one.'
      };

      const handleSocketError = async (packet) => {
        var code = (packet && packet.payload && packet.payload.code) || '';
        var detail = (packet && packet.payload && packet.payload.message) || '';
        if (window.console && console.warn) {
          console.warn('[momicro] ' + (code || 'error') + ': ' + detail);
        }
        showInlineError(FRIENDLY_ERRORS[code] || 'Something went wrong. Please try again.');
      };

      // --- transport resilience -------------------------------------------
      // The socket is expected to drop: laptops sleep, networks change, and the
      // edge closes idle connections after ~100s. Reconnect with backoff, keep
      // the connection warm with a ping, and re-render the conversation on every
      // successful reconnect so anything sent while we were away shows up.
      var reconnectAttempt = 0;
      var reconnectTimer = null;
      var heartbeatTimer = null;
      var manuallyClosed = false;
      var HEARTBEAT_MS = 30000;

      const clearHeartbeat = () => {
        if (heartbeatTimer) {
          window.clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      const startHeartbeat = () => {
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          try {
            socket.send(JSON.stringify({ action: 'ping', payload: {} }));
          } catch (error) {
            // A failed send means the socket is already gone; let close handle it.
          }
        }, HEARTBEAT_MS);
      };

      const scheduleReconnect = () => {
        if (manuallyClosed || !widgetToken || reconnectTimer) return;
        // 1s, 2s, 4s ... capped at 30s, with jitter so many widgets recovering
        // from the same outage do not stampede the server together.
        var base = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
        var delay = base * (0.7 + Math.random() * 0.6);
        reconnectAttempt += 1;
        setConnectionState('reconnecting');
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectSocket();
        }, delay);
      };

      const connectSocket = () => {
        if (!widgetToken) return;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          return;
        }

        manuallyClosed = false;
        socket = new WebSocket(runtime.websocketUrl);
        socket.addEventListener('open', () => {
          reconnectAttempt = 0;
          setConnectionState('online');
          startHeartbeat();
          socket.send(JSON.stringify({
            action: 'widget.authenticate',
            payload: {
              token: widgetToken,
              // Always sent: a value verifies the visitor, an empty string
              // tells the server the visitor is logged out (clears identity).
              realtimeToken: realtimeToken || ''
            }
          }));
        });
        socket.addEventListener('message', async (event) => {
          let packet;
          try {
            packet = JSON.parse(event.data);
          } catch (error) {
            // A frame we cannot parse is not worth tearing the handler down for.
            return;
          }
          if (!packet || typeof packet !== 'object') return;
          if (packet.event === 'pong') return;

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
          if (message.authorType === 'visitor') {
            humanPromptDismissed = true;
            renderHumanPrompt();
          } else {
            noteIncomingMessage();
          }
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
          clearHeartbeat();
          scheduleReconnect();
        });
        socket.addEventListener('error', () => {
          // close always follows error; reconnect is scheduled there.
          setConnectionState('reconnecting');
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
          return;
        }

        // Host page reports a login/logout without a reload (SPA): adopt the
        // new token and re-run the auth handshake so the server verifies the
        // new identity or clears the old one.
        if (data.action === 'realtime-token') {
          realtimeToken = String(data.token || '');
          if (socket && socket.readyState === WebSocket.OPEN && widgetToken) {
            socket.send(JSON.stringify({
              action: 'widget.authenticate',
              payload: {
                token: widgetToken,
                realtimeToken: realtimeToken || ''
              }
            }));
          } else if (widgetToken) {
            connectSocket();
          }
        }
      });

      // Lead form configuration drives whether visitors must (or can) leave
      // their details before chatting.
      var leadFields = runtime.chatbot.settings.leadsForm || [];
      var hasLeadFields = leadFields.length > 0;
      var hasRequiredLead = leadFields.some(function (field) {
        return field && field.required;
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
            realtimeToken: realtimeToken || ''
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Failed to create session');
        widgetToken = payload.token;
        safeStorage.set(storageKey, widgetToken);
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
        autoGrowInput();
        // Immediate, local feedback. The gap before the first token covers
        // retrieval and model start-up, and must never be a static screen.
        showTypingIndicator();
      };

      const hideSuggestions = () => {
        if (suggestions) suggestions.innerHTML = '';
      };

      const renderSuggestions = () => {
        if (!suggestions) return;
        const items = (runtime.chatbot.settings.suggestedMessages || []).filter(
          (item) => typeof item === 'string' && item.trim(),
        );
        suggestions.innerHTML = '';
        items.forEach((text) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'suggestion-chip';
          chip.textContent = text;
          chip.addEventListener('click', () => {
            input.value = text;
            dispatchMessage();
          });
          suggestions.appendChild(chip);
        });
      };

      const dispatchMessage = async () => {
        const text = input.value.trim();
        if (!text) return;
        if (currentConversation && currentConversation.status === 'closed') return;
        hideSuggestions();

        if (!widgetToken) {
          queuedMessage = text;
          // No lead fields configured: start the conversation straight away,
          // never showing a lead overlay.
          if (!hasLeadFields) {
            try {
              await createSession();
            } catch (error) {
              showInlineError('We could not start the chat. Please try again.');
              if (window.console && console.warn) console.warn('[momicro] session', error);
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
      send.addEventListener('click', dispatchMessage);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          dispatchMessage();
        }
      });
      input.addEventListener('input', autoGrowInput);
      autoGrowInput();

      // Escape closes the panel from anywhere inside it, and focus is kept in
      // the dialog while it is open.
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !document.body.classList.contains('widget-hidden')) {
          event.preventDefault();
          requestHideWidget();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusables = shell.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      submitLead.addEventListener('click', async () => {
        try {
          await createSession();
        } catch (error) {
          showInlineError('We could not start the chat. Please try again.');
              if (window.console && console.warn) console.warn('[momicro] session', error);
        }
      });
      cancelLead.addEventListener('click', async () => {
        // No required fields: dismissing skips the form and keeps the chat going.
        // Required fields present: dismissing cancels and drops the queued message.
        if (!hasRequiredLead) {
          try {
            await createSession();
          } catch (error) {
            showInlineError('We could not start the chat. Please try again.');
              if (window.console && console.warn) console.warn('[momicro] session', error);
          }
          return;
        }
        overlay.style.display = 'none';
        queuedMessage = '';
      });

      // When the lead form has no required fields, let the visitor dismiss it
      // with an "×" and keep chatting without leaving any details.
      const leadCard = overlay.querySelector('.card');
      if (leadCard) leadCard.style.position = 'relative';
      if (closeLead) {
        if (hasRequiredLead) {
          closeLead.style.display = 'none';
        } else {
          closeLead.style.display = '';
          closeLead.addEventListener('click', async () => {
            try {
              await createSession();
            } catch (error) {
              showInlineError('We could not start the chat. Please try again.');
              if (window.console && console.warn) console.warn('[momicro] session', error);
            }
          });
        }
      }

      if (widgetToken) {
        connectSocket();
      } else {
        addMessage('system', runtime.chatbot.settings.initialMessage);
        applyComposerState(false, defaultPlaceholder);
      }

      // The iframe page IS the widget: by default it floats its own launcher,
      // keeps the chat collapsed and transparent until opened, and animates
      // open/close — exactly like the install script's panel. The only consumer
      // that wants the bare chat (no launcher) is the install script, which
      // wraps its own launcher/panel and opts out with embedded=1. Preview mode
      // also stays non-standalone.
      const standalone =
        !previewEnabled &&
        new URLSearchParams(window.location.search).get('embedded') !== '1';
      if (standalone) {
        document.body.classList.add('standalone');
        // Keep the iframe itself transparent. The document declares
        // color-scheme: light dark, so on a visitor whose OS is in dark mode
        // the browser would paint an opaque dark canvas behind the transparent
        // body (the "black background"). Forcing the root transparent with a
        // neutral color-scheme lets the page composite over the host instead.
        document.documentElement.style.background = 'transparent';
        document.documentElement.style.colorScheme = 'normal';
      }
      setWidgetHidden(standalone);
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
  var current =
    document.currentScript ||
    document.querySelector(
      'script[src*=' + JSON.stringify(${escapeScript(`/chat/dashboard/script/${chatbotId}`)}) + ']'
    );
  var globalConfig = window.MOMICRO_ASSIST_DASHBOARD_CONFIG;
  var dashboardConfig =
    globalConfig && typeof globalConfig === 'object'
      ? globalConfig[${escapeScript(chatbotId)}] || globalConfig
      : null;
  var selector =
    (current && current.getAttribute('data-selector')) ||
    (dashboardConfig && dashboardConfig.selector) ||
    '';
  var height =
    (current && current.getAttribute('data-height')) ||
    (dashboardConfig && dashboardConfig.height) ||
    '760px';
  var iframeSrc = ${escapeScript(iframeBaseUrl)};
  var host = selector ? document.querySelector(selector) : null;
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
  }
  var iframe = document.createElement('iframe');
  iframe.id = 'momicro-assist-dashboard-${chatbotId}';
  iframe.src = iframeSrc;
  iframe.title = 'MoMicro Dashboard';
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
  <title>MoMicro Dashboard</title>
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
    .login-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(20, 184, 166, 0.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.12), transparent 24%),
        var(--bg);
    }
    .login-overlay[hidden] { display: none; }
    .login-card {
      width: 100%;
      max-width: 380px;
      background: var(--surface-strong);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .login-head { display: flex; flex-direction: column; gap: 4px; }
    .login-head h2 { margin: 0; font-size: 20px; font-weight: 600; }
    .login-sub { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
    .field input {
      height: 44px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0 14px;
      font-size: 15px;
      color: var(--text);
      background: #ffffff;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .login-error {
      margin: 0;
      color: var(--danger);
      font-size: 13px;
      background: var(--danger-soft);
      padding: 10px 12px;
      border-radius: 10px;
    }
    .login-error[hidden] { display: none; }
    .login-submit { height: 46px; margin-top: 4px; }
    .ghost-button {
      align-self: flex-start;
      margin-top: 10px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      transition: color 150ms ease, border-color 150ms ease;
    }
    .ghost-button[hidden] { display: none; }
    .ghost-button:hover { color: var(--text); border-color: var(--accent); }
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
  <div id="loginOverlay" class="login-overlay" hidden>
    <form id="loginForm" class="login-card">
      <div class="login-head">
        <span class="eyebrow">Team sign in</span>
        <h2>Dashboard login</h2>
        <p class="login-sub">Sign in with the username and password set by the chatbot owner.</p>
      </div>
      <label class="field">
        <span>Username</span>
        <input id="loginUsername" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required />
      </label>
      <label class="field">
        <span>Password</span>
        <input id="loginPassword" type="password" autocomplete="current-password" required />
      </label>
      <p id="loginError" class="login-error" role="alert" hidden></p>
      <button id="loginSubmit" class="button primary login-submit" type="submit">Sign in</button>
    </form>
  </div>
  <div class="shell">
    <div class="frame">
      <aside class="panel sidebar">
        <div class="sidebar-head">
          <span class="eyebrow">Owner Inbox</span>
          <h1 id="chatbotTitle">Loading dashboard</h1>
          <p id="chatbotSubtitle">Live conversations for your chatbot.</p>
          <button id="signOut" class="ghost-button" type="button" hidden>Sign out</button>
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
      const dashboardTokenKey = 'momicro-dashboard-session:' + runtime.chatbotId;
      const dashboardNameKey = 'momicro-dashboard-name:' + runtime.chatbotId;
      runtime.sessionToken = localStorage.getItem(dashboardTokenKey) || '';
      const loginOverlay = document.getElementById('loginOverlay');
      const loginForm = document.getElementById('loginForm');
      const loginUsername = document.getElementById('loginUsername');
      const loginPassword = document.getElementById('loginPassword');
      const loginError = document.getElementById('loginError');
      const loginSubmit = document.getElementById('loginSubmit');
      const signOutButton = document.getElementById('signOut');
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
          if (response.status === 401) signOut();
          throw new Error(payload.message || 'Request failed');
        }
        return payload;
      };

      const showLogin = (message) => {
        loginOverlay.hidden = false;
        signOutButton.hidden = true;
        if (message) {
          loginError.textContent = message;
          loginError.hidden = false;
        } else {
          loginError.hidden = true;
        }
        window.setTimeout(() => loginUsername.focus(), 50);
      };

      const hideLogin = () => {
        loginOverlay.hidden = true;
        loginError.hidden = true;
        signOutButton.hidden = false;
      };

      const signOut = () => {
        localStorage.removeItem(dashboardTokenKey);
        localStorage.removeItem(dashboardNameKey);
        runtime.sessionToken = '';
        if (state.socket) {
          try {
            state.socket.close();
          } catch (error) {
            // ignore close errors
          }
          state.socket = null;
        }
        showLogin();
      };

      const handleLogin = async (event) => {
        event.preventDefault();
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        if (!username || !password) return;
        loginSubmit.disabled = true;
        loginError.hidden = true;
        try {
          const response = await fetch(
            runtime.apiBaseUrl +
              '/v1/chatbots/' +
              runtime.chatbotId +
              '/external-dashboard/login',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username, password: password }),
            }
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.token) {
            throw new Error(payload.message || 'Invalid username or password');
          }
          runtime.sessionToken = payload.token;
          localStorage.setItem(dashboardTokenKey, payload.token);
          if (payload.chatbot) {
            localStorage.setItem(
              dashboardNameKey,
              payload.chatbot.botName || payload.chatbot.title || ''
            );
          }
          loginPassword.value = '';
          hideLogin();
          await loadDashboard();
        } catch (error) {
          showLogin(error.message);
        } finally {
          loginSubmit.disabled = false;
        }
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
          showLogin();
          return;
        }

        try {
          const conversations = await api(
            '/v1/chatbots/' + runtime.chatbotId + '/conversations'
          );

          state.conversations = conversations
            .map(normalizeConversation)
            .sort(compareActivity);

          chatbotTitle.textContent =
            localStorage.getItem(dashboardNameKey) || 'Inbox';
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

      loginForm.addEventListener('submit', handleLogin);
      signOutButton.addEventListener('click', signOut);

      if (runtime.sessionToken) {
        loadDashboard();
      } else {
        showLogin();
      }
    })();
  </script>
</body>
</html>`;
  }
}

module.exports = { EmbedService };
