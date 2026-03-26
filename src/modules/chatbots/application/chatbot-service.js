'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createId } = require('../../../shared/application/ids');
const { deepMerge } = require('../../../shared/application/object');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const { hasPremiumAccess } = require('../../../shared/application/premium');
const { createDefaultChatbotSettings } = require('../domain/default-settings');

const DEFAULT_LANGUAGE = 'english';
const LANGUAGE_PACK_FIELDS = new Set([
  'title',
  'botName',
  'initialMessage',
  'inputPlaceholder',
  'suggestedMessages',
  'leadsFormTitle',
  'leadsFormLabels',
  'aiTemplate',
  'aiGuidelines',
]);
const LANGUAGE_ALIASES = {
  en: 'english',
  'en-us': 'english',
  'en-gb': 'english',
  de: 'german',
  'de-de': 'german',
  fr: 'french',
  'fr-fr': 'french',
  es: 'spanish',
  'es-es': 'spanish',
  it: 'italian',
  'it-it': 'italian',
  pt: 'portuguese',
  'pt-pt': 'portuguese',
  'pt-br': 'portuguese',
  nl: 'dutch',
  'nl-nl': 'dutch',
  cs: 'czech',
  'cs-cz': 'czech',
  da: 'danish',
  'da-dk': 'danish',
  fi: 'finnish',
  'fi-fi': 'finnish',
  el: 'greek',
  'el-gr': 'greek',
  hu: 'hungarian',
  'hu-hu': 'hungarian',
  no: 'norwegian',
  nb: 'norwegian',
  nn: 'norwegian',
  'no-no': 'norwegian',
  pl: 'polish',
  'pl-pl': 'polish',
  ro: 'romanian',
  'ro-ro': 'romanian',
  ru: 'russian',
  'ru-ru': 'russian',
  sv: 'swedish',
  'sv-se': 'swedish',
  tr: 'turkish',
  'tr-tr': 'turkish',
  uk: 'ukrainian',
  'uk-ua': 'ukrainian',
};

const normalizeLanguage = (value = '') =>
  String(value || '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();

const canonicalizeLanguage = (value = '') => {
  const normalized = normalizeLanguage(value);
  if (!normalized) return '';
  if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];
  const [base] = normalized.split('-');
  if (LANGUAGE_ALIASES[base]) return LANGUAGE_ALIASES[base];
  return normalized;
};

const collectAllowedLanguages = (countriesConfig = {}) => {
  const localized = Object.values(countriesConfig.localizationByCountry || {});
  const languages = localized
    .map((item) => normalizeLanguage(item?.language))
    .filter(Boolean);
  const unique = new Set(languages);
  unique.add(DEFAULT_LANGUAGE);
  return [...unique].sort((left, right) => left.localeCompare(right));
};

const getText = (value = '', fallback = '') =>
  typeof value === 'string' ? value : fallback;

const getTextArray = (value = []) =>
  Array.isArray(value) ? value.map((item) => getText(item, '')) : [];

const extractLanguagePack = (settings = {}) => ({
  title: getText(settings.title, ''),
  botName: getText(settings.botName, ''),
  initialMessage: getText(settings.initialMessage, ''),
  inputPlaceholder: getText(settings.inputPlaceholder, ''),
  suggestedMessages: getTextArray(settings.suggestedMessages),
  leadsFormTitle: getText(settings.leadsFormTitle, ''),
  leadsFormLabels: Array.isArray(settings.leadsForm)
    ? settings.leadsForm.map((field) => getText(field?.label, ''))
    : [],
  aiTemplate: getText(settings.ai?.template, ''),
  aiGuidelines: getText(settings.ai?.guidelines, ''),
});

const normalizeIndexedArray = (value = [], fallback = []) =>
  fallback.map((item, index) => getText(value?.[index], item));

const normalizeLanguagePack = (pack = {}, fallbackPack = {}) => ({
  title: getText(pack.title, fallbackPack.title || ''),
  botName: getText(pack.botName, fallbackPack.botName || ''),
  initialMessage: getText(
    pack.initialMessage,
    fallbackPack.initialMessage || '',
  ),
  inputPlaceholder: getText(
    pack.inputPlaceholder,
    fallbackPack.inputPlaceholder || '',
  ),
  suggestedMessages: normalizeIndexedArray(
    pack.suggestedMessages,
    fallbackPack.suggestedMessages || [],
  ),
  leadsFormTitle: getText(
    pack.leadsFormTitle,
    fallbackPack.leadsFormTitle || '',
  ),
  leadsFormLabels: normalizeIndexedArray(
    pack.leadsFormLabels,
    fallbackPack.leadsFormLabels || [],
  ),
  aiTemplate: getText(pack.aiTemplate, fallbackPack.aiTemplate || ''),
  aiGuidelines: getText(pack.aiGuidelines, fallbackPack.aiGuidelines || ''),
});

const applyLanguagePack = (settings = {}, pack = {}) => {
  settings.title = pack.title;
  settings.botName = pack.botName;
  settings.initialMessage = pack.initialMessage;
  settings.inputPlaceholder = pack.inputPlaceholder;
  settings.suggestedMessages = pack.suggestedMessages;
  settings.leadsFormTitle = pack.leadsFormTitle;
  settings.leadsForm = (settings.leadsForm || []).map((field, index) => ({
    ...field,
    label: pack.leadsFormLabels[index] || getText(field?.label, ''),
  }));
  const aiSettings = settings.ai || {};
  settings.ai = {
    ...aiSettings,
    template: pack.aiTemplate,
    guidelines: pack.aiGuidelines,
  };
};

const createLanguageHash = (language, content) =>
  crypto
    .createHash('sha1')
    .update(`${language}:${JSON.stringify(content)}`)
    .digest('hex');

const DEFAULT_INACTIVITY_HOURS = 3;
const MAX_INACTIVITY_HOURS = 24;

const validateLanguagePatch = (patch = {}, sourcePack = {}) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new BadRequestError('Language patch must be an object');
  }

  for (const key of Object.keys(patch)) {
    if (!LANGUAGE_PACK_FIELDS.has(key)) {
      throw new BadRequestError(`Unsupported language field: ${key}`);
    }
  }

  const assertString = (key) => {
    if (patch[key] !== undefined && typeof patch[key] !== 'string') {
      throw new BadRequestError(`${key} must be a string`);
    }
  };

  assertString('title');
  assertString('botName');
  assertString('initialMessage');
  assertString('inputPlaceholder');
  assertString('leadsFormTitle');
  assertString('aiTemplate');
  assertString('aiGuidelines');

  if (patch.suggestedMessages !== undefined) {
    if (
      !Array.isArray(patch.suggestedMessages) ||
      patch.suggestedMessages.some((item) => typeof item !== 'string')
    ) {
      throw new BadRequestError(
        'suggestedMessages must be an array of strings',
      );
    }

    if (
      patch.suggestedMessages.length !== sourcePack.suggestedMessages.length
    ) {
      throw new BadRequestError('suggestedMessages length must stay unchanged');
    }
  }

  if (patch.leadsFormLabels !== undefined) {
    if (
      !Array.isArray(patch.leadsFormLabels) ||
      patch.leadsFormLabels.some((item) => typeof item !== 'string')
    ) {
      throw new BadRequestError('leadsFormLabels must be an array of strings');
    }

    if (patch.leadsFormLabels.length !== sourcePack.leadsFormLabels.length) {
      throw new BadRequestError('leadsFormLabels length must stay unchanged');
    }
  }
};

const mergeLanguagePack = (currentPack = {}, patch = {}) => ({
  title: patch.title ?? currentPack.title,
  botName: patch.botName ?? currentPack.botName,
  initialMessage: patch.initialMessage ?? currentPack.initialMessage,
  inputPlaceholder: patch.inputPlaceholder ?? currentPack.inputPlaceholder,
  suggestedMessages: patch.suggestedMessages ?? currentPack.suggestedMessages,
  leadsFormTitle: patch.leadsFormTitle ?? currentPack.leadsFormTitle,
  leadsFormLabels: patch.leadsFormLabels ?? currentPack.leadsFormLabels,
  aiTemplate: patch.aiTemplate ?? currentPack.aiTemplate,
  aiGuidelines: patch.aiGuidelines ?? currentPack.aiGuidelines,
});

const parseJsonResponse = (value = '') => {
  try {
    return JSON.parse(value);
  } catch {
    // ignore and fallback to extracting the first JSON object
  }

  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
};

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
    openai,
    countriesConfig,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.conversationRepository = conversationRepository;
    this.widgetSessionRepository = widgetSessionRepository;
    this.knowledgeFileRepository = knowledgeFileRepository;
    this.openai = openai;
    this.allowedLanguages = collectAllowedLanguages(countriesConfig || {});
  }

  normalizeConversationSettings(settings = {}, strict = true) {
    if (settings.auth === undefined) {
      settings.auth = false;
    } else if (typeof settings.auth !== 'boolean') {
      if (strict) throw new BadRequestError('auth must be a boolean');
      settings.auth = settings.auth === true;
    }

    const inactivityHours = settings.inactivityHours;
    if (inactivityHours === undefined || inactivityHours === null) {
      settings.inactivityHours = DEFAULT_INACTIVITY_HOURS;
      return;
    }

    if (!Number.isInteger(inactivityHours)) {
      if (strict) {
        throw new BadRequestError('inactivityHours must be an integer');
      }
      settings.inactivityHours = DEFAULT_INACTIVITY_HOURS;
      return;
    }

    if (inactivityHours < 1 || inactivityHours > MAX_INACTIVITY_HOURS) {
      if (strict) {
        throw new BadRequestError(
          `inactivityHours must be between 1 and ${MAX_INACTIVITY_HOURS}`,
        );
      }
      settings.inactivityHours = Math.min(
        MAX_INACTIVITY_HOURS,
        Math.max(1, inactivityHours),
      );
      return;
    }

    settings.inactivityHours = inactivityHours;
  }

  normalizeDefaultLanguage(value, strict = true) {
    const language = canonicalizeLanguage(value) || DEFAULT_LANGUAGE;
    if (this.allowedLanguages.includes(language)) return language;
    if (!strict) return DEFAULT_LANGUAGE;
    throw new BadRequestError(
      `defaultLanguage must be one of: ${this.allowedLanguages.join(', ')}`,
    );
  }

  resolvePreferredLanguage(value, fallbackLanguage) {
    const fallback = this.normalizeDefaultLanguage(fallbackLanguage, false);
    const candidate = canonicalizeLanguage(value);
    if (!candidate) return fallback;
    return this.allowedLanguages.includes(candidate) ? candidate : fallback;
  }

  normalizeTranslations(rawTranslations, sourcePack) {
    const translations =
      rawTranslations && typeof rawTranslations === 'object'
        ? rawTranslations
        : {};
    const result = {};

    for (const language of this.allowedLanguages) {
      result[language] = normalizeLanguagePack(
        translations[language],
        sourcePack,
      );
    }

    return result;
  }

  hasLanguageCoverage(settings, sourcePack) {
    const translations = settings?.translations;
    if (!translations || typeof translations !== 'object') return false;

    return this.allowedLanguages.every((language) => {
      const pack = translations[language];
      if (!pack || typeof pack !== 'object') return false;
      return (
        Array.isArray(pack.suggestedMessages) &&
        pack.suggestedMessages.length === sourcePack.suggestedMessages.length &&
        Array.isArray(pack.leadsFormLabels) &&
        pack.leadsFormLabels.length === sourcePack.leadsFormLabels.length
      );
    });
  }

  didTranslatableContentChange(previousSettings, nextSettings) {
    const previous = extractLanguagePack(previousSettings);
    const next = extractLanguagePack(nextSettings);
    return JSON.stringify(previous) !== JSON.stringify(next);
  }

  async translatePack(sourcePack, sourceLanguage) {
    const raw = await this.openai.createChatCompletion({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Translate chatbot JSON text. Reply with JSON only.',
        },
        {
          role: 'user',
          content: `sourceLanguage=${sourceLanguage}\ntargetLanguages=${this.allowedLanguages.join(',')}\ncontent=${JSON.stringify(sourcePack)}\nReturn {"translations":{"<language>":{"title":"","botName":"","initialMessage":"","inputPlaceholder":"","suggestedMessages":[],"leadsFormTitle":"","leadsFormLabels":[],"aiTemplate":"","aiGuidelines":""}}}. Keep arrays lengths unchanged and preserve placeholders/URLs.`,
        },
      ],
    });
    const parsed = parseJsonResponse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestError('Failed to translate chatbot content');
    }

    const translations = parsed.translations || parsed;
    if (!translations || typeof translations !== 'object') {
      throw new BadRequestError('Failed to parse chatbot translations');
    }

    return this.normalizeTranslations(translations, sourcePack);
  }

  async localizeSettings(
    settings,
    { forceTranslate = false, translateIfMissing = true } = {},
  ) {
    this.normalizeConversationSettings(settings);
    const defaultLanguage = this.normalizeDefaultLanguage(
      settings.defaultLanguage,
    );
    settings.defaultLanguage = defaultLanguage;

    const sourcePack = extractLanguagePack(settings);
    const hasCoverage = this.hasLanguageCoverage(settings, sourcePack);
    const shouldTranslate =
      forceTranslate || (translateIfMissing && !hasCoverage);
    let translations =
      settings.translations && typeof settings.translations === 'object'
        ? settings.translations
        : {};

    if (shouldTranslate) {
      translations = await this.translatePack(sourcePack, defaultLanguage);
    } else if (hasCoverage) {
      translations = this.normalizeTranslations(translations, sourcePack);
    }

    const selectedPack =
      shouldTranslate || hasCoverage
        ? normalizeLanguagePack(translations[defaultLanguage], sourcePack)
        : sourcePack;
    applyLanguagePack(settings, selectedPack);
    settings.translations = translations;
    settings.translationSourceHash = createLanguageHash(
      defaultLanguage,
      selectedPack,
    );
  }

  buildPublicSettings(rawSettings = {}, preferredLanguage = '') {
    const settings = deepMerge(createDefaultChatbotSettings(), rawSettings);
    this.normalizeConversationSettings(settings, false);
    const fallbackLanguage = this.normalizeDefaultLanguage(
      settings.defaultLanguage,
      false,
    );
    const defaultLanguage = this.resolvePreferredLanguage(
      preferredLanguage,
      fallbackLanguage,
    );
    settings.defaultLanguage = defaultLanguage;

    const sourcePack = extractLanguagePack(settings);
    const translations = this.normalizeTranslations(
      settings.translations,
      sourcePack,
    );
    const selectedPack = translations[defaultLanguage] || sourcePack;
    applyLanguagePack(settings, selectedPack);

    delete settings.translations;
    delete settings.translationSourceHash;

    return settings;
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
    await this.localizeSettings(settings, { forceTranslate: true });

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
      const currentSettings = document.settings.toObject();
      const merged = deepMerge(currentSettings, patch.settings);
      const translatableChanged = this.didTranslatableContentChange(
        currentSettings,
        merged,
      );
      const currentDefaultLanguage = this.normalizeDefaultLanguage(
        currentSettings.defaultLanguage,
        false,
      );
      const nextDefaultLanguage = this.normalizeDefaultLanguage(
        merged.defaultLanguage,
      );
      const defaultLanguageChanged =
        currentDefaultLanguage !== nextDefaultLanguage;
      const sourcePack = extractLanguagePack(merged);
      const hasCoverage = this.hasLanguageCoverage(merged, sourcePack);
      const forceTranslate =
        translatableChanged || (defaultLanguageChanged && !hasCoverage);

      await this.localizeSettings(merged, {
        forceTranslate,
        translateIfMissing: defaultLanguageChanged,
      });
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

  async updateLanguage(actor, chatbotId, language, patch = {}) {
    const document = await this.chatbotRepository.findDocumentById(chatbotId);
    if (!document) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, document.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }

    const normalizedLanguage = this.normalizeDefaultLanguage(language);
    const settings = deepMerge(
      createDefaultChatbotSettings(),
      document.settings.toObject(),
    );
    const sourcePack = extractLanguagePack(settings);
    const translations = this.normalizeTranslations(
      settings.translations,
      sourcePack,
    );
    const currentPack = normalizeLanguagePack(
      translations[normalizedLanguage],
      sourcePack,
    );

    validateLanguagePatch(patch, sourcePack);
    const nextPack = mergeLanguagePack(currentPack, patch);
    translations[normalizedLanguage] = nextPack;
    settings.translations = translations;

    if (settings.defaultLanguage === normalizedLanguage) {
      applyLanguagePack(settings, nextPack);
      settings.translationSourceHash = createLanguageHash(
        settings.defaultLanguage,
        nextPack,
      );
    }

    document.settings = settings;
    await document.save();

    return {
      language: normalizedLanguage,
      translation: nextPack,
    };
  }

  getLanguageOptions() {
    return {
      defaultLanguage: DEFAULT_LANGUAGE,
      allowedLanguages: this.allowedLanguages,
    };
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

  async getPublicWidget(chatbotId, origin = '', preferredLanguage = '') {
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
      settings: this.buildPublicSettings(chatbot.settings, preferredLanguage),
    };
  }

  async getInstallCode(actor, chatbotId, baseUrl) {
    const chatbot = await this.getForActor(actor, chatbotId);
    const scriptUrl = `${baseUrl}/chat/script/${chatbot.id}`;
    const iframeUrl = `${baseUrl}/chat/iframe/${chatbot.id}`;
    const dashboardScriptUrl = `${baseUrl}/chat/dashboard/script/${chatbot.id}`;
    const dashboardIframeUrl = `${baseUrl}/chat/dashboard/iframe/${chatbot.id}`;
    const installLanguage = this.normalizeDefaultLanguage(
      chatbot.settings?.defaultLanguage,
      false,
    );

    return {
      chatbotId: chatbot.id,
      scriptUrl,
      iframeUrl,
      dashboardScriptUrl,
      dashboardIframeUrl,
      scriptSnippet: `<script src="${scriptUrl}?lang=${installLanguage}" defer></script>`,
      iframeSnippet: `<iframe src="${iframeUrl}?lang=${installLanguage}" title="${chatbot.settings.botName}" style="width:420px;height:680px;border:0;"></iframe>`,
      dashboardScriptSnippet: `<script>window.MOMICRO_ASSIST_DASHBOARD_CONFIG = window.MOMICRO_ASSIST_DASHBOARD_CONFIG || {}; window.MOMICRO_ASSIST_DASHBOARD_CONFIG["${chatbot.id}"] = { sessionToken: "YOUR_SESSION_TOKEN", selector: "#momicro-dashboard-root", height: "760px" };</script>\n<script src="${dashboardScriptUrl}" defer></script>`,
      dashboardIframeSnippet: `<iframe src="${dashboardIframeUrl}?sessionToken=YOUR_SESSION_TOKEN" title="${chatbot.settings.botName} Dashboard" style="width:100%;height:760px;border:0;border-radius:24px;"></iframe>`,
    };
  }

  async getAnalytics(actor, chatbotId) {
    await this.getForActor(actor, chatbotId);
    const [
      totalConversations,
      openConversations,
      unreadConversations,
      totals,
      activeConversations,
      pendingConversations,
      closedConversations,
    ] = await Promise.all([
      this.conversationRepository.countByChatbot(chatbotId),
      this.conversationRepository.countByChatbot(chatbotId, {
        status: { $in: ['open', 'active', 'pending'] },
      }),
      this.conversationRepository.countUnreadByChatbot(chatbotId),
      this.conversationRepository.aggregateTotals(chatbotId),
      this.conversationRepository.countByChatbot(chatbotId, {
        status: { $in: ['open', 'active'] },
      }),
      this.conversationRepository.countByChatbot(chatbotId, {
        status: 'pending',
      }),
      this.conversationRepository.countByChatbot(chatbotId, {
        status: 'closed',
      }),
    ]);

    return {
      totalConversations,
      openConversations,
      activeConversations,
      pendingConversations,
      closedConversations,
      unreadConversations,
      totalMessages: totals.totalMessages,
      totalLeads: totals.totalLeads,
    };
  }
}

module.exports = { ChatbotService, isAllowedOrigin };
