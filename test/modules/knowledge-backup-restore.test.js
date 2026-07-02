'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');

const billingConfig = require('../../config/billing');
const { createTierCatalog } = require('../../src/shared/application/premium');
const {
  KnowledgeService,
} = require('../../src/modules/knowledge/application/knowledge-service');
const {
  VectorStore,
} = require('../../src/modules/knowledge/infrastructure/vector-store');

const chatbot = {
  id: 'bot-1',
  ownerUid: 'owner-1',
  premiumStatus: 'active',
  premiumPlan: 'full',
  settings: {},
};

const createFakeStorage = () => {
  const objects = new Map();
  return {
    objects,
    isConfigured: () => true,
    ensureBucket: async ({ bucket }) => ({ bucket, created: false }),
    uploadObject: async ({ bucket, objectPath, buffer }) => {
      objects.set(`${bucket}/${objectPath}`, Buffer.from(buffer));
      return { objectPath };
    },
    downloadObject: async ({ bucket, objectPath }) => {
      const stored = objects.get(`${bucket}/${objectPath}`);
      if (!stored) throw new Error(`Object not found: ${objectPath}`);
      return stored;
    },
    deleteObject: async ({ bucket, objectPath }) => {
      objects.delete(`${bucket}/${objectPath}`);
      return { objectPath };
    },
  };
};

const createFakeRepositories = () => {
  const records = new Map();
  return {
    records,
    chatbotRepository: {
      findById: async (id) => (id === chatbot.id ? chatbot : null),
      updateById: async () => null,
    },
    knowledgeFileRepository: {
      countByChatbot: async () => records.size,
      create: async (data) => {
        records.set(data.id, { ...data });
        return { ...data };
      },
      listByChatbot: async (chatbotId) =>
        [...records.values()].filter((file) => file.chatbotId === chatbotId),
      listAll: async () => [...records.values()],
      findById: async (id) => records.get(id) || null,
      deleteById: async (id) => {
        records.delete(id);
        return null;
      },
      updateById: async (id, update) => {
        const current = records.get(id);
        if (!current) return null;
        const next = { ...current, ...update };
        records.set(id, next);
        return next;
      },
    },
  };
};

const createService = (baseDirectory, storage, repositories) =>
  new KnowledgeService({
    chatbotRepository: repositories.chatbotRepository,
    knowledgeFileRepository: repositories.knowledgeFileRepository,
    vectorStore: new VectorStore({
      openai: {
        createEmbeddings: async (chunks) => chunks.map(() => [1, 0]),
        createEmbedding: async () => [1, 0],
      },
      baseDirectory,
      binaryPath: path.join(baseDirectory, 'no-binary'),
    }),
    fileStorage: storage,
    tierCatalog: createTierCatalog(billingConfig),
    openai: {
      createChatCompletion: async () => 'A test business.',
      createEmbeddings: async (chunks) => chunks.map(() => [1, 0]),
      createEmbedding: async () => [1, 0],
    },
    knowledgeBucket: 'chatbot-knowledge',
  });

describe('knowledge backup and restore', () => {
  let baseDirectory;

  beforeEach(async () => {
    baseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'momicro-know-'));
  });

  afterEach(async () => {
    await fs.rm(baseDirectory, { recursive: true, force: true });
  });

  const upload = async (service) =>
    service.upload({ uid: 'owner-1', role: 'user' }, chatbot.id, [
      {
        fileName: 'faq.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'We ship worldwide. Returns are accepted within 30 days.',
          'utf8',
        ),
      },
    ]);

  it('backs up all artifacts to the private bucket on upload', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);

    const [created] = await upload(service);
    const base = `chatbot-knowledge/chatbots/bot-1/knowledge/${created.id}`;

    expect(storage.objects.has(`${base}/original`)).toBe(true);
    expect(storage.objects.has(`${base}/source.txt`)).toBe(true);
    expect(storage.objects.has(`${base}/manifest.json`)).toBe(true);
    expect(storage.objects.has(`${base}/vectors.bin`)).toBe(true);
  });

  it('restores wiped artifacts from the bucket and rebuilds the index', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);
    await upload(service);

    // Simulate a fresh server: local files gone, DB + bucket intact.
    await fs.rm(path.join(baseDirectory, 'chatbots'), {
      recursive: true,
      force: true,
    });
    const freshService = createService(baseDirectory, storage, repositories);

    const outcome = await freshService.restoreMissingArtifacts();
    expect(outcome).toEqual({ restored: 1, failed: 0 });

    const record = [...repositories.records.values()][0];
    expect(existsSync(record.originalPath)).toBe(true);
    expect(existsSync(record.textPath)).toBe(true);
    expect(existsSync(record.manifestPath)).toBe(true);
    expect(existsSync(record.vectorsPath)).toBe(true);
    expect(freshService.vectorStore.hasIndex(chatbot.id)).toBe(true);

    // The restored index is searchable without any re-embedding.
    const results = await freshService.search(chatbot.id, 'returns policy');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Returns');
  });

  it('skips files whose artifacts are already local', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);
    await upload(service);

    const downloads = jest.spyOn(storage, 'downloadObject');
    const outcome = await service.restoreMissingArtifacts();
    expect(outcome).toEqual({ restored: 0, failed: 0 });
    expect(downloads).not.toHaveBeenCalled();
  });

  it('removes the backup objects when the file is deleted', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);
    const [created] = await upload(service);

    await service.delete(
      { uid: 'owner-1', role: 'user' },
      chatbot.id,
      created.id,
    );
    await new Promise((resolve) => setImmediate(resolve));

    const base = `chatbot-knowledge/chatbots/bot-1/knowledge/${created.id}`;
    expect(storage.objects.has(`${base}/original`)).toBe(false);
    expect(storage.objects.has(`${base}/vectors.bin`)).toBe(false);
  });
});
