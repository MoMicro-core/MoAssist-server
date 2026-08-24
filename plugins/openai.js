'use strict';

const fp = require('fastify-plugin');
const OpenAI = require('openai');
const { UnauthorizedError } = require('../src/shared/application/errors');

// Snake-case is the wire format the API expects; isolated here so the rest of
// the gateway stays in the project's camelCase style.
const MAX_TOKENS_PARAM = 'max_completion_tokens';
const maxTokenParam = (value) => (value ? { [MAX_TOKENS_PARAM]: value } : {});

class OpenAIGateway {
  constructor(config, log = () => null) {
    this.config = config;
    this.log = log;
    this.client = config.enabled ? new OpenAI({ apiKey: config.key }) : null;
  }

  assertConfigured() {
    if (!this.client) {
      throw new UnauthorizedError('OpenAI is not configured');
    }
  }

  async createChatCompletion({ messages, temperature = 0.2, maxTokens }) {
    this.assertConfigured();
    const response = await this.client.chat.completions.create({
      model: this.config.chat.model,
      messages,
      temperature,
      ...maxTokenParam(maxTokens),
    });
    return response.choices[0]?.message?.content?.trim() || '';
  }

  async streamChatCompletion({
    messages,
    temperature = 0.2,
    maxTokens,
    onTextDelta = async () => null,
  }) {
    this.assertConfigured();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.chat.model,
        messages,
        temperature,
        ...maxTokenParam(maxTokens),
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
    } catch (streamError) {
      this.log(
        'streaming completion failed, retrying without stream',
        streamError,
      );
      const content = await this.createChatCompletion({
        messages,
        temperature,
        maxTokens,
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
  fastify.decorate(
    'openai',
    new OpenAIGateway(fastify.config.openai, (message, error) =>
      fastify.log.error({ err: error }, `[openai] ${message}`),
    ),
  );
};

module.exports = fp(openaiPlugin, {
  fastify: '5.x',
});
module.exports.OpenAIGateway = OpenAIGateway;
