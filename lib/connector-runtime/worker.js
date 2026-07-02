'use strict';

// Connector sandbox worker. Compiles per-merchant connector source inside a
// null-prototype `vm` context and executes its exported functions with an
// injected `ctx` as the only capability surface. Safe under the sole-author
// invariant (we write every connector); the worker adds fault isolation.

const vm = require('node:vm');
const { parentPort } = require('node:worker_threads');

const MAX_LOG_LINES = 50;
const MAX_RESULT_CHARS = 8 * 1024;
const MAX_REDIRECTS = 3;
const CAPABILITY_TIMEOUT_MS = 5000;
const CACHE_DEFAULT_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

const compiledConnectors = new Map();
const cacheEntries = new Map();
const pendingCapabilities = new Map();
let capabilitySequence = 0;

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object') return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
};

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const isPrivateHostname = (hostname = '') => {
  const host = String(hostname).toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (host === '::1' || host === '[::1]') return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first, second] = parts;
  if (first === 10 || first === 127 || first === 0) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  return false;
};

const resolveRequestUrl = (input, baseUrl) => {
  const raw = String(input || '');
  if (raw.startsWith('/')) {
    if (!baseUrl) throw new Error('Connector baseUrl is not configured');
    return new URL(raw, baseUrl);
  }
  return new URL(raw);
};

const assertAllowedUrl = (url, allowedHosts) => {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Protocol "${url.protocol}" is not allowed`);
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error(`Host "${url.hostname}" is not allowed`);
  }
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`Host "${url.hostname}" is not on the egress allow-list`);
  }
};

const parseResponseBody = async (response, maxResponseBytes) => {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxResponseBytes) {
    throw new Error('Response exceeds the size limit');
  }

  const text = buffer.toString('utf8');
  const contentType = String(response.headers.get('content-type') || '');
  if (contentType.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return text;
};

const createHttp = ({
  baseUrl,
  allowedHosts,
  httpTimeoutMs,
  maxResponseBytes,
}) => {
  const hosts = [];
  if (baseUrl) {
    try {
      hosts.push(new URL(baseUrl).hostname.toLowerCase());
    } catch {
      // Ignore an invalid baseUrl; path-only requests will fail loudly.
    }
  }
  for (const host of allowedHosts) {
    const normalized = String(host || '')
      .trim()
      .toLowerCase();
    if (normalized && !hosts.includes(normalized)) hosts.push(normalized);
  }

  return async (input, init = {}) => {
    let url = resolveRequestUrl(input, baseUrl);
    const method = String(init.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST'].includes(method)) {
      throw new Error(`Method "${method}" is not allowed`);
    }

    const headers = { ...init.headers };
    let body;
    if (init.body !== undefined && init.body !== null) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else {
        body = JSON.stringify(init.body);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    // Follow redirects manually so every hop is re-validated against the
    // allow-list (a redirect is the classic allow-list escape).
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      assertAllowedUrl(url, hosts);

      const response = await fetch(url, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(httpTimeoutMs),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }
        url = new URL(location, url);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return parseResponseBody(response, maxResponseBytes);
    }

    throw new Error('Too many redirects');
  };
};

const pruneCache = () => {
  if (cacheEntries.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cacheEntries) {
    if (entry.expiresAt <= now) cacheEntries.delete(key);
  }
  while (cacheEntries.size > CACHE_MAX_ENTRIES) {
    const oldest = cacheEntries.keys().next().value;
    if (oldest === undefined) break;
    cacheEntries.delete(oldest);
  }
};

const createCache = (scope) => {
  const scopedKey = (key) => `${scope}:${key}`;

  const get = (key) => {
    const entry = cacheEntries.get(scopedKey(key));
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cacheEntries.delete(scopedKey(key));
      return null;
    }
    return entry.value;
  };

  const set = (key, value, ttlMs = CACHE_DEFAULT_TTL_MS) => {
    cacheEntries.set(scopedKey(key), {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    pruneCache();
    return value;
  };

  const getOrSet = async (key, factory, ttlMs = CACHE_DEFAULT_TTL_MS) => {
    const existing = get(key);
    if (existing !== null && existing !== undefined) return existing;
    return set(key, await factory(), ttlMs);
  };

  return Object.freeze({ get, set, getOrSet });
};

const requestCapability = (method, args) =>
  new Promise((resolve, reject) => {
    capabilitySequence += 1;
    const capabilityId = capabilitySequence;
    const timer = setTimeout(() => {
      pendingCapabilities.delete(capabilityId);
      reject(new Error(`Capability "${method}" timed out`));
    }, CAPABILITY_TIMEOUT_MS);

    pendingCapabilities.set(capabilityId, { resolve, reject, timer });
    parentPort.postMessage({
      type: 'capability',
      capabilityId,
      method,
      args: clone(args) || [],
    });
  });

const dot = (left, right) => {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
};

// Ranks candidate vectors against a query vector. All vectors are expected to
// be L2-normalized, so the dot product equals cosine similarity.
const rank = (queryVector, entries) => {
  if (!Array.isArray(queryVector) || !Array.isArray(entries)) return [];
  return entries
    .map((entry, index) => {
      const vector = Array.isArray(entry) ? entry : entry?.vector;
      const score = Array.isArray(vector)
        ? dot(queryVector, vector)
        : Number.NEGATIVE_INFINITY;
      return { index, score, entry };
    })
    .filter((match) => Number.isFinite(match.score))
    .sort((left, right) => right.score - left.score);
};

const compileConnector = (chatbotId, version, source) => {
  const cacheKey = `${chatbotId}:${version}`;
  const existing = compiledConnectors.get(cacheKey);
  if (existing) return existing;

  const context = vm.createContext(Object.create(null));
  const script = new vm.Script(`(function (module, exports) {\n${source}\n})`, {
    filename: `connector:${chatbotId}@${version}`,
  });
  const factory = script.runInContext(context, { timeout: 1000 });
  const moduleRef = { exports: {} };
  factory.call(undefined, moduleRef, moduleRef.exports);

  const exported = moduleRef.exports || {};
  compiledConnectors.set(cacheKey, exported);
  if (compiledConnectors.size > 100) {
    const oldest = compiledConnectors.keys().next().value;
    if (oldest !== cacheKey) compiledConnectors.delete(oldest);
  }
  return exported;
};

const buildContext = ({ chatbotId, args, options, logs }) => {
  const log = (...parts) => {
    if (logs.length >= MAX_LOG_LINES) return;
    logs.push(parts.map((part) => String(part)).join(' '));
  };

  const embed = async (texts) => {
    const inputs = Array.isArray(texts) ? texts : [String(texts || '')];
    const vectors = await requestCapability('embed', [inputs]);
    return Array.isArray(texts) ? vectors : vectors[0];
  };

  return Object.freeze({
    user: deepFreeze(clone(args.user) || null),
    secrets: deepFreeze(clone(options.secrets) || {}),
    intents: deepFreeze(clone(options.intents) || []),
    http: createHttp({
      baseUrl: String(options.baseUrl || ''),
      allowedHosts: Array.isArray(options.allowedHosts)
        ? options.allowedHosts
        : [],
      httpTimeoutMs: options.httpTimeoutMs || 1500,
      maxResponseBytes: options.maxResponseBytes || 256 * 1024,
    }),
    cache: createCache(`${chatbotId}:${options.cacheScope || 'shared'}`),
    embed,
    rank,
    log,
  });
};

const sanitizeResult = (value) => {
  if (value === undefined || value === null) return null;
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') return null;
  if (serialized.length > MAX_RESULT_CHARS) {
    throw new Error('Connector result exceeds the size limit');
  }
  return JSON.parse(serialized);
};

const executeCall = async (message) => {
  const { chatbotId, version, source, fn, args = {}, options = {} } = message;
  const connector = compileConnector(chatbotId, version, source);
  const target = connector[fn];
  if (typeof target !== 'function') {
    throw new Error(`Connector does not export "${fn}"`);
  }

  const logs = [];
  const ctx = buildContext({ chatbotId, args, options, logs });

  let result;
  if (fn === 'verifyIdentity') {
    result = await target(args.token, ctx);
  } else if (fn === 'loadSnapshot') {
    result = await target(ctx.user, ctx);
  } else {
    result = await target(
      {
        message: args.message,
        embedding: args.embedding,
        user: ctx.user,
        snapshot: clone(args.snapshot) ?? null,
        route: clone(args.route) ?? null,
      },
      ctx,
    );
  }

  return { result: sanitizeResult(result), logs };
};

if (parentPort) {
  parentPort.on('message', async (message) => {
    if (message?.type === 'capabilityResult') {
      const pending = pendingCapabilities.get(message.capabilityId);
      if (!pending) return;
      pendingCapabilities.delete(message.capabilityId);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || 'Capability failed'));
      return;
    }

    if (message?.type !== 'call') return;

    try {
      const { result, logs } = await executeCall(message);
      parentPort.postMessage({
        type: 'result',
        callId: message.callId,
        ok: true,
        result,
        logs,
      });
    } catch (error) {
      parentPort.postMessage({
        type: 'result',
        callId: message.callId,
        ok: false,
        error: error?.message || 'Connector call failed',
        logs: [],
      });
    }
  });
}

module.exports = {
  isPrivateHostname,
  rank,
};
