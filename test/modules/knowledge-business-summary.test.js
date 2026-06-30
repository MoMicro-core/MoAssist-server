'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const {
  KnowledgeService,
} = require('../../src/modules/knowledge/application/knowledge-service');

const createService = (overrides = {}) => {
  const chatbotRepository = {
    updateById: jest.fn(async () => null),
    ...overrides.chatbotRepository,
  };
  const knowledgeFileRepository = {
    listByChatbot: jest.fn(async () => []),
    ...overrides.knowledgeFileRepository,
  };
  const openai = {
    createChatCompletion: jest.fn(async () => 'Acme sells widgets.'),
    ...overrides.openai,
  };
  const service = new KnowledgeService({
    chatbotRepository,
    knowledgeFileRepository,
    vectorStore: {},
    fileStorage: null,
    tierCatalog: {},
    openai,
  });
  return { service, chatbotRepository, knowledgeFileRepository, openai };
};

describe('knowledge business summary', () => {
  let textPath;

  beforeAll(async () => {
    textPath = path.join(os.tmpdir(), `kb-${Date.now()}.txt`);
    await fs.writeFile(
      textPath,
      'Acme is an online store for eco-friendly cleaning supplies.',
      'utf8',
    );
  });

  afterAll(async () => {
    await fs.rm(textPath, { force: true });
  });

  test('generates and saves a summary from knowledge text', async () => {
    const files = [{ name: 'about.txt', textPath }];
    const { service, chatbotRepository, openai } = createService();

    const summary = await service.refreshBusinessSummary('cb-1', files);

    expect(openai.createChatCompletion).toHaveBeenCalledTimes(1);
    const [{ messages }] = openai.createChatCompletion.mock.calls[0];
    expect(messages[1].content).toContain('eco-friendly cleaning supplies');
    expect(summary).toBe('Acme sells widgets.');
    expect(chatbotRepository.updateById).toHaveBeenCalledWith('cb-1', {
      'settings.ai.businessSummary': 'Acme sells widgets.',
    });
  });

  test('clears the summary when there are no knowledge files', async () => {
    const { service, chatbotRepository, openai } = createService();

    const summary = await service.refreshBusinessSummary('cb-1', []);

    expect(summary).toBe('');
    expect(openai.createChatCompletion).not.toHaveBeenCalled();
    expect(chatbotRepository.updateById).toHaveBeenCalledWith('cb-1', {
      'settings.ai.businessSummary': '',
    });
  });
});
