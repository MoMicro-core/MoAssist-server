'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const { TIER_CAPABILITIES } = require('../../../shared/application/premium');
const {
  buildIntentVector,
  normalizeVector,
  rankIntents,
} = require('../domain/intent-router');

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_USER_CHARS = 2048;

const hashSource = (source) =>
  crypto.createHash('sha256').update(source, 'utf8').digest('hex');

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');

const isFresh = (value, maxAgeMs) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time < maxAgeMs;
};

const normalizeHosts = (value = []) => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .map((host) =>
        String(host || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  ),
];

const normalizeIntents = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((intent) => ({
      name: String(intent?.name || '').trim(),
      phrases: (Array.isArray(intent?.phrases) ? intent.phrases : [])
        .map((phrase) => String(phrase || '').trim())
        .filter(Boolean),
      endpoint: String(intent?.endpoint || '').trim(),
      args: String(intent?.args || '').trim(),
      freshness: intent?.freshness === 'snapshot' ? 'snapshot' : 'live',
    }))
    .filter((intent) => intent.name);

// The verified identity is server-held and injected read-only into every
// later connector call; nothing from later visitor messages can change it.
const sanitizeVerifiedUser = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id ?? '').trim();
  if (!id) return null;

  const user = { id: id.slice(0, 128) };
  for (const [key, item] of Object.entries(value)) {
    if (key === 'id') continue;
    if (
      item === null ||
      ['string', 'number', 'boolean'].includes(typeof item)
    ) {
      user[key] = item;
    }
  }

  return JSON.stringify(user).length > MAX_USER_CHARS ? { id: user.id } : user;
};

class RealtimeService {
  constructor({
    chatbotRepository,
    widgetSessionRepository,
    connectorRepository,
    connectorStorage,
    runtime,
    openai,
    tierCatalog,
    secretBox,
    config = {},
    log = () => null,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.widgetSessionRepository = widgetSessionRepository;
    this.connectorRepository = connectorRepository;
    this.connectorStorage = connectorStorage;
    this.runtime = runtime;
    this.openai = openai;
    this.tierCatalog = tierCatalog;
    this.secretBox = secretBox;
    this.config = config;
    this.log = log;
    const connectorsDirectory = config.connectorsDirectory || 'connectors';
    this.connectorsDirectory = path.isAbsolute(connectorsDirectory)
      ? connectorsDirectory
      : path.join(process.cwd(), connectorsDirectory);
    this.sourceCache = new Map();
  }

  // Per-message diagnostics; enable with CONNECTOR_DEBUG=1. Skip reasons are
  // silent by design (a missing token is normal), so this is the only way to
  // see why the connector did not contribute to a reply.
  trace(line) {
    if (this.config.debug) this.log(`realtime: ${line}`);
  }

  localSourcePath(chatbotId) {
    return path.join(this.connectorsDirectory, `${chatbotId}.js`);
  }

  storageObjectPath(chatbotId) {
    return `${chatbotId}.js`;
  }

  assertAdmin(actor) {
    if (actor?.role !== 'admin') {
      throw new ForbiddenError('Connector management requires an admin');
    }
  }

  async writeLocalSource(chatbotId, source) {
    await fs.mkdir(this.connectorsDirectory, { recursive: true });
    const target = this.localSourcePath(chatbotId);
    const temporary = path.join(this.connectorsDirectory, `.tmp-${chatbotId}`);
    await fs.writeFile(temporary, source, 'utf8');
    await fs.rename(temporary, target);
  }

  async downloadSource(record) {
    if (!this.connectorStorage?.isConfigured?.()) return null;
    const buffer = await this.connectorStorage.downloadObject({
      bucket: this.config.connectorsBucket || '',
      objectPath:
        record.storagePath || this.storageObjectPath(record.chatbotId),
    });
    const source = buffer.toString('utf8');
    if (record.version && hashSource(source) !== record.version) {
      throw new BadRequestError('Downloaded connector failed the hash check');
    }
    return source;
  }

  // Local file first (synced on boot), Supabase as the durable fallback.
  // Every path is hash-verified against the stored version.
  async loadSource(record) {
    const cached = this.sourceCache.get(record.chatbotId);
    if (cached && cached.version === record.version) return cached.source;

    try {
      const local = await fs.readFile(
        this.localSourcePath(record.chatbotId),
        'utf8',
      );
      if (!record.version || hashSource(local) === record.version) {
        this.sourceCache.set(record.chatbotId, {
          version: record.version,
          source: local,
        });
        return local;
      }
    } catch {
      // No local copy yet; fall through to Supabase.
    }

    try {
      const remote = await this.downloadSource(record);
      if (!remote) return null;
      await this.writeLocalSource(record.chatbotId, remote);
      this.sourceCache.set(record.chatbotId, {
        version: record.version,
        source: remote,
      });
      return remote;
    } catch (error) {
      this.log(
        `connector ${record.chatbotId}: source unavailable (${error.message})`,
      );
      return null;
    }
  }

  async syncAllOnBoot() {
    let records = [];
    try {
      records = await this.connectorRepository.listEnabled();
    } catch (error) {
      this.log(`connector sync skipped: ${error.message}`);
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;
    for (const record of records) {
      const source = await this.loadSource(record);
      if (source) synced += 1;
      else failed += 1;
    }

    if (records.length) {
      this.log(`connector sync: ${synced} ready, ${failed} unavailable`);
    }
    return { synced, failed };
  }

  async embedIntents(intents) {
    const withPhrases = intents.filter((intent) => intent.phrases.length);
    if (!withPhrases.length || !this.openai) return [];

    const vectors = [];
    for (const intent of withPhrases) {
      const embeddings = await this.openai.createEmbeddings(intent.phrases);
      const normalized = embeddings.map((vector) => normalizeVector(vector));
      vectors.push({
        name: intent.name,
        vector: buildIntentVector(normalized),
      });
    }
    return vectors.filter((entry) => entry.vector.length);
  }

  toStatus(record, source = '') {
    return {
      chatbotId: record.chatbotId,
      enabled: record.enabled === true,
      version: record.version || '',
      storagePath: record.storagePath || '',
      baseUrl: record.baseUrl || '',
      allowedHosts: record.allowedHosts || [],
      intents: normalizeIntents(record.intents),
      routerThreshold: record.routerThreshold,
      routerMargin: record.routerMargin,
      hasSecrets: Boolean(record.secrets?.payload),
      intentsEmbeddedAt: record.intentsEmbeddedAt || null,
      updatedAt: record.updatedAt || null,
      source,
    };
  }

  async getConnector(actor, chatbotId) {
    this.assertAdmin(actor);
    const record = await this.connectorRepository.findByChatbotId(chatbotId);
    if (!record) throw new NotFoundError('Connector not found');
    const source = await this.loadSource(record);
    return this.toStatus(record, source || '');
  }

  async setConnector(actor, chatbotId, payload = {}) {
    this.assertAdmin(actor);

    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');

    const source = String(payload.source || '').trim();
    if (!source) throw new BadRequestError('Connector source is required');

    const existing = await this.connectorRepository.findByChatbotId(chatbotId);
    const version = hashSource(source);
    const storagePath = this.storageObjectPath(chatbotId);
    // Omitting intents keeps the stored catalog (and its cached vectors).
    const intents =
      payload.intents === undefined
        ? normalizeIntents(existing?.intents)
        : normalizeIntents(payload.intents);

    if (this.connectorStorage?.isConfigured?.()) {
      await this.connectorStorage.uploadObject({
        bucket: this.config.connectorsBucket || '',
        objectPath: storagePath,
        buffer: Buffer.from(source, 'utf8'),
        mimeType: 'text/javascript',
      });
    }
    const update = {
      chatbotId,
      ownerUid: chatbot.ownerUid,
      enabled: payload.enabled === true,
      version,
      storagePath,
      baseUrl: String(payload.baseUrl || '').trim(),
      allowedHosts: normalizeHosts(payload.allowedHosts),
      intents,
    };

    const intentsChanged =
      JSON.stringify(normalizeIntents(existing?.intents)) !==
      JSON.stringify(intents);
    if (!existing || intentsChanged || !existing.intentVectors?.length) {
      update.intentVectors = await this.embedIntents(intents);
      update.intentsEmbeddedAt = new Date();
    }

    if (payload.secrets && typeof payload.secrets === 'object') {
      update.secrets = this.secretBox.encrypt(payload.secrets);
    }
    if (Number.isFinite(payload.routerThreshold)) {
      update.routerThreshold = Number(payload.routerThreshold);
    }
    if (Number.isFinite(payload.routerMargin)) {
      update.routerMargin = Number(payload.routerMargin);
    }

    const record = await this.connectorRepository.upsertByChatbotId(
      chatbotId,
      update,
    );
    await this.writeLocalSource(chatbotId, source);
    this.sourceCache.set(chatbotId, { version, source });

    return this.toStatus(record, source);
  }

  async resync(actor, chatbotId) {
    this.assertAdmin(actor);
    const record = await this.connectorRepository.findByChatbotId(chatbotId);
    if (!record) throw new NotFoundError('Connector not found');

    this.sourceCache.delete(chatbotId);
    const remote = await this.downloadSource(record);
    if (!remote) throw new BadRequestError('Connector storage is unavailable');

    await this.writeLocalSource(chatbotId, remote);
    this.sourceCache.set(chatbotId, {
      version: record.version,
      source: remote,
    });
    return { synced: true, version: record.version };
  }

  hasRealtimeTier(chatbot) {
    return this.tierCatalog.hasCapability(
      chatbot,
      TIER_CAPABILITIES.REALTIME_DATA,
    );
  }

  async getActiveConnector(chatbot) {
    if (!chatbot) return null;
    if (!this.hasRealtimeTier(chatbot)) {
      this.trace(
        `chatbot ${chatbot.id}: tier "${chatbot.premiumPlan}" (${chatbot.premiumStatus}) has no realtime_data capability`,
      );
      return null;
    }
    const record = await this.connectorRepository.findByChatbotId(chatbot.id);
    if (!record) {
      this.trace(`chatbot ${chatbot.id}: no connector record`);
      return null;
    }
    if (record.enabled !== true) {
      this.trace(`chatbot ${chatbot.id}: connector disabled`);
      return null;
    }
    const source = await this.loadSource(record);
    if (!source) {
      this.trace(`chatbot ${chatbot.id}: connector source unavailable`);
      return null;
    }
    return { record, source };
  }

  async isActive(chatbot) {
    try {
      return Boolean(await this.getActiveConnector(chatbot));
    } catch {
      return false;
    }
  }

  // The visitor logged out: forget the verified identity and snapshot so
  // live account data stops immediately.
  async clearForWidget({ chatbotId, widgetToken }) {
    try {
      if (!widgetToken) return null;
      const session =
        await this.widgetSessionRepository.findByToken(widgetToken);
      if (!session?.realtimeUser) return null;

      await this.widgetSessionRepository.updateByToken(widgetToken, {
        $set: {
          realtimeUser: null,
          realtimeVerifiedAt: null,
          realtimeTokenHash: '',
          realtimeSnapshot: null,
          realtimeSnapshotAt: null,
        },
      });
      this.log(
        `connector ${chatbotId || session.chatbotId}: identity cleared (visitor logged out)`,
      );
      return null;
    } catch (error) {
      this.log(`connector identity clear error: ${error.message}`);
      return null;
    }
  }

  // Widget auth handshake: the widget reports its CURRENT auth state on
  // every connect. A token verifies (or re-verifies after an account
  // switch); an absent token clears any stored identity (logout).
  async syncForWidget({ chatbotId, widgetToken, token }) {
    const normalized = String(token || '').trim();
    if (!normalized) return this.clearForWidget({ chatbotId, widgetToken });
    return this.verifyForWidget({ chatbotId, widgetToken, token: normalized });
  }

  // Entry point for widget auth flows that only know the chatbot id.
  async verifyForWidget({ chatbotId, widgetToken, token }) {
    const normalized = String(token || '').trim();
    this.trace(
      `verify requested for chatbot ${chatbotId} (token ${
        normalized ? `present, ${normalized.length} chars` : 'MISSING'
      })`,
    );
    if (!normalized) return null;
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) {
      this.trace(`verify aborted: chatbot ${chatbotId} not found`);
      return null;
    }
    return this.verifyIdentity({ chatbot, widgetToken, token: normalized });
  }

  buildRunConnector(record, source, cacheScope) {
    let baseUrl = record.baseUrl || '';
    const recordHosts = record.allowedHosts || [];
    const allowedHosts = [...recordHosts];

    // Dev-only redirect: point connector calls at a local/staging origin
    // without changing the record shared with production.
    const override = String(this.config.baseUrlOverride || '').trim();
    if (override) {
      baseUrl = override;
      try {
        allowedHosts.push(new URL(override).hostname.toLowerCase());
      } catch {
        // Invalid override URL; the request itself will fail loudly.
      }
      this.trace(`using base URL override ${override}`);
    }

    return {
      chatbotId: record.chatbotId,
      version: record.version,
      source,
      baseUrl,
      allowedHosts,
      secrets: this.secretBox.decrypt(record.secrets) || {},
      intents: normalizeIntents(record.intents),
      cacheScope,
    };
  }

  identityTtlMs() {
    return (this.config.identityTtlHours || 24) * HOUR_MS;
  }

  snapshotTtlMs() {
    return (this.config.snapshotTtlMinutes || 10) * MINUTE_MS;
  }

  // Verify-once: runs when a widget session presents a merchant auth token.
  // The result is stored server-side; later messages never re-send identity.
  async verifyIdentity({ chatbot, widgetToken, token }) {
    try {
      const normalizedToken = String(token || '').trim();
      if (!normalizedToken || !widgetToken) return null;

      const active = await this.getActiveConnector(chatbot);
      if (!active) return null;

      const session =
        await this.widgetSessionRepository.findByToken(widgetToken);
      if (!session || session.chatbotId !== chatbot.id) return null;

      // Same token, fresh identity → nothing to do. A different token means
      // the visitor logged in as someone else: re-verify before trusting.
      const tokenHash = hashToken(normalizedToken);
      if (
        session.realtimeUser &&
        isFresh(session.realtimeVerifiedAt, this.identityTtlMs()) &&
        session.realtimeTokenHash === tokenHash
      ) {
        return session.realtimeUser;
      }
      if (session.realtimeUser && session.realtimeTokenHash !== tokenHash) {
        this.trace(
          `chatbot ${chatbot.id}: auth token changed, re-verifying identity`,
        );
      }

      const connector = this.buildRunConnector(
        active.record,
        active.source,
        session.conversationId,
      );
      const outcome = await this.runtime.run({
        connector,
        fn: 'verifyIdentity',
        args: { token: normalizedToken },
        timeoutMs: this.config.verifyTimeoutMs || 5000,
      });
      if (!outcome.ok) {
        this.log(`connector ${chatbot.id}: verify failed (${outcome.error})`);
        return null;
      }

      const user = sanitizeVerifiedUser(outcome.result);
      if (!user) {
        this.log(`connector ${chatbot.id}: verify returned no usable identity`);
        return null;
      }

      this.log(`connector ${chatbot.id}: identity verified (user ${user.id})`);
      await this.widgetSessionRepository.updateByToken(widgetToken, {
        $set: {
          realtimeUser: user,
          realtimeVerifiedAt: new Date(),
          realtimeTokenHash: tokenHash,
          realtimeSnapshot: null,
          realtimeSnapshotAt: null,
        },
      });

      this.prefetchSnapshot({ connector, widgetToken, user }).catch(() => null);
      return user;
    } catch (error) {
      this.log(`connector verify error: ${error.message}`);
      return null;
    }
  }

  async prefetchSnapshot({ connector, widgetToken, user }) {
    const outcome = await this.runtime.run({
      connector,
      fn: 'loadSnapshot',
      args: { user },
      timeoutMs: this.config.snapshotTimeoutMs || 5000,
    });
    if (!outcome.ok || outcome.result === null) return;

    await this.widgetSessionRepository.updateByToken(widgetToken, {
      $set: {
        realtimeSnapshot: outcome.result,
        realtimeSnapshotAt: new Date(),
      },
    });
  }

  // Per-message live data. Never throws; any failure means "no live data"
  // and the reply proceeds from RAG/history alone.
  async fetchLiveContext({ chatbot, conversation, prompt, embedding }) {
    try {
      const widgetToken = conversation?.widgetSessionToken;
      if (!widgetToken) {
        this.trace('skip: conversation has no widget session token');
        return null;
      }

      const active = await this.getActiveConnector(chatbot);
      if (!active) return null;

      const session =
        await this.widgetSessionRepository.findByToken(widgetToken);
      if (!session?.realtimeUser) {
        this.trace(
          `chatbot ${chatbot.id}: skip, no verified identity on the widget ` +
            'session (was a realtimeToken passed to the widget?)',
        );
        return null;
      }
      if (!isFresh(session.realtimeVerifiedAt, this.identityTtlMs())) {
        this.trace(`chatbot ${chatbot.id}: skip, verified identity expired`);
        return null;
      }

      const route = rankIntents(embedding, active.record.intentVectors, {
        threshold: active.record.routerThreshold,
        margin: active.record.routerMargin,
      });
      this.trace(
        route
          ? `chatbot ${chatbot.id}: routed to "${route.name}" (score ${route.score.toFixed(3)})`
          : `chatbot ${chatbot.id}: no intent matched (${active.record.intentVectors?.length || 0} intent vectors)`,
      );
      const routeIntent = route
        ? normalizeIntents(active.record.intents).find(
            (intent) => intent.name === route.name,
          )
        : null;

      const snapshot = isFresh(session.realtimeSnapshotAt, this.snapshotTtlMs())
        ? session.realtimeSnapshot
        : null;

      const connector = this.buildRunConnector(
        active.record,
        active.source,
        session.conversationId,
      );
      const outcome = await this.runtime.run({
        connector,
        fn: 'fetchContext',
        args: {
          message: String(prompt || ''),
          embedding: Array.isArray(embedding) ? embedding : null,
          user: session.realtimeUser,
          snapshot,
          route: routeIntent ? { ...routeIntent, score: route.score } : null,
        },
        timeoutMs: this.config.fetchTimeoutMs || 2500,
      });
      if (!outcome.ok) {
        this.trace(`chatbot ${chatbot.id}: fetch failed (${outcome.error})`);
        return null;
      }
      if (outcome.result === null) {
        this.trace(`chatbot ${chatbot.id}: connector returned no live data`);
        return null;
      }

      const text =
        typeof outcome.result === 'string'
          ? outcome.result
          : JSON.stringify(outcome.result);
      const trimmed = text.trim();
      if (!trimmed) return null;

      this.trace(
        `chatbot ${chatbot.id}: injecting ${trimmed.length} chars of live data`,
      );
      return {
        text: trimmed.slice(0, this.config.maxContextChars || 4000),
        asOf: new Date(),
      };
    } catch (error) {
      this.log(`connector fetch error: ${error.message}`);
      return null;
    }
  }
}

module.exports = { RealtimeService };
