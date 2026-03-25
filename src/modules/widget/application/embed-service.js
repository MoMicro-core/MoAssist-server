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
        <div>
          <h1 class="title">${chatbot.settings.botName}</h1>
          <p class="subtitle">${chatbot.settings.initialMessage}</p>
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
}

module.exports = { EmbedService };
