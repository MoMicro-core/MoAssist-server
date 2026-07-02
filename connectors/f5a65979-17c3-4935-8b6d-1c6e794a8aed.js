'use strict';

// MoMicro dogfood connector — see docs/momicro-connector-prd.md.
//
// Runs inside the platform vm/worker sandbox; `ctx` is the only capability
// surface. Verifies the dashboard visitor's OWN session token once
// (GET /v1/auth/me), then fetches live account data with the connector-admin
// token from ctx.secrets — every URL parameterized only by the verified
// ctx.user.id or by ids just fetched for that uid. Read-only (GET) in v1.

const MAX_ITEMS = 10;
const MAX_FILES = 20;

const authHeader = (token) => ({ Authorization: 'Bearer ' + token });

const adminGet = (ctx, path) =>
  ctx.http(path, { headers: authHeader(ctx.secrets.adminToken) });

const asArray = (value) => (Array.isArray(value) ? value : []);

const trimChatbot = (chatbot) => ({
  id: chatbot.id,
  title: (chatbot.settings && chatbot.settings.title) || '',
  status: (chatbot.settings && chatbot.settings.status) || 'draft',
  plan: chatbot.premiumPlan || 'free',
  planStatus: chatbot.premiumStatus || 'free',
  unreadConversations: (chatbot.metrics && chatbot.metrics.unreadCount) || 0,
  conversations: (chatbot.metrics && chatbot.metrics.conversationsCount) || 0,
  knowledgeFiles: (chatbot.metrics && chatbot.metrics.filesCount) || 0,
});

const trimSubscription = (summary) => ({
  chatbots: asArray(summary && summary.chatbots).map((item) => ({
    chatbotId: item.chatbotId,
    plan: item.premiumPlan || 'free',
    status: item.premiumStatus || 'free',
    periodEnd: item.premiumCurrentPeriodEnd || null,
    tier: item.currentTier
      ? {
          id: item.currentTier.id,
          name: item.currentTier.name,
          monthlyPriceUsd: item.currentTier.monthlyPriceUsd,
        }
      : null,
  })),
});

const fetchTrimmedChatbots = async (ctx, uid) => {
  const chatbots = await adminGet(
    ctx,
    '/v1/chatbots?ownerUid=' + encodeURIComponent(uid),
  );
  return asArray(chatbots).slice(0, MAX_ITEMS).map(trimChatbot);
};

// Picks the chatbot the visitor is talking about by title mention; falls
// back to their first chatbot. Only ever selects among the visitor's own.
const findChatbotByTitle = (message, chatbots) => {
  const text = String(message || '').toLowerCase();
  const match = chatbots.find(
    (chatbot) =>
      chatbot.title && text.indexOf(chatbot.title.toLowerCase()) !== -1,
  );
  return match || chatbots[0] || null;
};

const done = (ctx, route, data) => {
  ctx.log('fetchContext: returning live data for "' + route.name + '"');
  return data;
};

// Once per session, with the visitor's own token — never the admin's.
async function verifyIdentity(token, ctx) {
  ctx.log('verifyIdentity: checking visitor token via /v1/auth/me');
  const me = await ctx.http('/v1/auth/me', { headers: authHeader(token) });
  if (!me || !me.uid) throw new Error('Invalid session token');
  ctx.log('verifyIdentity: OK, user ' + me.uid + ' (' + (me.email || '') + ')');
  return {
    id: String(me.uid),
    email: me.email || '',
    name: me.name || '',
    plan: me.premiumPlan || 'free',
  };
}

// Once per session (plus TTL refresh): the data most questions need.
async function loadSnapshot(user, ctx) {
  ctx.log('loadSnapshot: prefetching for user ' + user.id);
  try {
    const [chatbots, subscription] = await Promise.all([
      fetchTrimmedChatbots(ctx, user.id),
      adminGet(ctx, '/v1/subscription?ownerUid=' + encodeURIComponent(user.id)),
    ]);
    ctx.log('loadSnapshot: OK, ' + chatbots.length + ' chatbots');
    return { chatbots, subscription: trimSubscription(subscription) };
  } catch (error) {
    ctx.log('snapshot failed', error.message);
    return null;
  }
}

// Per message; the platform router picked `route` from the intent catalog.
// Returning null means "no live data" and the AI answers from RAG/history.
async function fetchContext({ message, user, snapshot, route }, ctx) {
  ctx.log(
    'fetchContext: route=' +
      (route && route.name ? route.name : 'none') +
      ', user=' +
      (user && user.id ? user.id : 'none') +
      ', snapshot=' +
      (snapshot ? 'yes' : 'no'),
  );
  if (!route || !route.name) return null;

  try {
    if (route.name === 'my-chatbots') {
      const chatbots =
        snapshot && snapshot.chatbots
          ? snapshot.chatbots
          : await fetchTrimmedChatbots(ctx, user.id);
      return done(ctx, route, { chatbots });
    }

    if (route.name === 'billing-plan') {
      if (snapshot && snapshot.subscription) {
        return done(ctx, route, { subscription: snapshot.subscription });
      }
      const summary = await adminGet(
        ctx,
        '/v1/subscription?ownerUid=' + encodeURIComponent(user.id),
      );
      return done(ctx, route, { subscription: trimSubscription(summary) });
    }

    if (route.name === 'inbox-unread') {
      const conversations = await adminGet(
        ctx,
        '/v1/conversations?ownerUid=' +
          encodeURIComponent(user.id) +
          '&status=active',
      );
      const unread = asArray(conversations).filter(
        (conversation) => (conversation.unreadForOwner || 0) > 0,
      );
      return done(ctx, route, {
        unreadConversations: unread.length,
        conversations: unread.slice(0, MAX_ITEMS).map((conversation) => ({
          chatbotId: conversation.chatbotId,
          visitor:
            (conversation.visitor &&
              (conversation.visitor.name || conversation.visitor.email)) ||
            'visitor',
          lastMessage: conversation.lastMessagePreview || '',
          lastMessageAt: conversation.lastMessageAt || null,
          unread: conversation.unreadForOwner || 0,
        })),
      });
    }

    if (route.name === 'knowledge-files') {
      const chatbots =
        snapshot && snapshot.chatbots
          ? snapshot.chatbots
          : await fetchTrimmedChatbots(ctx, user.id);
      const target = findChatbotByTitle(message, chatbots);
      if (!target) return null;
      const files = await adminGet(
        ctx,
        '/v1/chatbots/' + encodeURIComponent(target.id) + '/files',
      );
      return done(ctx, route, {
        chatbot: target.title || target.id,
        files: asArray(files)
          .slice(0, MAX_FILES)
          .map((file) => ({
            name: file.name,
            status: file.status,
            sizeBytes: file.size,
            chunks: file.chunksCount,
          })),
      });
    }

    return null;
  } catch (error) {
    ctx.log('fetch failed', route.name, error.message);
    return null;
  }
}

module.exports = { verifyIdentity, loadSnapshot, fetchContext };