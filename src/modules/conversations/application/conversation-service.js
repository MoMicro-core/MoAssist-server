'use strict';

const { createId } = require('../../../shared/application/ids');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const { createMessage } = require('../domain/message-factory');

const SESSION_TTL_DAYS = 30;
const STATUS_SYNC_INTERVAL_MS = 60 * 1000;
const DEFAULT_INACTIVITY_HOURS = 3;
const MAX_INACTIVITY_HOURS = 24;

const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const toPlainObject = (value) =>
  typeof value?.toObject === 'function' ? value.toObject() : { ...value };

const normalizeConversationStatus = (status) => {
  if (status === 'open') return 'active';
  if (status === 'pending' || status === 'closed') return status;
  return 'active';
};

const mapConversation = (conversation) => ({
  id: conversation.id,
  chatbotId: conversation.chatbotId,
  ownerUid: conversation.ownerUid,
  authClient: conversation.authClient || '',
  status: normalizeConversationStatus(conversation.status),
  visitor: conversation.visitor || {},
  locale: conversation.locale || {},
  lastMessagePreview: conversation.lastMessagePreview,
  lastMessageAt: conversation.lastMessageAt,
  lastVisitorMessageAt: conversation.lastVisitorMessageAt || null,
  unreadForOwner: conversation.unreadForOwner,
  createdAt: conversation.createdAt || null,
  updatedAt: conversation.updatedAt || null,
  messages: Array.isArray(conversation.messages)
    ? conversation.messages.map(toPlainObject)
    : [],
});

const normalizeContent = (content) => String(content || '').trim();

const normalizeVisitorData = (visitor = {}) => {
  if (!visitor || typeof visitor !== 'object' || Array.isArray(visitor)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(visitor).flatMap(([key, value]) => {
      if (value === undefined || value === null) return [];
      const normalized = String(value).trim();
      return normalized ? [[key, normalized]] : [];
    }),
  );
};

const isAuthConversation = (conversation) => Boolean(conversation.authClient);

const getInactivityHours = (chatbot) => {
  const value = chatbot?.settings?.inactivityHours;
  if (!Number.isInteger(value)) return DEFAULT_INACTIVITY_HOURS;
  return Math.min(MAX_INACTIVITY_HOURS, Math.max(1, value));
};

const getInactivityBaseDate = (conversation, authConversation) => {
  if (authConversation) {
    return (
      conversation.lastVisitorMessageAt ||
      conversation.lastMessageAt ||
      conversation.createdAt ||
      conversation.updatedAt ||
      null
    );
  }

  return (
    conversation.lastMessageAt ||
    conversation.createdAt ||
    conversation.updatedAt ||
    null
  );
};

const mergeLocale = (
  currentLocale = {},
  incomingLocale = {},
  language = '',
) => {
  const baseCurrentLocale = currentLocale || {};
  const baseIncomingLocale = incomingLocale || {};
  const nextLocale = {
    ...baseCurrentLocale,
    ...baseIncomingLocale,
  };
  if (language) nextLocale.language = language;
  return nextLocale;
};

class ConversationService {
  constructor({
    chatbotService,
    chatbotRepository,
    conversationRepository,
    widgetSessionRepository,
    responderFactory,
    connectionManager,
  }) {
    this.chatbotService = chatbotService;
    this.chatbotRepository = chatbotRepository;
    this.conversationRepository = conversationRepository;
    this.widgetSessionRepository = widgetSessionRepository;
    this.responderFactory = responderFactory;
    this.connectionManager = connectionManager;
    this.statusSyncPromise = null;

    this.statusSyncTimer = setInterval(() => {
      this.syncConversationStatuses().catch(() => null);
    }, STATUS_SYNC_INTERVAL_MS);
    if (typeof this.statusSyncTimer.unref === 'function') {
      this.statusSyncTimer.unref();
    }

    queueMicrotask(() => {
      this.syncConversationStatuses().catch(() => null);
    });
  }

  applyConversationLifecycle(document, chatbot, now = new Date()) {
    const authConversation = isAuthConversation(document);
    const previousStatus = normalizeConversationStatus(document.status);
    const inactivityHours = getInactivityHours(chatbot);
    const inactivityBase = getInactivityBaseDate(document, authConversation);

    let nextStatus;
    if (authConversation) {
      const expiresAt =
        inactivityBase instanceof Date
          ? inactivityBase.getTime() + inactivityHours * 60 * 60 * 1000
          : Number.POSITIVE_INFINITY;
      nextStatus = expiresAt <= now.getTime() ? 'pending' : 'active';
    } else if (previousStatus === 'closed') {
      nextStatus = 'closed';
    } else {
      const expiresAt =
        inactivityBase instanceof Date
          ? inactivityBase.getTime() + inactivityHours * 60 * 60 * 1000
          : Number.POSITIVE_INFINITY;
      nextStatus = expiresAt <= now.getTime() ? 'closed' : 'active';
    }

    const statusChanged =
      document.status !== nextStatus || previousStatus !== nextStatus;
    if (statusChanged) document.status = nextStatus;

    return {
      previousStatus,
      nextStatus,
      statusChanged,
    };
  }

  publishConversationUpdate(conversation) {
    const mappedConversation = mapConversation(
      typeof conversation?.toObject === 'function'
        ? conversation.toObject()
        : conversation,
    );
    const payload = {
      conversationId: mappedConversation.id,
      chatbotId: mappedConversation.chatbotId,
      conversation: mappedConversation,
    };

    this.connectionManager.publish(
      `conversation:${mappedConversation.id}`,
      'conversation.updated',
      payload,
    );
    this.connectionManager.publish(
      `chatbot:${mappedConversation.chatbotId}`,
      'conversation.updated',
      payload,
    );

    return mappedConversation;
  }

  publishConversationRead(conversation, actorType) {
    const payload = {
      conversationId: conversation.id,
      chatbotId: conversation.chatbotId,
      actorType,
    };

    this.connectionManager.publish(
      `conversation:${conversation.id}`,
      'conversation.read',
      payload,
    );
    this.connectionManager.publish(
      `chatbot:${conversation.chatbotId}`,
      'conversation.read',
      payload,
    );
  }

  validateVisitorData(chatbot, visitor = {}) {
    const normalizedVisitor = normalizeVisitorData(visitor);
    if (chatbot?.settings?.auth) return normalizedVisitor;

    const visitorData = {};
    const leadsForm = chatbot?.settings?.leadsForm || [];
    for (const field of leadsForm) {
      const value = normalizedVisitor[field.key];
      if (field.required && !value) {
        throw new BadRequestError(`${field.label} is required`);
      }
      if (value) visitorData[field.key] = value;
    }
    return visitorData;
  }

  async syncConversationStatuses() {
    if (this.statusSyncPromise) return this.statusSyncPromise;

    this.statusSyncPromise = (async () => {
      const documents =
        await this.conversationRepository.listLifecycleCandidates();
      const chatbotCache = new Map();

      for (const document of documents) {
        let chatbot = chatbotCache.get(document.chatbotId);
        if (chatbot === undefined) {
          chatbot = await this.chatbotRepository.findById(document.chatbotId);
          chatbot = chatbot || null;
          chatbotCache.set(document.chatbotId, chatbot);
        }
        if (!chatbot) continue;

        const lifecycle = this.applyConversationLifecycle(document, chatbot);
        if (!document.isModified()) continue;

        await document.save();
        if (lifecycle.statusChanged) this.publishConversationUpdate(document);
      }
    })().finally(() => {
      this.statusSyncPromise = null;
    });

    return this.statusSyncPromise;
  }

  async issueWidgetSession({
    chatbot,
    conversationDocument,
    authClient = '',
    visitorData = {},
    origin = '',
    locale = {},
    language = '',
  }) {
    const widgetToken = createId();
    const nextLocale = mergeLocale(
      conversationDocument.locale,
      locale,
      language,
    );

    conversationDocument.widgetSessionToken = widgetToken;
    conversationDocument.locale = nextLocale;
    if (authClient) conversationDocument.authClient = authClient;
    if (Object.keys(visitorData).length) {
      const currentVisitor = conversationDocument.visitor || {};
      conversationDocument.visitor = {
        ...currentVisitor,
        ...visitorData,
      };
    }

    const lifecycle = this.applyConversationLifecycle(
      conversationDocument,
      chatbot,
    );
    const sessionVisitorData = conversationDocument.visitor || {};

    if (conversationDocument.isModified()) {
      await conversationDocument.save();
    }
    if (lifecycle.statusChanged) {
      this.publishConversationUpdate(conversationDocument);
    }

    await this.widgetSessionRepository.create({
      token: widgetToken,
      chatbotId: conversationDocument.chatbotId,
      conversationId: conversationDocument.id,
      authClient: authClient || '',
      visitorData: {
        ...sessionVisitorData,
      },
      locale: nextLocale,
      origin,
      lastActiveAt: new Date(),
      expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
    });

    return {
      token: widgetToken,
      conversation: mapConversation(conversationDocument.toObject()),
      chatbot,
    };
  }

  async createOrRestoreWidgetSession({
    chatbotId,
    token,
    visitor,
    origin,
    locale,
    language,
    authClient,
  }) {
    const requestedLanguage = language || locale?.language || '';
    const chatbot = await this.chatbotService.getPublicWidget(
      chatbotId,
      origin,
      requestedLanguage,
    );
    const providedAuthClient = normalizeContent(authClient);
    const normalizedAuthClient = chatbot.settings.auth
      ? providedAuthClient
      : '';
    const visitorData = this.validateVisitorData(chatbot, visitor || {});
    const baseLocale = locale || {};

    if (chatbot.settings.auth && !normalizedAuthClient) {
      throw new BadRequestError(
        'authClient is required when chatbot auth is enabled',
      );
    }

    if (token) {
      const widgetSession =
        await this.widgetSessionRepository.findByToken(token);
      if (widgetSession && widgetSession.chatbotId === chatbotId) {
        const conversationDocument =
          await this.conversationRepository.findDocumentById(
            widgetSession.conversationId,
          );
        if (!conversationDocument) {
          throw new NotFoundError('Conversation not found');
        }

        const conversationAuthClient =
          widgetSession.authClient || conversationDocument.authClient || '';
        if (
          conversationAuthClient &&
          conversationAuthClient !== providedAuthClient
        ) {
          // Fall back to authClient lookup below.
        } else {
          const preferredLanguage =
            requestedLanguage ||
            widgetSession.locale?.language ||
            conversationDocument.locale?.language ||
            '';
          const nextLocale = mergeLocale(
            conversationDocument.locale,
            baseLocale,
            preferredLanguage,
          );

          conversationDocument.locale = nextLocale;
          if (Object.keys(visitorData).length) {
            const currentVisitor = conversationDocument.visitor || {};
            conversationDocument.visitor = {
              ...currentVisitor,
              ...visitorData,
            };
          }
          if (chatbot.settings.auth && normalizedAuthClient) {
            conversationDocument.authClient = normalizedAuthClient;
          }

          const lifecycle = this.applyConversationLifecycle(
            conversationDocument,
            chatbot,
          );

          const widgetVisitorData = widgetSession.visitorData || {};
          await this.widgetSessionRepository.updateByToken(token, {
            $set: {
              authClient: conversationAuthClient || normalizedAuthClient || '',
              lastActiveAt: new Date(),
              expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
              locale: nextLocale,
              origin,
              visitorData: {
                ...widgetVisitorData,
                ...visitorData,
              },
            },
          });

          if (conversationDocument.isModified()) {
            await conversationDocument.save();
          }
          if (lifecycle.statusChanged) {
            this.publishConversationUpdate(conversationDocument);
          }

          return {
            token,
            conversation: mapConversation(conversationDocument.toObject()),
            chatbot,
          };
        }
      }
    }

    if (chatbot.settings.auth) {
      const conversationDocument =
        await this.conversationRepository.findDocumentByChatbotAndAuthClient(
          chatbotId,
          normalizedAuthClient,
        );
      if (conversationDocument) {
        return this.issueWidgetSession({
          chatbot,
          conversationDocument,
          authClient: normalizedAuthClient,
          visitorData,
          origin,
          locale: baseLocale,
          language: requestedLanguage,
        });
      }
    }

    const normalizedLocale = { ...baseLocale };
    if (chatbot.settings.defaultLanguage) {
      normalizedLocale.language = chatbot.settings.defaultLanguage;
    }

    const widgetToken = createId();
    const conversation = await this.conversationRepository.create({
      id: createId(),
      chatbotId,
      ownerUid: chatbot.ownerUid,
      widgetSessionToken: widgetToken,
      authClient: normalizedAuthClient,
      visitor: visitorData,
      locale: normalizedLocale,
      status: 'active',
      lastMessagePreview: '',
      lastMessageAt: new Date(),
      lastVisitorMessageAt: null,
      unreadForOwner: 0,
      messages: [],
    });

    await this.widgetSessionRepository.create({
      token: widgetToken,
      chatbotId,
      conversationId: conversation.id,
      authClient: normalizedAuthClient,
      visitorData,
      locale: normalizedLocale,
      origin,
      lastActiveAt: new Date(),
      expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
    });

    this.connectionManager.publish(
      `chatbot:${chatbotId}`,
      'conversation.created',
      {
        conversation: mapConversation(conversation),
      },
    );

    return {
      token: widgetToken,
      conversation: mapConversation(conversation),
      chatbot,
    };
  }

  async authenticateWidget(token, authClient = '') {
    const widgetSession = await this.widgetSessionRepository.findByToken(token);
    if (!widgetSession) throw new NotFoundError('Widget session not found');

    const conversationDocument =
      await this.conversationRepository.findDocumentById(
        widgetSession.conversationId,
      );
    if (!conversationDocument) {
      throw new NotFoundError('Conversation not found');
    }

    const conversationAuthClient =
      widgetSession.authClient || conversationDocument.authClient || '';
    if (conversationAuthClient) {
      const normalizedAuthClient = normalizeContent(authClient);
      if (!normalizedAuthClient) {
        throw new BadRequestError(
          'authClient is required for authenticated widget sessions',
        );
      }
      if (normalizedAuthClient !== conversationAuthClient) {
        throw new ForbiddenError('Widget session is not accessible');
      }
    }

    const chatbot = await this.chatbotRepository.findById(
      conversationDocument.chatbotId,
    );
    if (!chatbot) throw new NotFoundError('Chatbot not found');

    const lifecycle = this.applyConversationLifecycle(
      conversationDocument,
      chatbot,
    );
    let readChanged = false;

    conversationDocument.messages = conversationDocument.messages.map(
      (message) => {
        const plainMessage = toPlainObject(message);
        if (
          plainMessage.authorType === 'visitor' ||
          plainMessage.readByVisitor
        ) {
          return plainMessage;
        }

        readChanged = true;
        return {
          ...plainMessage,
          readByVisitor: true,
          read: true,
        };
      },
    );

    if (conversationDocument.isModified()) {
      await conversationDocument.save();
    }

    const refreshedWidgetSession =
      await this.widgetSessionRepository.updateByToken(token, {
        $set: {
          authClient: conversationAuthClient,
          lastActiveAt: new Date(),
          expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
        },
      });
    const updatedWidgetSession = refreshedWidgetSession || widgetSession;

    if (lifecycle.statusChanged) {
      this.publishConversationUpdate(conversationDocument);
    }
    if (readChanged) {
      this.publishConversationRead(conversationDocument, 'visitor');
    }

    return {
      widgetSession: updatedWidgetSession,
      conversation: mapConversation(conversationDocument.toObject()),
    };
  }

  async listForActor(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }

    await this.syncConversationStatuses();
    const conversations =
      await this.conversationRepository.listByChatbot(chatbotId);
    return conversations.map(mapConversation);
  }

  async listAllForActor(actor, filters = {}) {
    await this.syncConversationStatuses();

    const normalized = {};
    if (filters.status) normalized.status = filters.status;
    if (filters.chatbotId) normalized.chatbotId = filters.chatbotId;
    const conversations = await this.conversationRepository.listByOwner(
      actor.uid,
      normalized,
    );
    return conversations.map(mapConversation);
  }

  async getForActor(actor, conversationId) {
    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }

    const chatbot = await this.chatbotRepository.findById(document.chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');

    const lifecycle = this.applyConversationLifecycle(document, chatbot);
    if (document.isModified()) await document.save();
    if (lifecycle.statusChanged) this.publishConversationUpdate(document);

    return mapConversation(document.toObject());
  }

  async sendVisitorMessage({ widgetToken, authClient = '', content }) {
    const normalizedContent = normalizeContent(content);
    if (!normalizedContent) {
      throw new BadRequestError('Message content is required');
    }

    const { conversation } = await this.authenticateWidget(
      widgetToken,
      authClient,
    );
    const chatbot = await this.chatbotRepository.findById(
      conversation.chatbotId,
    );
    if (!chatbot) throw new NotFoundError('Chatbot not found');

    const document = await this.conversationRepository.findDocumentById(
      conversation.id,
    );
    if (!document) throw new NotFoundError('Conversation not found');
    if (normalizeConversationStatus(document.status) === 'closed') {
      throw new BadRequestError('Conversation is closed');
    }

    const previousStatus = normalizeConversationStatus(document.status);
    const message = createMessage('visitor', normalizedContent);

    document.status = 'active';
    document.messages.push(message);
    document.lastMessagePreview = normalizedContent.slice(0, 120);
    document.lastMessageAt = message.createdAt;
    document.lastVisitorMessageAt = message.createdAt;
    document.unreadForOwner += 1;
    await document.save();

    const payload = {
      conversationId: document.id,
      chatbotId: document.chatbotId,
      message,
    };

    this.connectionManager.publish(
      `conversation:${document.id}`,
      'message.created',
      payload,
    );
    this.connectionManager.publish(
      `chatbot:${document.chatbotId}`,
      'message.created',
      payload,
    );
    if (previousStatus !== 'active') this.publishConversationUpdate(document);

    queueMicrotask(async () => {
      try {
        const responder = this.responderFactory.create(chatbot);
        const answer = await responder.respond({
          chatbot,
          conversation: document.toObject(),
          prompt: normalizedContent,
        });

        if (!answer) return;

        const refreshed = await this.conversationRepository.findDocumentById(
          document.id,
        );
        if (!refreshed) return;
        if (normalizeConversationStatus(refreshed.status) === 'closed') return;

        const aiMessage = createMessage('assistant', answer);
        refreshed.messages.push(aiMessage);
        refreshed.lastMessagePreview = answer.slice(0, 120);
        refreshed.lastMessageAt = aiMessage.createdAt;
        await refreshed.save();

        const eventPayload = {
          conversationId: refreshed.id,
          chatbotId: refreshed.chatbotId,
          message: aiMessage,
        };

        this.connectionManager.publish(
          `conversation:${refreshed.id}`,
          'message.created',
          eventPayload,
        );
        this.connectionManager.publish(
          `chatbot:${refreshed.chatbotId}`,
          'message.created',
          eventPayload,
        );
      } catch {
        return;
      }
    });

    return payload;
  }

  async sendOwnerMessage(actor, conversationId, content) {
    const normalizedContent = normalizeContent(content);
    if (!normalizedContent) {
      throw new BadRequestError('Message content is required');
    }

    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }

    const chatbot = await this.chatbotRepository.findById(document.chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');

    const lifecycle = this.applyConversationLifecycle(document, chatbot);
    if (document.isModified()) await document.save();
    if (lifecycle.statusChanged) this.publishConversationUpdate(document);

    if (normalizeConversationStatus(document.status) === 'closed') {
      throw new BadRequestError('Conversation is closed');
    }

    const message = createMessage('owner', normalizedContent);
    document.messages.push(message);
    document.lastMessagePreview = normalizedContent.slice(0, 120);
    document.lastMessageAt = message.createdAt;
    await document.save();

    const payload = {
      conversationId: document.id,
      chatbotId: document.chatbotId,
      message,
    };

    this.connectionManager.publish(
      `conversation:${document.id}`,
      'message.created',
      payload,
    );
    this.connectionManager.publish(
      `chatbot:${document.chatbotId}`,
      'message.created',
      payload,
    );

    return payload;
  }

  async closeForWidget(widgetToken, authClient = '') {
    const { conversation } = await this.authenticateWidget(
      widgetToken,
      authClient,
    );
    const document = await this.conversationRepository.findDocumentById(
      conversation.id,
    );
    if (!document) throw new NotFoundError('Conversation not found');
    if (isAuthConversation(document)) {
      throw new BadRequestError('Authenticated conversations cannot be closed');
    }

    if (normalizeConversationStatus(document.status) !== 'closed') {
      document.status = 'closed';
      await document.save();
      this.publishConversationUpdate(document);
    }

    return {
      closed: true,
      conversation: mapConversation(document.toObject()),
    };
  }

  async closeForActor(actor, conversationId) {
    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }
    if (isAuthConversation(document)) {
      throw new BadRequestError('Authenticated conversations cannot be closed');
    }

    if (normalizeConversationStatus(document.status) !== 'closed') {
      document.status = 'closed';
      await document.save();
      this.publishConversationUpdate(document);
    }

    return {
      closed: true,
      conversation: mapConversation(document.toObject()),
    };
  }

  async markRead(actor, conversationId) {
    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }

    let changed = false;
    document.unreadForOwner = 0;
    document.messages = document.messages.map((message) => {
      const plainMessage = toPlainObject(message);
      if (plainMessage.authorType !== 'visitor' || plainMessage.readByOwner) {
        return plainMessage;
      }

      changed = true;
      return {
        ...plainMessage,
        readByOwner: true,
        read: true,
      };
    });

    if (changed || document.isModified()) {
      await document.save();
      this.publishConversationRead(document, 'owner');
    }

    return { read: true };
  }

  async markReadByWidget(widgetToken) {
    const widgetSession =
      await this.widgetSessionRepository.findByToken(widgetToken);
    if (!widgetSession) throw new NotFoundError('Widget session not found');

    const document = await this.conversationRepository.findDocumentById(
      widgetSession.conversationId,
    );
    if (!document) throw new NotFoundError('Conversation not found');

    let changed = false;
    document.messages = document.messages.map((message) => {
      const plainMessage = toPlainObject(message);
      if (plainMessage.authorType === 'visitor' || plainMessage.readByVisitor) {
        return plainMessage;
      }

      changed = true;
      return {
        ...plainMessage,
        readByVisitor: true,
        read: true,
      };
    });

    if (changed) {
      await document.save();
      this.publishConversationRead(document, 'visitor');
    }

    return { read: true };
  }
}

module.exports = { ConversationService };
