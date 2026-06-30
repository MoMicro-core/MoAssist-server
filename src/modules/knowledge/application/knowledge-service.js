'use strict';

const fs = require('node:fs/promises');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const { TIER_CAPABILITIES } = require('../../../shared/application/premium');
const { createId } = require('../../../shared/application/ids');
const { extractTextFromBuffer } = require('../infrastructure/text-extractor');

class KnowledgeService {
  constructor({
    chatbotRepository,
    knowledgeFileRepository,
    vectorStore,
    fileStorage,
    tierCatalog,
    openai,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.knowledgeFileRepository = knowledgeFileRepository;
    this.vectorStore = vectorStore;
    this.fileStorage = fileStorage;
    this.tierCatalog = tierCatalog;
    this.openai = openai;
  }

  async list(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    return this.knowledgeFileRepository.listByChatbot(chatbotId);
  }

  async upload(actor, chatbotId, files) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    if (
      !this.tierCatalog.hasCapability(
        chatbot,
        TIER_CAPABILITIES.KNOWLEDGE_FILES,
      )
    ) {
      throw new ForbiddenError('Current tier does not allow knowledge files');
    }
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestError('At least one file is required');
    }

    const existingCount =
      await this.knowledgeFileRepository.countByChatbot(chatbotId);
    if (existingCount + files.length > 300) {
      throw new BadRequestError('A chatbot can store up to 300 files');
    }

    const created = [];

    for (const file of files) {
      const text = await extractTextFromBuffer(file);
      const split = require('../infrastructure/vector-store').chunkText(text);
      if (!split.length) {
        throw new BadRequestError(
          `File "${file.fileName}" does not contain readable text`,
        );
      }
      const embeddings = await this.vectorStore.createEmbeddings(split);
      const fileId = createId();
      const artifact = await this.vectorStore.saveKnowledgeFile({
        chatbotId,
        fileId,
        fileName: file.fileName,
        buffer: file.buffer,
        text,
        embeddings,
        mimeType: file.mimeType,
      });

      if (this.fileStorage?.isConfigured?.()) {
        const objectPath = `chatbots/${chatbotId}/files/${fileId}-${file.fileName}`;
        await this.fileStorage.uploadPublicObject({
          objectPath,
          buffer: file.buffer,
          mimeType: file.mimeType,
        });
      }

      const saved = await this.knowledgeFileRepository.create({
        id: fileId,
        chatbotId,
        ownerUid: chatbot.ownerUid,
        name: file.fileName,
        mimeType: file.mimeType,
        size: file.buffer.byteLength,
        status: 'ready',
        chunksCount: split.length,
        directory: artifact.directory,
        originalPath: artifact.originalPath,
        textPath: artifact.textPath,
        manifestPath: artifact.manifestPath,
        vectorsPath: artifact.vectorsPath,
      });

      created.push(saved);
    }

    const knowledgeFiles =
      await this.knowledgeFileRepository.listByChatbot(chatbotId);
    await this.vectorStore.rebuildIndex(chatbotId, knowledgeFiles);
    await this.refreshBusinessSummary(chatbotId, knowledgeFiles).catch(
      () => null,
    );

    return created;
  }

  async delete(actor, chatbotId, fileId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }

    const file = await this.knowledgeFileRepository.findById(fileId);
    if (!file || file.chatbotId !== chatbotId) {
      throw new NotFoundError('File not found');
    }

    await Promise.all([
      this.knowledgeFileRepository.deleteById(fileId),
      fs.rm(file.directory, { recursive: true, force: true }),
    ]);

    const knowledgeFiles =
      await this.knowledgeFileRepository.listByChatbot(chatbotId);
    await this.vectorStore.rebuildIndex(chatbotId, knowledgeFiles);
    await this.refreshBusinessSummary(chatbotId, knowledgeFiles).catch(
      () => null,
    );

    return { deleted: true };
  }

  async refreshBusinessSummary(chatbotId, knowledgeFiles) {
    const files = knowledgeFiles
      ? knowledgeFiles
      : await this.knowledgeFileRepository.listByChatbot(chatbotId);

    if (!files.length) {
      await this.chatbotRepository.updateById(chatbotId, {
        'settings.ai.businessSummary': '',
      });
      return '';
    }

    if (!this.openai) return null;

    const sections = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file.textPath, 'utf8');
        if (content.trim()) {
          sections.push(`# ${file.name}\n${content.trim()}`);
        }
      } catch {
        // Skip files whose extracted text is unreadable.
      }
    }

    const material = sections.join('\n\n').slice(0, 12000).trim();
    if (!material) return null;

    const summary = await this.openai.createChatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You write a concise business profile for an AI support chatbot. From the uploaded knowledge material, describe in 1 to 3 plain sentences what this business is and what it offers (products, services, who it serves). Write only the summary — no preamble, headings, quotes, or markdown. Use neutral third-person. Never invent details that are not supported by the material. If the material is too sparse to tell, reply with a single sentence stating only what can be confirmed.',
        },
        {
          role: 'user',
          content: `Knowledge material:\n\n${material}`,
        },
      ],
    });

    const trimmed = typeof summary === 'string' ? summary.trim() : '';
    if (trimmed) {
      await this.chatbotRepository.updateById(chatbotId, {
        'settings.ai.businessSummary': trimmed,
      });
    }

    return trimmed;
  }

  async search(chatbotId, query, limit = 5) {
    return this.vectorStore.search(chatbotId, query, limit);
  }
}

module.exports = { KnowledgeService };
