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

const openaiPlugin = async (fastify) => {
  fastify.decorate('openai', new OpenAIGateway(fastify.config.openai));
};

module.exports = fp(openaiPlugin, {
  fastify: '5.x',
});
