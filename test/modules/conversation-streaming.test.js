'use strict';

const {
  ConversationService,
} = require('../../src/modules/conversations/application/conversation-service');

const flushAsync = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const createConversationDocument = () => {
  const document = {
    id: 'conv-1',
    chatbotId: 'chatbot-1',
    ownerUid: 'owner-1',
    status: 'active',
    authClient: '',
    visitor: {},
    locale: { language: 'english' },
    lastMessagePreview: '',
    lastMessageAt: null,
    lastVisitorMessageAt: null,
    unreadForOwner: 0,
    messages: [],
    save: jest.fn(async () => document),
  };

  document.toObject = () => ({
    ...document,
    messages: document.messages.map((message) => ({ ...message })),
    save: undefined,
    toObject: undefined,
  });

  return document;
};

describe('conversation ai streaming', () => {
  test('publishes assistant replies as streaming websocket events by chunks', async () => {
    const document = createConversationDocument();
    const connectionManager = {
      publish: jest.fn(),
    };
    const service = new ConversationService({
      chatbotService: {},
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'chatbot-1',
          settings: {
            inactivityHours: 3,
          },
        })),
      },
      conversationRepository: {
        findDocumentById: jest.fn(async () => document),
        listLifecycleCandidates: jest.fn(async () => []),
      },
      widgetSessionRepository: {},
      responderFactory: {
        create: jest.fn(() => ({
          respondStream: jest.fn(async ({ onTextDelta }) => {
            await onTextDelta('Hello ');
            await onTextDelta('world');
            return 'Hello world';
          }),
        })),
      },
      connectionManager,
    });

    clearInterval(service.statusSyncTimer);
    service.authenticateWidget = jest.fn(async () => ({
      conversation: {
        id: 'conv-1',
        chatbotId: 'chatbot-1',
      },
    }));

    await service.sendVisitorMessage({
      widgetToken: 'widget-token',
      content: 'Hi there',
    });
    await flushAsync();

    const publishedEvents = connectionManager.publish.mock.calls.map(
      ([, event, payload]) => ({
        event,
        payload,
      }),
    );

    expect(
      publishedEvents.filter((item) => item.event === 'message.created'),
    ).toHaveLength(2);
    expect(
      publishedEvents.some((item) => item.event === 'message.stream.started'),
    ).toBe(true);
    expect(
      publishedEvents.filter((item) => item.event === 'message.stream.delta'),
    ).toHaveLength(4);
    expect(
      publishedEvents.some((item) => item.event === 'message.stream.completed'),
    ).toBe(true);

    const assistantMessage = document.messages.find(
      (message) => message.authorType === 'assistant',
    );
    expect(assistantMessage?.content).toBe('Hello world');
  });
});
