'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const {
  RealtimeService,
} = require('../../src/modules/realtime/application/realtime-service');
const { SecretBox } = require('../../src/shared/application/secret-box');
const { createTierCatalog } = require('../../src/shared/application/premium');
const { ForbiddenError } = require('../../src/shared/application/errors');

const SOURCE = 'module.exports = { fetchContext: async () => null };';
const VERSION = crypto
  .createHash('sha256')
  .update(SOURCE, 'utf8')
  .digest('hex');

const tierCatalog = createTierCatalog({
  tiers: [
    { id: 'free', name: 'Free', monthlyPriceUsd: 0 },
    {
      id: 'full',
      name: 'Full',
      monthlyPriceUsd: 50,
      checkoutEnabled: true,
      capabilities: ['ai_responder', 'knowledge_files', 'realtime_data'],
    },
  ],
  trialTierId: 'full',
  defaultCheckoutTierId: 'full',
});

const fullChatbot = {
  id: 'bot-1',
  ownerUid: 'owner-1',
  premiumStatus: 'active',
  premiumPlan: 'full',
  settings: {},
};

const freeChatbot = {
  ...fullChatbot,
  id: 'bot-free',
  premiumStatus: 'free',
  premiumPlan: 'free',
};

const buildRecord = (overrides = {}) => ({
  chatbotId: 'bot-1',
  ownerUid: 'owner-1',
  enabled: true,
  version: VERSION,
  storagePath: 'bot-1.js',
  baseUrl: 'https://api.merchant.example',
  allowedHosts: ['api.merchant.example'],
  secrets: {},
  intents: [
    {
      name: 'orders',
      phrases: ['where is my order'],
      endpoint: '/orders',
      args: '',
      freshness: 'live',
    },
  ],
  intentVectors: [{ name: 'orders', vector: [1, 0] }],
  routerThreshold: 0.35,
  routerMargin: 0.05,
  updatedAt: new Date(),
  ...overrides,
});

const buildHarness = ({ record = buildRecord(), runResults = {} } = {}) => {
  const sessions = new Map([
    [
      'wt-1',
      {
        token: 'wt-1',
        chatbotId: 'bot-1',
        conversationId: 'conv-1',
        realtimeUser: null,
        realtimeVerifiedAt: null,
        realtimeSnapshot: null,
        realtimeSnapshotAt: null,
      },
    ],
  ]);

  const runtime = {
    calls: [],
    run: async (args) => {
      runtime.calls.push(args);
      const outcome = runResults[args.fn];
      if (typeof outcome === 'function') return outcome(args);
      return outcome || { ok: false, error: 'not stubbed' };
    },
  };

  const records = new Map(record ? [[record.chatbotId, record]] : []);

  const service = new RealtimeService({
    chatbotRepository: {
      findById: async (id) =>
        [fullChatbot, freeChatbot].find((chatbot) => chatbot.id === id) || null,
    },
    widgetSessionRepository: {
      findByToken: async (token) => sessions.get(token) || null,
      updateByToken: async (token, update) => {
        const session = sessions.get(token);
        if (!session) return null;
        Object.assign(session, update.$set || {});
        return session;
      },
    },
    connectorRepository: {
      findByChatbotId: async (chatbotId) => records.get(chatbotId) || null,
      listEnabled: async () => [...records.values()],
      upsertByChatbotId: async (chatbotId, data) => {
        const current = records.get(chatbotId) || {};
        const next = { ...current, ...data };
        records.set(chatbotId, next);
        return next;
      },
    },
    connectorStorage: null,
    runtime,
    openai: { createEmbeddings: async (texts) => texts.map(() => [1, 0]) },
    tierCatalog,
    secretBox: new SecretBox(''),
    config: {
      identityTtlHours: 24,
      snapshotTtlMinutes: 10,
      verifyTimeoutMs: 100,
      fetchTimeoutMs: 100,
      maxContextChars: 4000,
    },
  });

  if (record) {
    service.sourceCache.set(record.chatbotId, {
      version: record.version,
      source: SOURCE,
    });
  }

  return { service, runtime, sessions, records };
};

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('RealtimeService', () => {
  describe('verifyIdentity', () => {
    it('verifies once, stores identity server-side, and prefetches a snapshot', async () => {
      const { service, runtime, sessions } = buildHarness({
        runResults: {
          verifyIdentity: { ok: true, result: { id: '42', email: 'a@b.c' } },
          loadSnapshot: { ok: true, result: { orders: [] } },
        },
      });

      const user = await service.verifyIdentity({
        chatbot: fullChatbot,
        widgetToken: 'wt-1',
        token: 'merchant-token',
      });
      expect(user).toEqual({ id: '42', email: 'a@b.c' });
      expect(sessions.get('wt-1').realtimeUser).toEqual(user);
      expect(sessions.get('wt-1').realtimeVerifiedAt).toBeInstanceOf(Date);

      await flushAsync();
      expect(sessions.get('wt-1').realtimeSnapshot).toEqual({ orders: [] });

      // Second call reuses the stored identity: verify-once.
      await service.verifyIdentity({
        chatbot: fullChatbot,
        widgetToken: 'wt-1',
        token: 'another-token-from-a-later-message',
      });
      const verifyCalls = runtime.calls.filter(
        (call) => call.fn === 'verifyIdentity',
      );
      expect(verifyCalls).toHaveLength(1);
      // The connector only ever saw the first token.
      expect(verifyCalls[0].args.token).toBe('merchant-token');
    });

    it('returns null and never calls the connector below the realtime tier', async () => {
      const record = buildRecord({ chatbotId: 'bot-free' });
      const { service, runtime } = buildHarness({ record });
      const user = await service.verifyIdentity({
        chatbot: freeChatbot,
        widgetToken: 'wt-1',
        token: 'merchant-token',
      });
      expect(user).toBeNull();
      expect(runtime.calls).toHaveLength(0);
    });

    it('returns null when the connector is disabled', async () => {
      const { service, runtime } = buildHarness({
        record: buildRecord({ enabled: false }),
      });
      const user = await service.verifyIdentity({
        chatbot: fullChatbot,
        widgetToken: 'wt-1',
        token: 'merchant-token',
      });
      expect(user).toBeNull();
      expect(runtime.calls).toHaveLength(0);
    });

    it('rejects a verified result without an id', async () => {
      const { service, sessions } = buildHarness({
        runResults: {
          verifyIdentity: { ok: true, result: { email: 'a@b.c' } },
        },
      });
      const user = await service.verifyIdentity({
        chatbot: fullChatbot,
        widgetToken: 'wt-1',
        token: 'merchant-token',
      });
      expect(user).toBeNull();
      expect(sessions.get('wt-1').realtimeUser).toBeNull();
    });
  });

  describe('fetchLiveContext', () => {
    const conversation = {
      id: 'conv-1',
      chatbotId: 'bot-1',
      widgetSessionToken: 'wt-1',
    };

    const authenticate = (sessions) => {
      Object.assign(sessions.get('wt-1'), {
        realtimeUser: { id: '42' },
        realtimeVerifiedAt: new Date(),
      });
    };

    it('returns null without a verified identity', async () => {
      const { service, runtime } = buildHarness();
      const live = await service.fetchLiveContext({
        chatbot: fullChatbot,
        conversation,
        prompt: 'where is my order',
        embedding: [1, 0],
      });
      expect(live).toBeNull();
      expect(runtime.calls).toHaveLength(0);
    });

    it('routes via the intent vectors and injects the session identity', async () => {
      const { service, runtime, sessions } = buildHarness({
        runResults: {
          fetchContext: { ok: true, result: { orders: [{ id: 'A-1' }] } },
        },
      });
      authenticate(sessions);

      const live = await service.fetchLiveContext({
        chatbot: fullChatbot,
        conversation,
        prompt: 'where is my order A-1',
        embedding: [1, 0],
      });

      expect(live.text).toBe(JSON.stringify({ orders: [{ id: 'A-1' }] }));
      expect(live.asOf).toBeInstanceOf(Date);

      const call = runtime.calls.find((item) => item.fn === 'fetchContext');
      expect(call.args.user).toEqual({ id: '42' });
      expect(call.args.route.name).toBe('orders');
      expect(call.args.route.endpoint).toBe('/orders');
      expect(call.args.route.score).toBeCloseTo(1);
    });

    it('passes a null route for off-topic messages', async () => {
      const { service, runtime, sessions } = buildHarness({
        runResults: { fetchContext: { ok: true, result: null } },
      });
      authenticate(sessions);

      const live = await service.fetchLiveContext({
        chatbot: fullChatbot,
        conversation,
        prompt: 'unrelated',
        embedding: [0, 1],
      });
      expect(live).toBeNull();
      const call = runtime.calls.find((item) => item.fn === 'fetchContext');
      expect(call.args.route).toBeNull();
    });

    it('degrades to null when the connector fails or times out', async () => {
      const { service, sessions } = buildHarness({
        runResults: {
          fetchContext: { ok: false, error: 'Connector call timed out' },
        },
      });
      authenticate(sessions);

      const live = await service.fetchLiveContext({
        chatbot: fullChatbot,
        conversation,
        prompt: 'where is my order',
        embedding: [1, 0],
      });
      expect(live).toBeNull();
    });

    it('ignores an expired identity', async () => {
      const { service, runtime, sessions } = buildHarness({
        runResults: { fetchContext: { ok: true, result: { a: 1 } } },
      });
      Object.assign(sessions.get('wt-1'), {
        realtimeUser: { id: '42' },
        realtimeVerifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      const live = await service.fetchLiveContext({
        chatbot: fullChatbot,
        conversation,
        prompt: 'where is my order',
        embedding: [1, 0],
      });
      expect(live).toBeNull();
      expect(runtime.calls).toHaveLength(0);
    });
  });

  describe('setConnector', () => {
    let scratch;

    beforeAll(async () => {
      scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'momicro-connectors-'));
    });

    afterAll(async () => {
      await fs.rm(scratch, { recursive: true, force: true });
    });

    it('requires an admin actor', async () => {
      const { service } = buildHarness();
      await expect(
        service.setConnector({ uid: 'owner-1', role: 'user' }, 'bot-1', {
          source: SOURCE,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('hashes, embeds intents, persists, and writes the local file', async () => {
      const { service, records } = buildHarness({ record: null });
      service.merchantsDirectory = scratch;

      const status = await service.setConnector(
        { uid: 'admin-1', role: 'admin' },
        'bot-1',
        {
          source: SOURCE,
          enabled: true,
          baseUrl: 'https://api.merchant.example',
          allowedHosts: ['API.Merchant.example'],
          secrets: { apiKey: 'sk-1' },
          intents: [{ name: 'orders', phrases: ['where is my order'] }],
        },
      );

      expect(status.version).toBe(VERSION);
      expect(status.enabled).toBe(true);
      expect(status.allowedHosts).toEqual(['api.merchant.example']);
      expect(status.hasSecrets).toBe(true);
      expect(status.source).toBe(SOURCE);

      const stored = records.get('bot-1');
      expect(stored.intentVectors).toHaveLength(1);
      expect(stored.intentVectors[0].name).toBe('orders');
      expect(stored.intentVectors[0].vector[0]).toBeCloseTo(1);

      const written = await fs.readFile(path.join(scratch, 'bot-1.js'), 'utf8');
      expect(written).toBe(SOURCE);
    });
  });
});
