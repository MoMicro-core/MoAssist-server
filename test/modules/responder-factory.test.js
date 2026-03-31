'use strict';

const {
  AiResponder,
} = require('../../src/modules/conversations/domain/responder-factory');
const {
  createDefaultChatbotSettings,
} = require('../../src/modules/chatbots/domain/default-settings');

describe('ai responder prompt', () => {
  test('includes base prompt and owner instructions in the system message', async () => {
    const openai = {
      createChatCompletion: jest.fn(async () => 'Test response'),
    };
    const knowledgeService = {
      search: jest.fn(async () => [
        { content: 'Refunds are processed within 5 business days.' },
      ]),
    };
    const responder = new AiResponder({ openai, knowledgeService });
    const settings = createDefaultChatbotSettings();
    settings.title = 'Acme Support';
    settings.botName = 'Acme AI';
    settings.ai.template = 'Customer support copilot';
    settings.ai.guidelines = 'Always ask for an order number for refund cases.';

    await responder.respond({
      chatbot: {
        id: 'cb-1',
        settings,
      },
      conversation: {
        locale: { language: 'english' },
        messages: [
          {
            authorType: 'visitor',
            content: 'Where is my refund?',
          },
        ],
      },
      prompt: 'Where is my refund?',
    });

    expect(openai.createChatCompletion).toHaveBeenCalledTimes(1);
    const [{ messages }] = openai.createChatCompletion.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(
      'You are Acme AI, the AI assistant for "Acme Support".',
    );
    expect(messages[0].content).toContain('You are not a human support agent.');
    expect(messages[0].content).toContain(
      'The platform will give you the user question together with any business information and source material needed to answer it.',
    );
    expect(messages[0].content).toContain(
      'Those sources can come from approved materials such as website content, uploaded documents, or Google Docs that were prepared for this chatbot.',
    );
    expect(messages[0].content).toContain(
      'Assigned role: Customer support copilot.',
    );
    expect(messages[0].content).toContain(
      'Always ask for an order number for refund cases.',
    );
    expect(messages[0].content).toContain(
      'Relevant context:\nRefunds are processed within 5 business days.',
    );
  });
});
