'use strict';

const OpenAI = require('openai');
const fp = require('fastify-plugin');

class Chat {
  constructor({ openai, model, system }) {
    this.model = model;
    this.messages = [{ role: 'system', content: system }];
    this.openai = openai;
  }

  loadChatHistory(history) {
    this.messages.push({ role: 'user', content: history });
  }

  async textMessage({ text }) {
    this.messages.push({ role: 'user', content: text });
    return await this.message();
  }

  async message() {
    const res = await this.openai.chat.completions.create({
      model: this.model,
      messages: this.messages,
      temperature: 0.7,
    });
    this.messages.push({
      role: 'assistant',
      content: res.choices[0].message.content,
    });
    return res.choices[0].message.content;
  }
}

const openaiPlugin = async (fastify) => {
  fastify.log.info('Initializing OpenAI Plugin');
  const options = fastify.config.openai;

  if (!options.enabled || !options.chat) {
    return void fastify.log.info('Skip Initializing OpenAI Plugin');
  }

  if (fastify.openai) return;
  const openai = new OpenAI({ apiKey: options.key });
  const openaiCollection = {};
  openaiCollection.createChat = ({ system }) =>
    new Chat({
      openai,
      model: options.chat.model,
      system,
    });

  openaiCollection.api = openai;
  fastify.decorate('openai', openaiCollection);

  if (!fastify.openai) {
    fastify.log.info('Skip Initializing OpenAI Plugin');
  }
};

module.exports = fp(openaiPlugin, {
  fastify: '5.x',
});
