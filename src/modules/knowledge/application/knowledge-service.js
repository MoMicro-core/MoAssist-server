'use strict';

const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
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
    knowledgeBucket = 'chatbot-knowledge',
    log = () => null,
  }) {
    this.chatbotRepository = chatbotRepository;
    this.knowledgeFileRepository = knowledgeFileRepository;
    this.vectorStore = vectorStore;
    this.fileStorage = fileStorage;
    this.tierCatalog = tierCatalog;
    this.openai = openai;
    this.knowledgeBucket = knowledgeBucket;
    this.log = log;
    this.bucketReady = null;
  }

  storageBase(chatbotId, fileId) {
    return `chatbots/${chatbotId}/knowledge/${fileId}`;
  }

  async ensureKnowledgeBucket() {
    if (!this.bucketReady) {
      this.bucketReady = this.fileStorage
        .ensureBucket({ bucket: this.knowledgeBucket })
        .catch((error) => {
          // Do not cache a failure; the next call retries the creation.
          this.bucketReady = null;
          throw error;
        });
    }
    return this.bucketReady;
  }

  // Mirrors every local artifact (original, extracted text, chunk manifest,
  // vectors) into the private knowledge bucket so a fresh server can restore
  // RAG without re-extracting or re-embedding anything.
  async backupArtifacts({ chatbotId, fileId, file, text, artifact }) {
    if (!this.fileStorage?.isConfigured?.()) return false;
    await this.ensureKnowledgeBucket();

    const base = this.storageBase(chatbotId, fileId);
    const [manifestBuffer, vectorsBuffer] = await Promise.all([
      fs.readFile(artifact.manifestPath),
      fs.readFile(artifact.vectorsPath),
    ]);

    // The original document is a best-effort backup; RAG only needs the
    // text, manifest, and vectors.
    const uploads = [];
    if (file.buffer) {
      uploads.push(
        this.fileStorage.uploadObject({
          bucket: this.knowledgeBucket,
          objectPath: `${base}/original`,
          buffer: file.buffer,
          mimeType: file.mimeType,
        }),
      );
    }

    await Promise.all([
      ...uploads,
      this.fileStorage.uploadObject({
        bucket: this.knowledgeBucket,
        objectPath: `${base}/source.txt`,
        buffer: Buffer.from(text, 'utf8'),
        mimeType: 'text/plain',
      }),
      this.fileStorage.uploadObject({
        bucket: this.knowledgeBucket,
        objectPath: `${base}/manifest.json`,
        buffer: manifestBuffer,
        mimeType: 'application/json',
      }),
      this.fileStorage.uploadObject({
        bucket: this.knowledgeBucket,
        objectPath: `${base}/vectors.bin`,
        buffer: vectorsBuffer,
        mimeType: 'application/octet-stream',
      }),
    ]);
    return true;
  }

  // Artifact locations on THIS machine — never trust the absolute paths in
  // the DB record, they belong to whichever machine wrote them.
  localPaths(file) {
    return this.vectorStore.artifactPaths(file.chatbotId, file.id, file.name);
  }

  // Backfill for files uploaded before backups existed: pushes the artifacts
  // already on disk up to the bucket.
  async backupArtifactsFromDisk(file) {
    const paths = this.localPaths(file);
    const [buffer, text] = await Promise.all([
      fs.readFile(paths.originalPath).catch(() => null),
      fs.readFile(paths.textPath, 'utf8'),
    ]);
    return this.backupArtifacts({
      chatbotId: file.chatbotId,
      fileId: file.id,
      file: { buffer, mimeType: file.mimeType },
      text,
      artifact: {
        manifestPath: paths.manifestPath,
        vectorsPath: paths.vectorsPath,
      },
    });
  }

  async deleteBackup(chatbotId, fileId) {
    if (!this.fileStorage?.isConfigured?.()) return;
    const base = this.storageBase(chatbotId, fileId);
    await Promise.all(
      ['original', 'source.txt', 'manifest.json', 'vectors.bin'].map((name) =>
        this.fileStorage
          .deleteObject({
            bucket: this.knowledgeBucket,
            objectPath: `${base}/${name}`,
          })
          .catch(() => null),
      ),
    );
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

      const backedUp = await this.backupArtifacts({
        chatbotId,
        fileId,
        file,
        text,
        artifact,
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
        backedUpAt: backedUp ? new Date() : null,
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
    this.deleteBackup(chatbotId, fileId).catch(() => null);

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

  // Last-resort recovery for files uploaded before backups existed: the old
  // upload path stored only the original document in the assets bucket.
  // Download it, re-extract, re-embed, rebuild — then back everything up so
  // this never has to run again for the file.
  async restoreFromLegacyOriginal(file) {
    const objectPath = `chatbots/${file.chatbotId}/files/${file.id}-${file.name}`;
    const buffer = await this.fileStorage.downloadObject({ objectPath });
    const text = await extractTextFromBuffer({
      buffer,
      fileName: file.name,
      mimeType: file.mimeType,
    });
    const split = require('../infrastructure/vector-store').chunkText(text);
    if (!split.length) {
      throw new Error('legacy original has no readable text');
    }

    const embeddings = await this.vectorStore.createEmbeddings(split);
    const artifact = await this.vectorStore.saveKnowledgeFile({
      chatbotId: file.chatbotId,
      fileId: file.id,
      fileName: file.name,
      buffer,
      text,
      embeddings,
      mimeType: file.mimeType,
    });
    await this.backupArtifacts({
      chatbotId: file.chatbotId,
      fileId: file.id,
      file: { buffer, mimeType: file.mimeType },
      text,
      artifact,
    });
    await this.knowledgeFileRepository.updateById(file.id, {
      directory: artifact.directory,
      originalPath: artifact.originalPath,
      textPath: artifact.textPath,
      manifestPath: artifact.manifestPath,
      vectorsPath: artifact.vectorsPath,
      chunksCount: artifact.chunksCount,
      backedUpAt: new Date(),
    });
  }

  // The original document is not required — RAG runs on text + manifest +
  // vectors, so only those decide whether a file needs restoring. Checked at
  // the conventional locations for this machine, not the stored paths.
  hasLocalArtifacts(file) {
    const paths = this.localPaths(file);
    return (
      existsSync(paths.textPath) &&
      existsSync(paths.manifestPath) &&
      existsSync(paths.vectorsPath)
    );
  }

  // Boot-time sync, both directions. Files whose local artifacts are missing
  // (fresh server, wiped disk) are pulled back from the private knowledge
  // bucket — no re-extraction, no re-embedding — and the per-chatbot search
  // index is rebuilt. Files that exist locally but were uploaded before
  // backups existed are backfilled up to the bucket.
  async restoreMissingArtifacts() {
    const nothing = { restored: 0, backedUp: 0, pending: 0, failed: 0 };
    if (!this.fileStorage?.isConfigured?.()) return nothing;

    let files = [];
    try {
      files = await this.knowledgeFileRepository.listAll();
    } catch (error) {
      this.log(`knowledge restore skipped: ${error.message}`);
      return nothing;
    }
    if (!files.length) return nothing;

    try {
      await this.ensureKnowledgeBucket();
    } catch (error) {
      this.log(`knowledge restore skipped: ${error.message}`);
      return nothing;
    }

    let restored = 0;
    let backedUp = 0;
    let pending = 0;
    let failed = 0;
    const rebuildChatbots = new Set();

    for (const file of files) {
      if (this.hasLocalArtifacts(file)) {
        if (!file.backedUpAt) {
          try {
            await this.backupArtifactsFromDisk(file);
            // Align the record's paths with the machine that has the data.
            await this.knowledgeFileRepository.updateById(file.id, {
              ...this.localPaths(file),
              backedUpAt: new Date(),
            });
            backedUp += 1;
          } catch (error) {
            failed += 1;
            this.log(
              `knowledge backfill failed for ${file.chatbotId}/${file.id}: ${error.message}`,
            );
          }
        }
        if (!this.vectorStore.hasIndex(file.chatbotId)) {
          rebuildChatbots.add(file.chatbotId);
        }
        continue;
      }

      try {
        const base = this.storageBase(file.chatbotId, file.id);
        const download = (name) =>
          this.fileStorage.downloadObject({
            bucket: this.knowledgeBucket,
            objectPath: `${base}/${name}`,
          });
        const [buffer, textBuffer, manifestBuffer, vectorsBuffer] =
          await Promise.all([
            download('original').catch(() => null),
            download('source.txt'),
            download('manifest.json'),
            download('vectors.bin'),
          ]);

        const artifact = await this.vectorStore.restoreKnowledgeFile({
          chatbotId: file.chatbotId,
          fileId: file.id,
          fileName: file.name,
          buffer,
          text: textBuffer.toString('utf8'),
          manifestBuffer,
          vectorsBuffer,
        });

        await this.knowledgeFileRepository.updateById(file.id, {
          directory: artifact.directory,
          originalPath: artifact.originalPath,
          textPath: artifact.textPath,
          manifestPath: artifact.manifestPath,
          vectorsPath: artifact.vectorsPath,
          backedUpAt: file.backedUpAt || new Date(),
        });

        rebuildChatbots.add(file.chatbotId);
        restored += 1;
      } catch (error) {
        // No backup object yet: the file was uploaded by a server running
        // the old code. Try recovering from the original document the old
        // upload stored in the assets bucket (re-embeds via OpenAI).
        if (/not[ _]?found/i.test(error.message)) {
          try {
            await this.restoreFromLegacyOriginal(file);
            rebuildChatbots.add(file.chatbotId);
            restored += 1;
            this.log(
              `knowledge recovered from the original document for ${file.chatbotId}/${file.id} (re-embedded and backed up)`,
            );
          } catch (legacyError) {
            pending += 1;
            this.log(
              `knowledge pending for ${file.chatbotId}/${file.id}: no backup ` +
                `and no recoverable original (${legacyError.message}) — ` +
                'it syncs after the server holding the file restarts, or ' +
                're-upload the file',
            );
          }
        } else {
          failed += 1;
          this.log(
            `knowledge restore failed for ${file.chatbotId}/${file.id}: ${error.message}`,
          );
        }
      }
    }

    for (const chatbotId of rebuildChatbots) {
      try {
        const chatbotFiles =
          await this.knowledgeFileRepository.listByChatbot(chatbotId);
        const ready = chatbotFiles
          .filter((file) => this.hasLocalArtifacts(file))
          .map((file) => ({ ...file, ...this.localPaths(file) }));
        if (ready.length) await this.vectorStore.rebuildIndex(chatbotId, ready);
      } catch (error) {
        this.log(`index rebuild failed for ${chatbotId}: ${error.message}`);
      }
    }

    if (restored || backedUp || pending || failed) {
      this.log(
        `knowledge sync: ${restored} restored, ${backedUp} backed up, ` +
          `${pending} pending, ${failed} failed`,
      );
    }
    return { restored, backedUp, pending, failed };
  }

  async search(chatbotId, query, limit = 5, queryVector = null) {
    return this.vectorStore.search(chatbotId, query, limit, queryVector);
  }
}

module.exports = { KnowledgeService };
