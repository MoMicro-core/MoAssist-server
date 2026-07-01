'use strict';

const {
  ExternalDashboardService,
} = require('../../src/modules/dashboard/application/external-dashboard-service');
const {
  hashPassword,
  verifyPassword,
} = require('../../src/shared/application/password');

const owner = { uid: 'owner-1', role: 'user' };

const build = ({ credential = null } = {}) => {
  const chatbotRepository = {
    findById: jest.fn(async (id) => ({
      id,
      ownerUid: 'owner-1',
      settings: { title: 'Acme', botName: 'Acme Bot' },
    })),
  };
  const credentialRepository = {
    findByChatbotId: jest.fn(async () => credential),
    upsert: jest.fn(async (chatbotId, data) => ({ chatbotId, ...data })),
  };
  const sessionRepository = {
    create: jest.fn(async (payload) => ({ ...payload, token: payload.token })),
  };
  const tierCatalog = { hasCapability: jest.fn(() => true) };
  const service = new ExternalDashboardService({
    chatbotRepository,
    credentialRepository,
    sessionRepository,
    tierCatalog,
  });
  return { service, credentialRepository, sessionRepository, tierCatalog };
};

describe('password hashing', () => {
  test('hash + verify round trip, rejects wrong password', () => {
    const { passwordHash, passwordSalt } = hashPassword('correct horse');
    expect(passwordHash).not.toBe('correct horse');
    expect(verifyPassword('correct horse', passwordHash, passwordSalt)).toBe(
      true,
    );
    expect(verifyPassword('wrong', passwordHash, passwordSalt)).toBe(false);
  });
});

describe('external dashboard credentials', () => {
  test('stores a hashed password, never the plaintext', async () => {
    const { service, credentialRepository } = build();
    const status = await service.setCredentials(owner, 'cb-1', {
      enabled: true,
      username: 'agent',
      password: 'supersecret',
    });

    const [, saved] = credentialRepository.upsert.mock.calls[0];
    expect(saved.passwordHash).toBeTruthy();
    expect(saved.passwordHash).not.toBe('supersecret');
    expect(saved.passwordSalt).toBeTruthy();
    expect(status).toEqual({
      enabled: true,
      username: 'agent',
      hasPassword: true,
    });
  });

  test('cannot enable without a username and password', async () => {
    const { service } = build();
    await expect(
      service.setCredentials(owner, 'cb-1', { enabled: true, username: '' }),
    ).rejects.toThrow(/username and password/i);
  });

  test('rejects a too-short password', async () => {
    const { service } = build();
    await expect(
      service.setCredentials(owner, 'cb-1', { password: 'short' }),
    ).rejects.toThrow(/at least 8/i);
  });
});

describe('external dashboard login', () => {
  const credential = {
    chatbotId: 'cb-1',
    ownerUid: 'owner-1',
    enabled: true,
    username: 'agent',
    ...hashPassword('supersecret'),
  };

  test('mints a chatbot-scoped dashboard token on valid credentials', async () => {
    const { service, sessionRepository } = build({ credential });
    const result = await service.login('cb-1', {
      username: 'agent',
      password: 'supersecret',
    });

    expect(result.token).toBeTruthy();
    expect(result.chatbot).toEqual({
      id: 'cb-1',
      title: 'Acme',
      botName: 'Acme Bot',
    });
    const [payload] = sessionRepository.create.mock.calls[0];
    expect(payload.role).toBe('dashboard');
    expect(payload.uid).toBe('owner-1');
    expect(payload.data).toEqual({ dashboardChatbotId: 'cb-1' });
  });

  test('rejects a wrong password', async () => {
    const { service, sessionRepository } = build({ credential });
    await expect(
      service.login('cb-1', { username: 'agent', password: 'nope' }),
    ).rejects.toThrow(/invalid/i);
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  test('rejects when the external dashboard is disabled', async () => {
    const { service } = build({
      credential: { ...credential, enabled: false },
    });
    await expect(
      service.login('cb-1', { username: 'agent', password: 'supersecret' }),
    ).rejects.toThrow(/invalid/i);
  });

  test('rejects an unknown username', async () => {
    const { service } = build({ credential });
    await expect(
      service.login('cb-1', { username: 'ghost', password: 'supersecret' }),
    ).rejects.toThrow(/invalid/i);
  });
});
