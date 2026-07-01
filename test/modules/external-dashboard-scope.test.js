'use strict';

const {
  ConversationService,
} = require('../../src/modules/conversations/application/conversation-service');

// A dashboard token is scoped to ONE chatbot. These tests prove it cannot reach
// another chatbot's inbox even when both chatbots share the same owner.
const buildService = ({ conversations = [], conversationDoc = null } = {}) =>
  new ConversationService({
    chatbotService: {},
    chatbotRepository: {
      findById: jest.fn(async (id) => ({ id, ownerUid: 'owner-1' })),
    },
    conversationRepository: {
      listByChatbot: jest.fn(async () => conversations),
      listLifecycleCandidates: jest.fn(async () => []),
      listByOwner: jest.fn(async () => conversations),
      findDocumentById: jest.fn(async () => conversationDoc),
    },
    widgetSessionRepository: {},
    responderFactory: {},
    connectionManager: { publish: jest.fn() },
  });

const dashboardActor = {
  uid: 'owner-1',
  role: 'dashboard',
  dashboardChatbotId: 'cb-1',
};

describe('external dashboard token scope', () => {
  test('can list its own chatbot inbox', async () => {
    const service = buildService({ conversations: [] });
    await expect(service.listForActor(dashboardActor, 'cb-1')).resolves.toEqual(
      [],
    );
  });

  test('cannot list another chatbot of the same owner', async () => {
    const service = buildService();
    await expect(service.listForActor(dashboardActor, 'cb-2')).rejects.toThrow(
      /not accessible/i,
    );
  });

  test('cannot open a conversation that belongs to another chatbot', async () => {
    const service = buildService({
      conversationDoc: {
        id: 'conv-9',
        ownerUid: 'owner-1',
        chatbotId: 'cb-2',
      },
    });
    await expect(service.getForActor(dashboardActor, 'conv-9')).rejects.toThrow(
      /not accessible/i,
    );
  });

  test('cannot use the cross-chatbot "all conversations" listing', async () => {
    const service = buildService();
    await expect(service.listAllForActor(dashboardActor, {})).rejects.toThrow(
      /not accessible/i,
    );
  });

  test('a normal owner is unaffected and still sees their chatbot', async () => {
    const service = buildService({ conversations: [] });
    const owner = { uid: 'owner-1', role: 'user' };
    await expect(service.listForActor(owner, 'cb-2')).resolves.toEqual([]);
  });

  test('a different user is still rejected', async () => {
    const service = buildService();
    const stranger = { uid: 'someone-else', role: 'user' };
    await expect(service.listForActor(stranger, 'cb-1')).rejects.toThrow(
      /not accessible/i,
    );
  });
});
