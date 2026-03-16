'use strict';

const { hasPremiumAccess } = require('../../../shared/application/premium');

class ManualResponder {
  async respond() {
    return null;
  }
}

class AiResponder {
  constructor({ openai, knowledgeService }) {
    this.openai = openai;
    this.knowledgeService = knowledgeService;
  }

  async respond({ chatbot, conversation, prompt }) {
    const context = await this.knowledgeService.search(chatbot.id, prompt, 5);
    const history = conversation.messages.slice(-12).map((message) => ({
      role: message.authorType === 'visitor' ? 'user' : 'assistant',
      content: message.content,
    }));
    const messages = [
      {
        role: 'system',
        content: [
          `You are ${chatbot.settings.ai.template}.`,
          `Response length: ${chatbot.settings.ai.responseLength}.`,
          chatbot.settings.ai.guidelines,
          context.length
            ? `Relevant context:\n${context.map((item) => item.content).join('\n\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      ...history,
      { role: 'user', content: prompt },
    ];

    return this.openai.createChatCompletion({ messages });
  }
}

class ResponderFactory {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  create(chatbot) {
    if (chatbot.settings.ai.enabled && hasPremiumAccess(chatbot)) {
      return new AiResponder(this.dependencies);
    }
    return new ManualResponder();
  }
}

module.exports = { ResponderFactory };
