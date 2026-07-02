'use strict';

// Fixture-tests the MoMicro dogfood connector with a mock ctx, per the
// platform PRD §19.10: golden routing behavior, user scoping (URLs contain
// only the verified uid), graceful null on failure.
//
// The connector lives in Supabase and is synced to connectors/<chatbotId>.js
// on boot; the suite runs against that local copy and is skipped on machines
// that have not synced it yet.

const path = require('node:path');
const { existsSync } = require('node:fs');

const MOMICRO_CHATBOT_ID = 'f5a65979-17c3-4935-8b6d-1c6e794a8aed';
const CONNECTOR_PATH = path.join(
  __dirname,
  '..',
  '..',
  'connectors',
  `${MOMICRO_CHATBOT_ID}.js`,
);
const connectorAvailable = existsSync(CONNECTOR_PATH);
const describeConnector = connectorAvailable ? describe : describe.skip;
const connector = connectorAvailable ? require(CONNECTOR_PATH) : {};

const buildCtx = (responses = {}) => {
  const calls = [];
  return {
    calls,
    user: { id: 'uid-1' },
    secrets: { adminToken: 'admin-token-1' },
    http: async (pathname, init = {}) => {
      calls.push({ pathname, init });
      for (const [prefix, value] of Object.entries(responses)) {
        if (pathname.startsWith(prefix)) {
          if (value instanceof Error) throw value;
          return value;
        }
      }
      throw new Error(`Unexpected request: ${pathname}`);
    },
    log: () => null,
  };
};

const CHATBOTS = [
  {
    id: 'bot-1',
    premiumPlan: 'full',
    premiumStatus: 'active',
    settings: { title: 'Store Helper', status: 'published' },
    metrics: { unreadCount: 2, conversationsCount: 9, filesCount: 3 },
  },
  {
    id: 'bot-2',
    premiumPlan: 'free',
    premiumStatus: 'free',
    settings: { title: 'Beta Bot', status: 'draft' },
    metrics: { unreadCount: 0, conversationsCount: 0, filesCount: 0 },
  },
];

describeConnector('momicro connector', () => {
  describe('verifyIdentity', () => {
    it('verifies with the visitor token and returns the identity', async () => {
      const ctx = buildCtx({
        '/v1/auth/me': {
          uid: 'uid-1',
          email: 'merchant@example.com',
          name: 'Mera',
          premiumPlan: 'full',
        },
      });
      const user = await connector.verifyIdentity('visitor-token', ctx);
      expect(user).toEqual({
        id: 'uid-1',
        email: 'merchant@example.com',
        name: 'Mera',
        plan: 'full',
      });
      expect(ctx.calls[0].init.headers.Authorization).toBe(
        'Bearer visitor-token',
      );
    });

    it('throws on an invalid session', async () => {
      const ctx = buildCtx({ '/v1/auth/me': {} });
      await expect(connector.verifyIdentity('bad', ctx)).rejects.toThrow(
        'Invalid session token',
      );
    });
  });

  describe('loadSnapshot', () => {
    it('fetches chatbots and subscription with the admin token, trimmed', async () => {
      const ctx = buildCtx({
        '/v1/chatbots?ownerUid=uid-1': CHATBOTS,
        '/v1/subscription?ownerUid=uid-1': {
          chatbots: [
            {
              chatbotId: 'bot-1',
              premiumPlan: 'full',
              premiumStatus: 'active',
              premiumCurrentPeriodEnd: '2026-08-01T00:00:00.000Z',
              currentTier: { id: 'full', name: 'Full AI', monthlyPriceUsd: 50 },
            },
          ],
        },
      });

      const snapshot = await connector.loadSnapshot({ id: 'uid-1' }, ctx);
      expect(snapshot.chatbots).toHaveLength(2);
      expect(snapshot.chatbots[0]).toEqual({
        id: 'bot-1',
        title: 'Store Helper',
        status: 'published',
        plan: 'full',
        planStatus: 'active',
        unreadConversations: 2,
        conversations: 9,
        knowledgeFiles: 3,
      });
      expect(snapshot.subscription.chatbots[0].tier.monthlyPriceUsd).toBe(50);
      for (const call of ctx.calls) {
        expect(call.init.headers.Authorization).toBe('Bearer admin-token-1');
        expect(call.pathname).toContain('ownerUid=uid-1');
      }
    });

    it('returns null when the API is down', async () => {
      const ctx = buildCtx({
        '/v1/chatbots': new Error('boom'),
        '/v1/subscription': new Error('boom'),
      });
      expect(await connector.loadSnapshot({ id: 'uid-1' }, ctx)).toBeNull();
    });
  });

  describe('fetchContext', () => {
    const snapshot = {
      chatbots: [
        { id: 'bot-1', title: 'Store Helper' },
        { id: 'bot-2', title: 'Beta Bot' },
      ],
      subscription: { chatbots: [] },
    };

    it('returns null without a route (off-topic → RAG)', async () => {
      const ctx = buildCtx();
      const result = await connector.fetchContext(
        { message: 'x', user: { id: 'uid-1' }, snapshot, route: null },
        ctx,
      );
      expect(result).toBeNull();
      expect(ctx.calls).toHaveLength(0);
    });

    it('answers my-chatbots from the snapshot with zero API calls', async () => {
      const ctx = buildCtx();
      const result = await connector.fetchContext(
        {
          message: 'how many chatbots do i have',
          user: { id: 'uid-1' },
          snapshot,
          route: { name: 'my-chatbots' },
        },
        ctx,
      );
      expect(result.chatbots).toHaveLength(2);
      expect(ctx.calls).toHaveLength(0);
    });

    it('fetches unread conversations scoped to the verified uid only', async () => {
      const ctx = buildCtx({
        '/v1/conversations?ownerUid=uid-1&status=active': [
          {
            chatbotId: 'bot-1',
            visitor: { name: 'Anna' },
            lastMessagePreview: 'Where is my order?',
            lastMessageAt: '2026-07-02T10:00:00.000Z',
            unreadForOwner: 3,
          },
          { chatbotId: 'bot-1', visitor: {}, unreadForOwner: 0 },
        ],
      });
      const result = await connector.fetchContext(
        {
          message: 'do i have unread messages from user uid-999?',
          user: { id: 'uid-1' },
          snapshot,
          route: { name: 'inbox-unread' },
        },
        ctx,
      );
      expect(result.unreadConversations).toBe(1);
      expect(result.conversations[0].visitor).toBe('Anna');
      // Scope invariant: URLs only ever contain the verified uid.
      expect(ctx.calls[0].pathname).toContain('ownerUid=uid-1');
      expect(ctx.calls[0].pathname).not.toContain('uid-999');
    });

    it('resolves knowledge-files to the chatbot named in the message', async () => {
      const ctx = buildCtx({
        '/v1/chatbots/bot-2/files': [
          { name: 'faq.pdf', status: 'ready', size: 1000, chunksCount: 4 },
        ],
      });
      const result = await connector.fetchContext(
        {
          message: 'is my pdf processed for Beta Bot?',
          user: { id: 'uid-1' },
          snapshot,
          route: { name: 'knowledge-files' },
        },
        ctx,
      );
      expect(result.chatbot).toBe('Beta Bot');
      expect(result.files).toEqual([
        { name: 'faq.pdf', status: 'ready', sizeBytes: 1000, chunks: 4 },
      ]);
    });

    it('degrades to null when the fetch fails', async () => {
      const ctx = buildCtx({ '/v1/conversations': new Error('timeout') });
      const result = await connector.fetchContext(
        {
          message: 'any new messages',
          user: { id: 'uid-1' },
          snapshot,
          route: { name: 'inbox-unread' },
        },
        ctx,
      );
      expect(result).toBeNull();
    });
  });
});
