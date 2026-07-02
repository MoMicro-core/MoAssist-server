'use strict';

const path = require('node:path');
const {
  ConnectorWorkerPool,
} = require('../../../../lib/connector-runtime/pool');
const { normalizeVector } = require('../domain/intent-router');

// Platform-facing wrapper over the worker pool. Owns the capability handlers
// exposed to sandboxed connectors (currently `embed`, backed by the same
// embedding source the RAG pipeline uses, normalized per §19.5).
class ConnectorRuntime {
  constructor({ openai, config = {}, log = () => null }) {
    this.config = config;
    this.pool = new ConnectorWorkerPool({
      workerPath: path.join(
        process.cwd(),
        'lib',
        'connector-runtime',
        'worker.js',
      ),
      size: config.workerCount || 2,
      resourceLimits: {
        maxOldGenerationSizeMb: config.workerMaxOldGenerationSizeMb || 128,
        stackSizeMb: 4,
      },
      queueLimit: config.workerQueueLimit || 16,
      capabilities: {
        embed: async (inputs) => {
          const texts = Array.isArray(inputs) ? inputs : [inputs];
          const vectors = await openai.createEmbeddings(
            texts.map((text) => String(text || '')),
          );
          return vectors.map((vector) => normalizeVector(vector));
        },
      },
      log,
    });
  }

  async run({ connector, fn, args = {}, timeoutMs }) {
    return this.pool.execute({
      chatbotId: connector.chatbotId,
      fn,
      source: connector.source,
      version: connector.version,
      args,
      options: {
        baseUrl: connector.baseUrl || '',
        allowedHosts: connector.allowedHosts || [],
        secrets: connector.secrets || {},
        intents: connector.intents || [],
        cacheScope: connector.cacheScope || 'shared',
        httpTimeoutMs: this.config.httpTimeoutMs || 1500,
        maxResponseBytes: this.config.maxResponseBytes || 256 * 1024,
      },
      timeoutMs: timeoutMs || this.config.fetchTimeoutMs || 2500,
    });
  }

  async stop() {
    await this.pool.destroy();
  }
}

module.exports = { ConnectorRuntime };
