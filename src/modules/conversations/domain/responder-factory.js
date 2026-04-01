'use strict';

const { TIER_CAPABILITIES } = require('../../../shared/application/premium');

const buildBaseSystemPrompt = (chatbot) => {
  const botName = chatbot?.settings?.botName || 'AI assistant';
  const title = chatbot?.settings?.title || botName;

  return [
    `You are ${botName}, the AI assistant for "${title}".`,
    'You are not a human support agent. Be transparent that you are an AI assistant whenever the user asks who you are or if there is any ambiguity.',
    'Your job is to help website visitors, answer support and pre-sales questions, and collect the details needed for a human teammate when the request cannot be completed directly.',
    'The platform will give you the user question together with any business information and source material needed to answer it.',
    'When source material is provided, read it carefully and look there for the answer before replying. Those sources can come from approved materials such as website content, uploaded documents, or Google Docs that were prepared for this chatbot.',
    'Give accurate, helpful answers. Do not invent facts, policies, prices, or actions that are not present in the chat history or provided context.',
    'If the information is missing or uncertain, say that clearly and ask a focused follow-up question or suggest handing the conversation to a human.',
    'Follow the chatbot owner instructions below after these base rules.',
  ].join('\n');
};

class ManualResponder {
  async respond() {
    return null;
  }

  async respondStream() {
    return null;
  }
}

class AiResponder {
  constructor({ openai, knowledgeService }) {
    this.openai = openai;
    this.knowledgeService = knowledgeService;
  }

  async buildMessages({ chatbot, conversation, prompt }) {
    const context = await this.knowledgeService.search(chatbot.id, prompt, 5);
    const preferredLanguage =
      typeof conversation?.locale?.language === 'string'
        ? conversation.locale.language
        : '';
    const history = conversation.messages.slice(-12).map((message) => ({
      role: message.authorType === 'visitor' ? 'user' : 'assistant',
      content: message.content,
    }));
    const messages = [
      {
        role: 'system',
        content: [
          buildBaseSystemPrompt(chatbot),
          `Assigned role: ${chatbot.settings.ai.template}.`,
          `Response length: ${chatbot.settings.ai.responseLength}.`,
          preferredLanguage
            ? `Always answer in ${preferredLanguage} language.`
            : '',
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

    return messages;
  }

  async respond({ chatbot, conversation, prompt }) {
    const messages = await this.buildMessages({
      chatbot,
      conversation,
      prompt,
    });

    return this.openai.createChatCompletion({ messages });
  }

  async respondStream({
    chatbot,
    conversation,
    prompt,
    onTextDelta = async () => null,
  }) {
    const messages = await this.buildMessages({
      chatbot,
      conversation,
      prompt,
    });

    return this.openai.streamChatCompletion({
      messages,
      onTextDelta,
    });
  }
}

class ResponderFactory {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.tierCatalog = dependencies.tierCatalog;
  }

  create(chatbot) {
    if (
      chatbot.settings.ai.enabled &&
      this.tierCatalog.hasCapability(chatbot, TIER_CAPABILITIES.AI_RESPONDER)
    ) {
      return new AiResponder(this.dependencies);
    }
    return new ManualResponder();
  }
}

module.exports = { ResponderFactory, AiResponder, ManualResponder };
