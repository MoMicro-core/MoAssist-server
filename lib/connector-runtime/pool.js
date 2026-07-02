'use strict';

// Main-thread side of the connector runtime: a small fixed pool of
// worker_threads. Calls are sticky per chatbot (stable worker choice keeps
// the compiled-connector and session caches warm), bounded per worker, and
// raced against a deadline here so a hung connector never blocks a reply.

const path = require('node:path');
const { Worker } = require('node:worker_threads');

const DEFAULT_WORKER_PATH = path.join(__dirname, 'worker.js');
const MAX_MISSED_DEADLINES = 3;

const hashString = (value = '') => {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

class ConnectorWorkerPool {
  constructor({
    workerPath = DEFAULT_WORKER_PATH,
    size = 2,
    resourceLimits = { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    queueLimit = 16,
    capabilities = {},
    log = () => null,
  } = {}) {
    this.workerPath = workerPath;
    this.size = Math.max(1, size);
    this.resourceLimits = resourceLimits;
    this.queueLimit = queueLimit;
    this.capabilities = capabilities;
    this.log = log;
    this.callSequence = 0;
    this.destroyed = false;
    this.slots = Array.from({ length: this.size }, (_, index) =>
      this.spawnWorker(index),
    );
  }

  spawnWorker(index) {
    const slot = {
      index,
      worker: new Worker(this.workerPath, {
        resourceLimits: this.resourceLimits,
      }),
      pending: new Map(),
      missedDeadlines: 0,
      replaced: false,
    };

    slot.worker.unref();
    slot.worker.on('message', (message) => {
      this.handleWorkerMessage(slot, message);
    });
    slot.worker.on('error', (error) => {
      this.log(`connector worker ${index} error: ${error.message}`);
      this.replaceWorker(slot);
    });
    slot.worker.on('exit', (code) => {
      if (this.destroyed || slot.replaced) return;
      this.log(`connector worker ${index} exited with code ${code}`);
      this.replaceWorker(slot);
    });

    return slot;
  }

  replaceWorker(slot) {
    if (this.destroyed || slot.replaced) return;
    slot.replaced = true;

    for (const [callId, pending] of slot.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'Connector worker crashed' });
      slot.pending.delete(callId);
    }

    slot.worker.terminate().catch(() => null);
    this.slots[slot.index] = this.spawnWorker(slot.index);
  }

  handleWorkerMessage(slot, message) {
    if (message?.type === 'capability') {
      this.handleCapability(slot, message);
      return;
    }
    if (message?.type !== 'result') return;

    const pending = slot.pending.get(message.callId);
    if (!pending) return;
    slot.pending.delete(message.callId);
    clearTimeout(pending.timer);
    slot.missedDeadlines = 0;

    for (const line of message.logs || []) {
      this.log(`connector ${pending.chatbotId}: ${line}`);
    }

    if (message.ok) pending.resolve({ ok: true, result: message.result });
    else pending.resolve({ ok: false, error: message.error });
  }

  async handleCapability(slot, message) {
    const handler = this.capabilities[message.method];
    let reply;
    try {
      if (typeof handler !== 'function') {
        throw new Error(`Unknown capability "${message.method}"`);
      }
      const handlerArgs = Array.isArray(message.args) ? message.args : [];
      const result = await handler(...handlerArgs);
      reply = {
        type: 'capabilityResult',
        capabilityId: message.capabilityId,
        ok: true,
        result,
      };
    } catch (error) {
      reply = {
        type: 'capabilityResult',
        capabilityId: message.capabilityId,
        ok: false,
        error: error?.message || 'Capability failed',
      };
    }

    try {
      slot.worker.postMessage(reply);
    } catch {
      // Worker already gone; the in-flight call resolves via replaceWorker.
    }
  }

  pickSlot(chatbotId) {
    return this.slots[hashString(chatbotId) % this.size];
  }

  async execute({
    chatbotId,
    fn,
    source,
    version,
    args = {},
    options = {},
    timeoutMs = 2500,
  }) {
    if (this.destroyed) {
      return { ok: false, error: 'Connector runtime is stopped' };
    }

    const slot = this.pickSlot(chatbotId);
    if (slot.pending.size >= this.queueLimit) {
      return { ok: false, error: 'Connector worker is overloaded' };
    }

    this.callSequence += 1;
    const callId = this.callSequence;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!slot.pending.has(callId)) return;
        slot.pending.delete(callId);
        slot.missedDeadlines += 1;
        // A single timeout is usually a slow merchant API; only a run of
        // consecutive misses indicates a synchronous hang worth a restart.
        if (slot.missedDeadlines >= MAX_MISSED_DEADLINES) {
          this.replaceWorker(slot);
        }
        resolve({ ok: false, error: 'Connector call timed out' });
      }, timeoutMs);

      slot.pending.set(callId, { resolve, timer, chatbotId });
      try {
        slot.worker.postMessage({
          type: 'call',
          callId,
          chatbotId,
          fn,
          source,
          version,
          args,
          options,
        });
      } catch (error) {
        slot.pending.delete(callId);
        clearTimeout(timer);
        resolve({ ok: false, error: error?.message || 'Worker unavailable' });
      }
    });
  }

  async destroy() {
    this.destroyed = true;
    for (const slot of this.slots) {
      for (const [callId, pending] of slot.pending) {
        clearTimeout(pending.timer);
        pending.resolve({ ok: false, error: 'Connector runtime is stopped' });
        slot.pending.delete(callId);
      }
      await slot.worker.terminate().catch(() => null);
    }
  }
}

module.exports = { ConnectorWorkerPool };
