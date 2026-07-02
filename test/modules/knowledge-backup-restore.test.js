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
    expect(outcome).toEqual({
      restored: 1,
      backedUp: 0,
      pending: 0,
      failed: 0,
    });

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
    expect(outcome).toEqual({
      restored: 0,
      backedUp: 0,
      pending: 0,
      failed: 0,
    });
    expect(downloads).not.toHaveBeenCalled();
  });

  it('backfills local files uploaded before backups existed', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);
    const [created] = await upload(service);

    // Simulate a pre-backup record: bucket empty, no backedUpAt marker.
    storage.objects.clear();
    repositories.records.set(created.id, {
      ...repositories.records.get(created.id),
      backedUpAt: null,
    });

    const outcome = await service.restoreMissingArtifacts();
    expect(outcome).toEqual({
      restored: 0,
      backedUp: 1,
      pending: 0,
      failed: 0,
    });

    const base = `chatbot-knowledge/chatbots/bot-1/knowledge/${created.id}`;
    expect(storage.objects.has(`${base}/source.txt`)).toBe(true);
    expect(storage.objects.has(`${base}/manifest.json`)).toBe(true);
    expect(storage.objects.has(`${base}/vectors.bin`)).toBe(true);
    expect(repositories.records.get(created.id).backedUpAt).toBeInstanceOf(
      Date,
    );

    // Second boot: nothing left to do.
    const second = await service.restoreMissingArtifacts();
    expect(second).toEqual({
      restored: 0,
      backedUp: 0,
      pending: 0,
      failed: 0,
    });
  });

  it('backfills by convention even when the record paths belong to another machine', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    const service = createService(baseDirectory, storage, repositories);
    const [created] = await upload(service);

    // Shared-DB scenario: the record was written by a server with a
    // different filesystem layout, but the artifacts exist here.
    storage.objects.clear();
    repositories.records.set(created.id, {
      ...repositories.records.get(created.id),
      backedUpAt: null,
      directory: '/home/ubuntu/app/files/chatbots/bot-1/knowledge/x',
      originalPath: '/home/ubuntu/app/files/chatbots/bot-1/uploads/x',
      textPath: '/home/ubuntu/app/files/chatbots/bot-1/knowledge/x/source.txt',
      manifestPath:
        '/home/ubuntu/app/files/chatbots/bot-1/knowledge/x/manifest.json',
      vectorsPath:
        '/home/ubuntu/app/files/chatbots/bot-1/knowledge/x/vectors.bin',
    });

    const outcome = await service.restoreMissingArtifacts();
    expect(outcome).toEqual({
      restored: 0,
      backedUp: 1,
      pending: 0,
      failed: 0,
    });

    // The record now points at this machine's real files.
    const record = repositories.records.get(created.id);
    expect(existsSync(record.textPath)).toBe(true);
    expect(existsSync(record.vectorsPath)).toBe(true);
  });

  it('marks files with no local copy and no backup as pending, not failed', async () => {
    const storage = createFakeStorage();
    const repositories = createFakeRepositories();
    repositories.records.set('remote-file', {
      id: 'remote-file',
      chatbotId: 'bot-1',
      ownerUid: 'owner-1',
      name: 'remote.pdf',
      mimeType: 'application/pdf',
      backedUpAt: null,
      directory: '/home/ubuntu/app/files/chatbots/bot-1/knowledge/remote-file',
      originalPath: '/home/ubuntu/app/x',
      textPath: '/home/ubuntu/app/y',
      manifestPath: '/home/ubuntu/app/z',
      vectorsPath: '/home/ubuntu/app/w',
    });
    const service = createService(baseDirectory, storage, repositories);

    const outcome = await service.restoreMissingArtifacts();
    expect(outcome).toEqual({
      restored: 0,
      backedUp: 0,
      pending: 1,
      failed: 0,
    });
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
