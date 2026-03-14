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
const { createId } = require('../../../shared/application/ids');
const { extractTextFromBuffer } = require('../infrastructure/text-extractor');

class KnowledgeService {
  constructor({ chatbotRepository, knowledgeFileRepository, vectorStore }) {
    this.chatbotRepository = chatbotRepository;
    this.knowledgeFileRepository = knowledgeFileRepository;
    this.vectorStore = vectorStore;
  }

  async list(actor, chatbotId) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    return this.knowledgeFileRepository.listByChatbot(chatbotId);
  }

  async upload(actor, owner, chatbotId, files) {
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    if (owner.premiumStatus === 'free') {
      throw new ForbiddenError(
        'Premium subscription is required to upload files',
      );
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

    return { deleted: true };
  }

  async search(chatbotId, query, limit = 5) {
    return this.vectorStore.search(chatbotId, query, limit);
  }
}

module.exports = { KnowledgeService };
