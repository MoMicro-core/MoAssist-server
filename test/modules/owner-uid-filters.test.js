'use strict';

const billingConfig = require('../../config/billing');
const { createTierCatalog } = require('../../src/shared/application/premium');
const { ForbiddenError } = require('../../src/shared/application/errors');
const {
  ChatbotService,
} = require('../../src/modules/chatbots/application/chatbot-service');
const {
  ConversationService,
} = require('../../src/modules/conversations/application/conversation-service');
const {
  BillingService,
} = require('../../src/modules/billing/application/billing-service');

const adminActor = { uid: 'admin-1', role: 'admin' };
const userActor = { uid: 'user-1', role: 'user' };

describe('admin-only ownerUid filters (connector PRD §5)', () => {
  describe('chatbotService.list', () => {
    const build = () => {
      const chatbotRepository = {
        listByOwner: jest.fn(async () => []),
        listAll: jest.fn(async () => []),
      };
      const service = new ChatbotService({
        chatbotRepository,
        conversationRepository: {
          countByChatbot: jest.fn(async () => 0),
          countUnreadByChatbot: jest.fn(async () => 0),
        },
        widgetSessionRepository: {},
        knowledgeFileRepository: { countByChatbot: jest.fn(async () => 0) },
        openai: {},
        brandingStorage: {},
        countriesConfig: {},
        tierCatalog: createTierCatalog(billingConfig),
      });
      return { service, chatbotRepository };
    };

    test('admin lists the target owner, not their own account', async () => {
      const { service, chatbotRepository } = build();
      await service.list(adminActor, { ownerUid: 'merchant-9' });
      expect(chatbotRepository.listByOwner).toHaveBeenCalledWith('merchant-9');
      expect(chatbotRepository.listAll).not.toHaveBeenCalled();
    });

    test('non-admin is rejected', async () => {
      const { service, chatbotRepository } = build();
      await expect(
        service.list(userActor, { ownerUid: 'merchant-9' }),
      ).rejects.toThrow(ForbiddenError);
      expect(chatbotRepository.listByOwner).not.toHaveBeenCalled();
    });

    test('without the filter behavior is unchanged', async () => {
      const { service, chatbotRepository } = build();
      await service.list(userActor);
      expect(chatbotRepository.listByOwner).toHaveBeenCalledWith('user-1');
    });
  });

  describe('conversationService.listAllForActor', () => {
    const build = () => {
      const conversationRepository = {
        listByOwner: jest.fn(async () => []),
        listLifecycleCandidates: jest.fn(async () => []),
      };
      const service = new ConversationService({
        chatbotService: {},
        chatbotRepository: { findById: jest.fn() },
        conversationRepository,
        widgetSessionRepository: {},
        responderFactory: {},
        connectionManager: { publish: jest.fn() },
      });
      clearInterval(service.statusSyncTimer);
      return { service, conversationRepository };
    };

    test('admin lists the target owner conversations', async () => {
      const { service, conversationRepository } = build();
      await service.listAllForActor(adminActor, {
        ownerUid: 'merchant-9',
        status: 'active',
      });
      expect(conversationRepository.listByOwner).toHaveBeenCalledWith(
        'merchant-9',
        { status: 'active' },
      );
    });

    test('non-admin is rejected', async () => {
      const { service, conversationRepository } = build();
      await expect(
        service.listAllForActor(userActor, { ownerUid: 'merchant-9' }),
      ).rejects.toThrow(ForbiddenError);
      expect(conversationRepository.listByOwner).not.toHaveBeenCalled();
    });
  });

  describe('billingService.getSummary', () => {
    const build = () => {
      const userRepository = {
        findByUid: jest.fn(async (uid) => ({
          uid,
          stripeCustomerId: `cus_${uid}`,
        })),
      };
      const chatbotRepository = { listByOwner: jest.fn(async () => []) };
      const service = new BillingService({
        userRepository,
        chatbotRepository,
        subscriptionRepository: { listByChatbot: jest.fn(async () => []) },
        stripeGateway: {},
        config: { billing: billingConfig },
        tierCatalog: createTierCatalog(billingConfig),
      });
      return { service, userRepository, chatbotRepository };
    };

    test('admin reads the target owner summary', async () => {
      const { service, userRepository, chatbotRepository } = build();
      const summary = await service.getSummary(adminActor, {
        ownerUid: 'merchant-9',
      });
      expect(userRepository.findByUid).toHaveBeenCalledWith('merchant-9');
      expect(chatbotRepository.listByOwner).toHaveBeenCalledWith('merchant-9');
      expect(summary.customerId).toBe('cus_merchant-9');
    });

    test('non-admin is rejected', async () => {
      const { service, userRepository } = build();
      await expect(
        service.getSummary(userActor, { ownerUid: 'merchant-9' }),
      ).rejects.toThrow(ForbiddenError);
      expect(userRepository.findByUid).not.toHaveBeenCalled();
    });
  });
});
