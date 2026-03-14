'use strict';

const path = require('node:path');
const { loadDir } = require('../lib/loader');

const getModuleExport = (tree, pathParts, key) => {
  const target = pathParts.reduce((acc, item) => acc[item], tree);
  return key ? target[key] : target;
};

const createServices = async (fastify) => {
  const modules = await loadDir(path.join(process.cwd(), './src/modules'));
  const UserRepository = getModuleExport(
    modules,
    ['auth', 'infrastructure', 'user-repository'],
    'UserRepository',
  );
  const SessionRepository = getModuleExport(
    modules,
    ['auth', 'infrastructure', 'session-repository'],
    'SessionRepository',
  );
  const AuthService = getModuleExport(
    modules,
    ['auth', 'application', 'auth-service'],
    'AuthService',
  );
  const ChatbotRepository = getModuleExport(
    modules,
    ['chatbots', 'infrastructure', 'chatbot-repository'],
    'ChatbotRepository',
  );
  const ChatbotService = getModuleExport(
    modules,
    ['chatbots', 'application', 'chatbot-service'],
    'ChatbotService',
  );
  const SubscriptionRepository = getModuleExport(
    modules,
    ['billing', 'infrastructure', 'subscription-repository'],
    'SubscriptionRepository',
  );
  const BillingService = getModuleExport(
    modules,
    ['billing', 'application', 'billing-service'],
    'BillingService',
  );
  const ConversationRepository = getModuleExport(
    modules,
    ['conversations', 'infrastructure', 'conversation-repository'],
    'ConversationRepository',
  );
  const WidgetSessionRepository = getModuleExport(
    modules,
    ['conversations', 'infrastructure', 'widget-session-repository'],
    'WidgetSessionRepository',
  );
  const ConversationService = getModuleExport(
    modules,
    ['conversations', 'application', 'conversation-service'],
    'ConversationService',
  );
  const ResponderFactory = getModuleExport(
    modules,
    ['conversations', 'domain', 'responder-factory'],
    'ResponderFactory',
  );
  const KnowledgeFileRepository = getModuleExport(
    modules,
    ['knowledge', 'infrastructure', 'knowledge-file-repository'],
    'KnowledgeFileRepository',
  );
  const KnowledgeService = getModuleExport(
    modules,
    ['knowledge', 'application', 'knowledge-service'],
    'KnowledgeService',
  );
  const VectorStore = getModuleExport(
    modules,
    ['knowledge', 'infrastructure', 'vector-store'],
    'VectorStore',
  );
  const embedService = getModuleExport(modules, [
    'widget',
    'application',
    'embed-service',
  ]);

  const userRepository = new UserRepository(fastify.mongodb.user);
  const sessionRepository = new SessionRepository(fastify.mongodb.appSession);
  const chatbotRepository = new ChatbotRepository(fastify.mongodb.chatbot);
  const conversationRepository = new ConversationRepository(
    fastify.mongodb.conversation,
  );
  const widgetSessionRepository = new WidgetSessionRepository(
    fastify.mongodb.widgetSession,
  );
  const subscriptionRepository = new SubscriptionRepository(
    fastify.mongodb.subscription,
  );
  const knowledgeFileRepository = new KnowledgeFileRepository(
    fastify.mongodb.knowledgeFile,
  );

  const billingService = new BillingService({
    userRepository,
    subscriptionRepository,
    stripeGateway: fastify.stripe,
    config: fastify.config,
  });

  const authService = new AuthService({
    userRepository,
    sessionRepository,
    billingService,
    firebaseAuth: fastify.firebaseAuth,
  });

  const chatbotService = new ChatbotService({
    chatbotRepository,
    conversationRepository,
    widgetSessionRepository,
    knowledgeFileRepository,
  });

  const knowledgeService = new KnowledgeService({
    chatbotRepository,
    knowledgeFileRepository,
    vectorStore: new VectorStore({
      openai: fastify.openai,
      baseDirectory: path.join(process.cwd(), 'files'),
      binaryPath: path.join(process.cwd(), 'files', '.bin', 'vector-search'),
    }),
  });

  const responderFactory = new ResponderFactory({
    openai: fastify.openai,
    knowledgeService,
  });

  const conversationService = new ConversationService({
    chatbotService,
    chatbotRepository,
    conversationRepository,
    widgetSessionRepository,
    userRepository,
    responderFactory,
    connectionManager: fastify.client,
  });

  return {
    authService,
    billingService,
    chatbotService,
    conversationService,
    knowledgeService,
    userRepository,
    embedService,
  };
};

module.exports = { createServices };
