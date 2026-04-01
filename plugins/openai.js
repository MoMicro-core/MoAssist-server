'use strict';

const fp = require('fastify-plugin');
const OpenAI = require('openai');
const { UnauthorizedError } = require('../src/shared/application/errors');

class OpenAIGateway {
  constructor(config) {
    this.config = config;
    this.client = config.enabled ? new OpenAI({ apiKey: config.key }) : null;
  }

  assertConfigured() {
    if (!this.client) {
      throw new UnauthorizedError('OpenAI is not configured');
    }
  }

  async createChatCompletion({ messages, temperature = 0.2 }) {
    this.assertConfigured();
    const response = await this.client.chat.completions.create({
      model: this.config.chat.model,
      messages,
      temperature,
    });
    return response.choices[0]?.message?.content?.trim() || '';
  }

  async streamChatCompletion({
    messages,
    temperature = 0.2,
    onTextDelta = async () => null,
  }) {
    this.assertConfigured();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.chat.model,
        messages,
        temperature,
        stream: true,
      });

      const forwarder = createWordDeltaForwarder(onTextDelta);
      let content = '';

      for await (const chunk of stream) {
        const delta = extractDeltaText(chunk);
        if (!delta) continue;
        content += delta;
        await forwarder.push(delta);
      }

      await forwarder.flush();
      return content.trim();
    } catch {
      const content = await this.createChatCompletion({
        messages,
        temperature,
      });
      const forwarder = createWordDeltaForwarder(onTextDelta);
      await forwarder.push(content);
      await forwarder.flush();
      return content.trim();
    }
  }

  async createEmbedding(input) {
    this.assertConfigured();
    const response = await this.client.embeddings.create({
      model: this.config.embeddings.model,
      input,
    });
    return response.data[0].embedding;
  }

  async createEmbeddings(input) {
    this.assertConfigured();
    const response = await this.client.embeddings.create({
      model: this.config.embeddings.model,
      input,
    });
    return response.data.map((entry) => entry.embedding);
  }
}

function extractDeltaText(chunk = {}) {
  const value = chunk?.choices?.[0]?.delta?.content;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';

  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      return typeof part?.text === 'string' ? part.text : '';
    })
    .join('');
}

function createWordDeltaForwarder(onTextDelta) {
  let pending = '';

  const emitAvailable = async (force = false) => {
    while (pending) {
      if (force) {
        const chunk = pending;
        pending = '';
        await onTextDelta(chunk);
        return;
      }

      const boundaryIndex = pending.search(/\s/);
      if (boundaryIndex === -1) return;

      let endIndex = boundaryIndex + 1;
      while (endIndex < pending.length && /\s/.test(pending[endIndex])) {
        endIndex += 1;
      }

      const chunk = pending.slice(0, endIndex);
      pending = pending.slice(endIndex);
      await onTextDelta(chunk);
    }
  };

  return {
    push: async (value = '') => {
      if (!value) return;
      pending += value;
      await emitAvailable(false);
    },
    flush: async () => {
      await emitAvailable(true);
    },
  };
}

const openaiPlugin = async (fastify) => {
  fastify.decorate('openai', new OpenAIGateway(fastify.config.openai));
};

module.exports = fp(openaiPlugin, {
  fastify: '5.x',
});
module.exports.OpenAIGateway = OpenAIGateway;
