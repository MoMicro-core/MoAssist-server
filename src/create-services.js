'use strict';

const path = require('node:path');
const { loadDir } = require('../lib/loader');
const { createTierCatalog } = require('./shared/application/premium');
const { SecretBox } = require('./shared/application/secret-box');

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
  const EmbedService = getModuleExport(
    modules,
    ['widget', 'application', 'embed-service'],
    'EmbedService',
  );
  const ExternalDashboardCredentialRepository = getModuleExport(
    modules,
    ['dashboard', 'infrastructure', 'external-dashboard-credential-repository'],
    'ExternalDashboardCredentialRepository',
  );
  const ExternalDashboardService = getModuleExport(
    modules,
    ['dashboard', 'application', 'external-dashboard-service'],
    'ExternalDashboardService',
  );
  const ConnectorRepository = getModuleExport(
    modules,
    ['realtime', 'infrastructure', 'connector-repository'],
    'ConnectorRepository',
  );
  const ConnectorRuntime = getModuleExport(
    modules,
    ['realtime', 'infrastructure', 'connector-runtime'],
    'ConnectorRuntime',
  );
  const RealtimeService = getModuleExport(
    modules,
    ['realtime', 'application', 'realtime-service'],
    'RealtimeService',
  );

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
  const tierCatalog = createTierCatalog(fastify.config.billing || {});
  // Shared structured logger for the services that previously swallowed
  // failures silently.
  const log = (message, error) =>
    error
      ? fastify.log.error({ err: error }, message)
      : fastify.log.warn(message);

  const billingService = new BillingService({
    userRepository,
    chatbotRepository,
    subscriptionRepository,
    stripeGateway: fastify.stripe,
    config: fastify.config,
    tierCatalog,
    log,
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
    openai: fastify.openai,
    brandingStorage: fastify.supabaseStorage,
    countriesConfig: fastify.config.countries,
    tierCatalog,
  });

  const knowledgeService = new KnowledgeService({
    chatbotRepository,
    knowledgeFileRepository,
    vectorStore: new VectorStore({
      openai: fastify.openai,
      baseDirectory: path.join(process.cwd(), 'files'),
      binaryPath: path.join(process.cwd(), 'files', '.bin', 'vector-search'),
    }),
    fileStorage: fastify.supabaseStorage,
    tierCatalog,
    openai: fastify.openai,
    knowledgeBucket: fastify.config.supabase?.knowledgeBucket || '',
    log: (line) => fastify.log?.info?.(line),
  });

  const realtimeLog = (line) => fastify.log?.info?.(line);
  const realtimeBaseConfig = fastify.config.realtime || {};
  const realtimeConfig = {
    ...realtimeBaseConfig,
    connectorsBucket: fastify.config.supabase?.connectorsBucket || '',
  };
  const connectorRepository = new ConnectorRepository(
    fastify.mongodb.merchantConnector,
  );
  const connectorRuntime = new ConnectorRuntime({
    openai: fastify.openai,
    config: realtimeConfig,
    log: realtimeLog,
  });
  const realtimeService = new RealtimeService({
    chatbotRepository,
    widgetSessionRepository,
    connectorRepository,
    connectorStorage: fastify.supabaseStorage,
    runtime: connectorRuntime,
    openai: fastify.openai,
    tierCatalog,
    secretBox: new SecretBox(realtimeConfig.secretsKey),
    config: realtimeConfig,
    log: realtimeLog,
  });

  const responderFactory = new ResponderFactory({
    openai: fastify.openai,
    knowledgeService,
    tierCatalog,
    realtimeService,
    log,
  });

  const conversationService = new ConversationService({
    log,
    chatbotService,
    chatbotRepository,
    conversationRepository,
    widgetSessionRepository,
    responderFactory,
    connectionManager: fastify.client,
  });

  const embedService = new EmbedService();

  const externalDashboardCredentialRepository =
    new ExternalDashboardCredentialRepository(
      fastify.mongodb.externalDashboardCredential,
    );

  const externalDashboardService = new ExternalDashboardService({
    chatbotRepository,
    credentialRepository: externalDashboardCredentialRepository,
    sessionRepository,
    tierCatalog,
  });

  fastify.addHook('onClose', async () => {
    await connectorRuntime.stop();
  });

  return {
    authService,
    billingService,
    chatbotService,
    conversationService,
    knowledgeService,
    userRepository,
    embedService,
    externalDashboardService,
    realtimeService,
  };
};

module.exports = { createServices };
