'use strict';

const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require('../../../shared/application/errors');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const { TIER_CAPABILITIES } = require('../../../shared/application/premium');
const { createId } = require('../../../shared/application/ids');
const {
  hashPassword,
  verifyPassword,
} = require('../../../shared/application/password');
const {
  addDays,
  SESSION_TTL_DAYS,
} = require('../../auth/application/auth-service');

const normalizeUsername = (value) => String(value || '').trim();

const toStatus = (credential) => ({
  enabled: Boolean(credential?.enabled),
  username: credential?.username || '',
  hasPassword: Boolean(credential?.passwordHash),
});

class ExternalDashboardService {
  constructor({
    chatbotRepository,
    credentialRepository,
    sessionRepository,
    tierCatalog,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.credentialRepository = credentialRepository;
    this.sessionRepository = sessionRepository;
    this.tierCatalog = tierCatalog;
  }

  async assertManageable(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    if (
      !this.tierCatalog.hasCapability(
        chatbot,
        TIER_CAPABILITIES.AUTHENTICATED_WIDGET,
      )
    ) {
      throw new ForbiddenError(
        'Current tier does not allow the external dashboard',
      );
    }
    return chatbot;
  }

  async getStatus(actor, chatbotId) {
    await this.assertManageable(actor, chatbotId);
    const credential =
      await this.credentialRepository.findByChatbotId(chatbotId);
    return toStatus(credential);
  }

  async setCredentials(actor, chatbotId, payload = {}) {
    const chatbot = await this.assertManageable(actor, chatbotId);
    const existing = await this.credentialRepository.findByChatbotId(chatbotId);

    const enabled =
      typeof payload.enabled === 'boolean'
        ? payload.enabled
        : Boolean(existing?.enabled);
    const username =
      payload.username !== undefined
        ? normalizeUsername(payload.username)
        : existing?.username || '';

    const update = {
      ownerUid: chatbot.ownerUid,
      enabled,
      username,
    };

    if (typeof payload.password === 'string' && payload.password.length > 0) {
      if (payload.password.length < 8) {
        throw new BadRequestError('Password must be at least 8 characters');
      }
      const { passwordHash, passwordSalt } = hashPassword(payload.password);
      update.passwordHash = passwordHash;
      update.passwordSalt = passwordSalt;
    }

    const hasPassword =
      Boolean(update.passwordHash) || Boolean(existing?.passwordHash);
    if (enabled && (!username || !hasPassword)) {
      throw new BadRequestError(
        'A username and password are required to enable the external dashboard',
      );
    }

    const saved = await this.credentialRepository.upsert(chatbotId, update);
    return toStatus(saved);
  }

  async login(chatbotId, payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || '');
    const invalid = new UnauthorizedError('Invalid username or password');

    if (!username || !password) throw invalid;

    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw invalid;

    if (
      !this.tierCatalog.hasCapability(
        chatbot,
        TIER_CAPABILITIES.AUTHENTICATED_WIDGET,
      )
    ) {
      throw invalid;
    }

    const credential =
      await this.credentialRepository.findByChatbotId(chatbotId);
    if (!credential || !credential.enabled) throw invalid;
    if (credential.username !== username) throw invalid;
    if (
      !verifyPassword(
        password,
        credential.passwordHash,
        credential.passwordSalt,
      )
    ) {
      throw invalid;
    }

    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
    const session = await this.sessionRepository.create({
      token: createId(),
      uid: chatbot.ownerUid,
      role: 'dashboard',
      data: { dashboardChatbotId: chatbotId },
      expiresAt,
    });

    return {
      token: session.token,
      expiresAt,
      chatbot: {
        id: chatbot.id,
        title: chatbot.settings?.title || '',
        botName: chatbot.settings?.botName || '',
      },
    };
  }
}

module.exports = { ExternalDashboardService };
