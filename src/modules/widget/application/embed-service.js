'use strict';

const { toWebsocketUrl } = require('../../../shared/application/url');

const escapeScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

class EmbedService {
  renderScript({ chatbot, baseUrl }) {
    const language = chatbot.settings.defaultLanguage || 'english';
    const iframeBaseUrl = `${baseUrl}/chat/iframe/${chatbot.id}?lang=${encodeURIComponent(language)}`;
    const location =
      chatbot.settings.widgetLocation === 'left' ? 'left' : 'right';
    const accent = chatbot.settings.theme.light.accentColor;
    const text = chatbot.settings.theme.light.accentTextColor;

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
  var iframeSrc =
    ${escapeScript(iframeBaseUrl)} +
    (authClient ? '&authClient=' + encodeURIComponent(authClient) : '');
  var wrapper = document.createElement('div');
  wrapper.id = 'momicro-assist-${chatbot.id}';
  wrapper.style.position = 'fixed';
  wrapper.style.bottom = '24px';
  wrapper.style.${location} = '24px';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = ${escapeScript(chatbot.settings.botName)};
  button.style.background = ${escapeScript(accent)};
  button.style.color = ${escapeScript(text)};
  button.style.border = '0';
  button.style.borderRadius = '999px';
  button.style.padding = '14px 18px';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 16px 36px rgba(15, 23, 42, 0.18)';
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.title = ${escapeScript(chatbot.settings.botName)};
  iframe.style.width = '420px';
  iframe.style.maxWidth = 'calc(100vw - 32px)';
  iframe.style.height = '680px';
  iframe.style.maxHeight = 'calc(100vh - 96px)';
  iframe.style.border = '0';
  iframe.style.borderRadius = '22px';
  iframe.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.24)';
  iframe.style.background = '#fff';
  iframe.style.display = 'none';
  iframe.style.marginTop = '12px';
  button.addEventListener('click', function () {
    iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none';
  });
  wrapper.appendChild(button);
  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
}());
`.trim();
  }

  renderIframe({ chatbot, baseUrl, authClient = '' }) {
    const websocketUrl = `${toWebsocketUrl(baseUrl)}/ws`;
    const payload = {
      chatbot,
      apiBaseUrl: baseUrl,
      websocketUrl,
      authClient,
    };

    return `<!DOCTYPE html>
<html lang="${chatbot.settings.defaultLanguage || 'english'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${chatbot.settings.botName}</title>
  <style>
    :root {
      color-scheme: light dark;
      --accent: ${chatbot.settings.theme.light.accentColor};
      --accent-text: ${chatbot.settings.theme.light.accentTextColor};
      --bg: ${chatbot.settings.theme.light.backgroundColor};
      --surface: ${chatbot.settings.theme.light.surfaceColor};
      --text: ${chatbot.settings.theme.light.textColor};
      --border: ${chatbot.settings.theme.light.borderColor};
      --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || chatbot.settings.theme.light.surfaceColor};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top, rgba(9,154,217,0.18), transparent 34%), var(--bg);
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: var(--text);
    }
    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background: var(--surface);
    }
    .header {
      padding: 18px 18px 12px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(9,154,217,0.16), rgba(92,215,211,0.04), rgba(255,255,255,0));
    }
    .header-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--logo-bg);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 16px;
      font-weight: 700;
    }
    .brand-mark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 6px;
    }
    .brand-copy {
      min-width: 0;
    }
    .title { margin: 0; font-size: 16px; font-weight: 700; }
    .subtitle { margin: 6px 0 0; font-size: 12px; opacity: 0.7; }
    .meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--border);
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .end-chat {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .messages {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: transparent;
    }
    .message {
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 18px;
      line-height: 1.45;
      font-size: 14px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message.visitor {
      align-self: flex-end;
      background: var(--accent);
      color: var(--accent-text);
      border-bottom-right-radius: 6px;
    }
    .message.owner,
    .message.assistant,
    .message.system {
      align-self: flex-start;
      background: rgba(15, 23, 42, 0.05);
      color: var(--text);
      border-bottom-left-radius: 6px;
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
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .chip {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      border-radius: 999px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
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
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px 12px;
      background: transparent;
      color: inherit;
      font: inherit;
    }
    textarea:disabled,
    button:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
    button.send {
      border: 0;
      border-radius: 14px;
      background: var(--accent);
      color: var(--accent-text);
      padding: 0 18px;
      font-weight: 700;
      cursor: pointer;
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
      border-radius: 22px;
      padding: 18px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 18px;
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
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      font: inherit;
      color: inherit;
      background: transparent;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .ghost {
      background: transparent;
      color: inherit;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      cursor: pointer;
    }
    .primary {
      background: var(--accent);
      color: var(--accent-text);
      border: 0;
      border-radius: 12px;
      padding: 10px 12px;
      cursor: pointer;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --accent: ${chatbot.settings.theme.dark.accentColor};
        --accent-text: ${chatbot.settings.theme.dark.accentTextColor};
        --bg: ${chatbot.settings.theme.dark.backgroundColor};
        --surface: ${chatbot.settings.theme.dark.surfaceColor};
        --text: ${chatbot.settings.theme.dark.textColor};
        --border: ${chatbot.settings.theme.dark.borderColor};
        --logo-bg: ${chatbot.settings.brand.logoBackgroundColor || chatbot.settings.theme.dark.surfaceColor};
      }
      .message.owner,
      .message.assistant,
      .message.system {
        background: rgba(255,255,255,0.08);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="header">
      <div class="header-row">
        <div class="brand-lockup">
          <div class="brand-mark">
            ${
              chatbot.settings.brand.logoUrl
                ? `<img src="${chatbot.settings.brand.logoUrl}" alt="${chatbot.settings.botName} logo" />`
                : chatbot.settings.botName.slice(0, 1)
            }
          </div>
          <div class="brand-copy">
            <h1 class="title">${chatbot.settings.botName}</h1>
            <p class="subtitle">${chatbot.settings.initialMessage}</p>
          </div>
        </div>
        <div class="meta">
          <span id="statusBadge" class="status-badge">Active</span>
          <button id="endChat" class="end-chat" type="button">End Chat</button>
        </div>
      </div>
    </header>
    <main id="messages" class="messages"></main>
    <footer id="composer" class="composer">
      <div id="suggestions" class="suggestions"></div>
      <div class="row">
        <textarea id="input" placeholder="${chatbot.settings.inputPlaceholder}"></textarea>
        <button id="send" class="send" type="button">Send</button>
      </div>
    </footer>
  </div>
  <div id="overlay" class="overlay">
    <div class="card">
      <h2>${chatbot.settings.leadsFormTitle}</h2>
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
      const storageKey = 'momicro-assist-widget:' + runtime.chatbot.id;
      const messages = document.getElementById('messages');
      const input = document.getElementById('input');
      const send = document.getElementById('send');
      const suggestions = document.getElementById('suggestions');
      const overlay = document.getElementById('overlay');
      const leadForm = document.getElementById('leadForm');
      const submitLead = document.getElementById('submitLead');
      const cancelLead = document.getElementById('cancelLead');
      const endChat = document.getElementById('endChat');
      const statusBadge = document.getElementById('statusBadge');
      const composer = document.getElementById('composer');
      const defaultPlaceholder =
        runtime.chatbot.settings.inputPlaceholder || 'Write a message...';
      let socket = null;
      let widgetToken = localStorage.getItem(storageKey) || '';
      let queuedMessage = '';
      let currentConversation = null;

      const statusLabels = {
        active: 'Active',
        pending: 'Pending',
        closed: 'Closed',
      };

      const addMessage = (authorType, content) => {
        const node = document.createElement('div');
        node.className = 'message ' + authorType;
        node.textContent = content;
        messages.appendChild(node);
        messages.scrollTop = messages.scrollHeight;
      };

      const renderConversation = (conversation) => {
        messages.innerHTML = '';
        currentConversation = conversation;
        (conversation.messages || []).forEach((message) => {
          addMessage(message.authorType, message.content);
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
        runtime.chatbot.settings.suggestedMessages.forEach((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'chip';
          button.textContent = item;
          button.addEventListener('click', () => {
            input.value = item;
            dispatchMessage();
          });
          suggestions.appendChild(button);
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
              currentConversation.messages = currentConversation.messages || [];
              currentConversation.messages.push(message);
            }
            addMessage(message.authorType, message.content);
            if (message.authorType !== 'visitor') queueVisitorRead();
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
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
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

      const updateConversation = (conversationId, updater) => {
        const index = state.conversations.findIndex((item) => item.id === conversationId);
        if (index === -1) return;
        state.conversations[index] = normalizeConversation(
          updater(state.conversations[index])
        );
        state.conversations.sort(compareActivity);
        renderConversationList();
        if (state.selectedConversationId === conversationId) {
          renderSelectedConversation();
        }
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
          const node = document.createElement('div');
          node.className = 'message ' + message.authorType;

          const content = document.createElement('div');
          content.textContent = message.content;
          node.appendChild(content);

          const meta = document.createElement('div');
          meta.className = 'message-meta';
          const source =
            message.authorType === 'assistant'
              ? 'AI'
              : message.authorType === 'owner'
                ? 'Owner'
                : 'Visitor';
          const read =
            message.authorType === 'visitor'
              ? message.readByOwner
              : message.readByVisitor;
          meta.textContent =
            source +
            ' · ' +
            formatTime(message.createdAt) +
            ' · ' +
            (read ? 'Read' : 'Unread');
          node.appendChild(meta);

          threadBody.appendChild(node);
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
          ? existing.messages || []
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
          renderSelectedConversation();
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
