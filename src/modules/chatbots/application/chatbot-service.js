'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createId } = require('../../../shared/application/ids');
const { deepMerge } = require('../../../shared/application/object');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const {
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const { hasPremiumAccess } = require('../../../shared/application/premium');
const { createDefaultChatbotSettings } = require('../domain/default-settings');

const normalizeOrigin = (value = '') => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }
};

const isAllowedOrigin = (domains = ['*'], origin = '') => {
  if (!origin || domains.includes('*')) return true;
  const hostname = normalizeOrigin(origin);
  return domains.some((domain) => normalizeOrigin(domain) === hostname);
};

class ChatbotService {
  constructor({
    chatbotRepository,
    conversationRepository,
    widgetSessionRepository,
    knowledgeFileRepository,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.conversationRepository = conversationRepository;
    this.widgetSessionRepository = widgetSessionRepository;
    this.knowledgeFileRepository = knowledgeFileRepository;
  }

  async list(actor) {
    const chatbots =
      actor.role === 'admin'
        ? await this.chatbotRepository.listAll()
        : await this.chatbotRepository.listByOwner(actor.uid);

    const enriched = [];

    for (const chatbot of chatbots) {
      const [conversationsCount, unreadCount, filesCount] = await Promise.all([
        this.conversationRepository.countByChatbot(chatbot.id),
        this.conversationRepository.countUnreadByChatbot(chatbot.id),
        this.knowledgeFileRepository.countByChatbot(chatbot.id),
      ]);

      enriched.push({
        ...chatbot,
        metrics: {
          conversationsCount,
          unreadCount,
          filesCount,
        },
      });
    }

    return enriched;
  }

  async create(actor, payload = {}) {
    const settings = deepMerge(
      createDefaultChatbotSettings(),
      payload.settings || {},
    );

    const chatbot = await this.chatbotRepository.create({
      id: createId(),
      ownerUid: actor.uid,
      settings,
    });

    return chatbot;
  }

  async getForActor(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    return chatbot;
  }

  async update(actor, chatbotId, patch = {}) {
    const document = await this.chatbotRepository.findDocumentById(chatbotId);
    if (!document) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }

    if (patch.settings) {
      const merged = deepMerge(document.settings.toObject(), patch.settings);
      if (merged.ai.enabled && !hasPremiumAccess(document.toObject())) {
        throw new ForbiddenError(
          'Premium subscription is required to enable AI',
        );
      }
      document.settings = merged;
    }

    await document.save();
    return document.toObject();
  }

  async delete(actor, chatbotId) {
    await this.getForActor(actor, chatbotId);
    const files = await this.knowledgeFileRepository.listByChatbot(chatbotId);

    await Promise.all(
      files.map(async (file) => {
        await fs.rm(file.directory, { recursive: true, force: true });
      }),
    );

    await Promise.all([
      this.chatbotRepository.deleteById(chatbotId),
      this.conversationRepository.deleteByChatbot(chatbotId),
      this.widgetSessionRepository.deleteByChatbot(chatbotId),
      this.knowledgeFileRepository.deleteByChatbot(chatbotId),
      fs.rm(path.join(process.cwd(), 'files', 'chatbots', chatbotId), {
        recursive: true,
        force: true,
      }),
    ]);

    return { deleted: true };
  }

  async getPublicWidget(chatbotId, origin = '') {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (chatbot.settings.status !== 'published') {
      throw new ForbiddenError('Chatbot is not published');
    }
    if (!isAllowedOrigin(chatbot.settings.domains, origin)) {
      throw new ForbiddenError('Origin is not allowed');
    }
    return {
      id: chatbot.id,
      ownerUid: chatbot.ownerUid,
      premiumStatus: chatbot.premiumStatus,
      premiumPlan: chatbot.premiumPlan,
      premiumCurrentPeriodEnd: chatbot.premiumCurrentPeriodEnd,
      settings: chatbot.settings,
    };
  }

  async getInstallCode(actor, chatbotId, baseUrl) {
    const chatbot = await this.getForActor(actor, chatbotId);
    const scriptUrl = `${baseUrl}/chat/script/${chatbot.id}`;
    const iframeUrl = `${baseUrl}/chat/iframe/${chatbot.id}`;

    return {
      chatbotId: chatbot.id,
      scriptUrl,
      iframeUrl,
      scriptSnippet: `<script src="${scriptUrl}" defer></script>`,
      iframeSnippet: `<iframe src="${iframeUrl}" title="${chatbot.settings.botName}" style="width:420px;height:680px;border:0;"></iframe>`,
    };
  }

  async getAnalytics(actor, chatbotId) {
    await this.getForActor(actor, chatbotId);
    const [totalConversations, openConversations, unreadConversations, totals] =
      await Promise.all([
        this.conversationRepository.countByChatbot(chatbotId),
        this.conversationRepository.countByChatbot(chatbotId, {
          status: 'open',
        }),
        this.conversationRepository.countUnreadByChatbot(chatbotId),
        this.conversationRepository.aggregateTotals(chatbotId),
      ]);

    return {
      totalConversations,
      openConversations,
      unreadConversations,
      totalMessages: totals.totalMessages,
      totalLeads: totals.totalLeads,
    };
  }
}

module.exports = { ChatbotService, isAllowedOrigin };
