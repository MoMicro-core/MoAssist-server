'use strict';

const {
  ConversationService,
} = require('../../src/modules/conversations/application/conversation-service');
const {
  createDefaultChatbotSettings,
} = require('../../src/modules/chatbots/domain/default-settings');

describe('conversation tier access', () => {
  test('authClient is ignored when the public chatbot does not allow auth conversations', async () => {
    const settings = createDefaultChatbotSettings();
    settings.status = 'published';

    const conversationRepository = {
      create: jest.fn(async (payload) => payload),
      listLifecycleCandidates: jest.fn(async () => []),
    };
    const widgetSessionRepository = {
      create: jest.fn(async (payload) => payload),
    };

    const service = new ConversationService({
      chatbotService: {
        getPublicWidget: jest.fn(async () => ({
          id: 'cb-1',
          ownerUid: 'owner-1',
          settings,
        })),
      },
      chatbotRepository: {
        findById: jest.fn(),
      },
      conversationRepository,
      widgetSessionRepository: {
        ...widgetSessionRepository,
        findByToken: jest.fn(async () => null),
      },
      responderFactory: {},
      connectionManager: {
        publish: jest.fn(),
      },
    });

    await service.createOrRestoreWidgetSession({
      chatbotId: 'cb-1',
      visitor: {
        name: 'Alice',
        email: 'alice@example.com',
      },
      origin: 'https://example.com',
      locale: { language: 'english' },
      authClient: 'website-user-123',
    });

    expect(conversationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authClient: '',
      }),
    );
    expect(widgetSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authClient: '',
      }),
    );
  });
});
