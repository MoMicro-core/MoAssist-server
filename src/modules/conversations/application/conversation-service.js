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

const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const mapConversation = (conversation) => ({
  id: conversation.id,
  chatbotId: conversation.chatbotId,
  status: conversation.status,
  visitor: conversation.visitor,
  locale: conversation.locale || {},
  lastMessagePreview: conversation.lastMessagePreview,
  lastMessageAt: conversation.lastMessageAt,
  unreadForOwner: conversation.unreadForOwner,
  messages: conversation.messages,
});

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
  }

  async createOrRestoreWidgetSession({
    chatbotId,
    token,
    visitor,
    origin,
    locale,
    language,
  }) {
    if (token) {
      const widgetSession =
        await this.widgetSessionRepository.findByToken(token);
      if (widgetSession && widgetSession.chatbotId === chatbotId) {
        const conversation = await this.conversationRepository.findById(
          widgetSession.conversationId,
        );
        if (!conversation) throw new NotFoundError('Conversation not found');
        const preferredLanguage =
          language || widgetSession.locale?.language || locale?.language || '';
        const storedLocale = widgetSession.locale || {};
        const incomingLocale = locale || {};
        const nextLocale = { ...storedLocale, ...incomingLocale };
        if (preferredLanguage) nextLocale.language = preferredLanguage;

        await this.widgetSessionRepository.updateByToken(token, {
          $set: {
            lastActiveAt: new Date(),
            expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
            locale: nextLocale,
          },
        });

        if (
          preferredLanguage &&
          conversation.locale?.language !== preferredLanguage
        ) {
          const conversationDocument =
            await this.conversationRepository.findDocumentById(conversation.id);
          if (conversationDocument) {
            const documentLocale = conversationDocument.locale || {};
            conversationDocument.locale = {
              ...documentLocale,
              language: preferredLanguage,
            };
            await conversationDocument.save();
          }
        }

        const mappedConversation = mapConversation({
          ...conversation,
          locale: nextLocale,
        });

        const chatbot = await this.chatbotService.getPublicWidget(
          chatbotId,
          origin,
          preferredLanguage,
        );
        return {
          token,
          conversation: mappedConversation,
          chatbot,
        };
      }
    }

    const chatbot = await this.chatbotService.getPublicWidget(
      chatbotId,
      origin,
      language || locale?.language || '',
    );
    const leadsForm = chatbot.settings.leadsForm || [];
    const visitorData = {};

    for (const field of leadsForm) {
      const value = visitor?.[field.key];
      if (field.required && !value) {
        throw new BadRequestError(`${field.label} is required`);
      }
      if (value) visitorData[field.key] = value;
    }

    const baseLocale = locale || {};
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
      visitor: visitorData,
      locale: normalizedLocale,
      status: 'open',
      lastMessagePreview: '',
      lastMessageAt: new Date(),
      unreadForOwner: 0,
      messages: [],
    });

    await this.widgetSessionRepository.create({
      token: widgetToken,
      chatbotId,
      conversationId: conversation.id,
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

  async authenticateWidget(token) {
    const widgetSession = await this.widgetSessionRepository.findByToken(token);
    if (!widgetSession) throw new NotFoundError('Widget session not found');
    const conversation = await this.conversationRepository.findById(
      widgetSession.conversationId,
    );
    if (!conversation) throw new NotFoundError('Conversation not found');
    await this.widgetSessionRepository.updateByToken(token, {
      $set: {
        lastActiveAt: new Date(),
        expiresAt: addDays(new Date(), SESSION_TTL_DAYS),
      },
    });
    return { widgetSession, conversation };
  }

  async listForActor(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    const conversations =
      await this.conversationRepository.listByChatbot(chatbotId);
    return conversations.map(mapConversation);
  }

  async listAllForActor(actor, filters = {}) {
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
    const conversation =
      await this.conversationRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, conversation.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }
    return mapConversation(conversation);
  }

  async sendVisitorMessage({ widgetToken, content }) {
    if (!content) throw new BadRequestError('Message content is required');
    const { conversation } = await this.authenticateWidget(widgetToken);
    const chatbot = await this.chatbotRepository.findById(
      conversation.chatbotId,
    );
    const document = await this.conversationRepository.findDocumentById(
      conversation.id,
    );
    const message = createMessage('visitor', content);

    document.messages.push(message);
    document.lastMessagePreview = content.slice(0, 120);
    document.lastMessageAt = message.createdAt;
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

    queueMicrotask(async () => {
      try {
        const responder = this.responderFactory.create(chatbot);
        const answer = await responder.respond({
          chatbot,
          conversation: document.toObject(),
          prompt: content,
        });

        if (!answer) return;

        const refreshed = await this.conversationRepository.findDocumentById(
          document.id,
        );
        if (!refreshed) return;

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
    if (!content) throw new BadRequestError('Message content is required');
    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }

    const message = createMessage('owner', content);
    document.messages.push(message);
    document.lastMessagePreview = content.slice(0, 120);
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

  async markRead(actor, conversationId) {
    const document =
      await this.conversationRepository.findDocumentById(conversationId);
    if (!document) throw new NotFoundError('Conversation not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Conversation is not accessible');
    }

    document.unreadForOwner = 0;
    document.messages = document.messages.map((message) => ({
      ...message.toObject(),
      readByOwner:
        message.authorType === 'visitor' ? true : message.readByOwner,
    }));
    await document.save();

    this.connectionManager.publish(
      `chatbot:${document.chatbotId}`,
      'conversation.read',
      {
        conversationId: document.id,
        chatbotId: document.chatbotId,
      },
    );

    return { read: true };
  }
}

module.exports = { ConversationService };
