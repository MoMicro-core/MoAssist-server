'use strict';

const billingConfig = require('../../config/billing');
const { createTierCatalog } = require('../../src/shared/application/premium');
const {
  BillingService,
} = require('../../src/modules/billing/application/billing-service');

const createConfig = () => ({
  ...billingConfig,
  tiers: billingConfig.tiers.map((tier) => {
    if (tier.id === 'auth') {
      return { ...tier, stripePriceId: 'price_auth_20' };
    }
    if (tier.id === 'full') {
      return { ...tier, stripePriceId: 'price_full_50' };
    }
    return tier;
  }),
});

describe('billing tiers', () => {
  test('checkout uses the requested tier strategy instead of a hard-coded premium price', async () => {
    const config = createConfig();
    const tierCatalog = createTierCatalog(config);
    const stripeGateway = {
      createCheckoutSession: jest.fn(async () => ({
        id: 'cs_123',
        url: 'https://stripe.test/session',
      })),
    };
    const service = new BillingService({
      userRepository: {
        findByUid: jest.fn(async () => ({
          uid: 'owner-1',
          stripeCustomerId: 'cus_123',
        })),
      },
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'cb-1',
          ownerUid: 'owner-1',
          premiumStatus: 'free',
          premiumPlan: 'free',
          premiumCurrentPeriodEnd: null,
        })),
        updateById: jest.fn(),
      },
      subscriptionRepository: {
        listByChatbot: jest.fn(async () => []),
      },
      stripeGateway,
      config: {
        environment: {
          appUrl: 'http://localhost:8080',
        },
      },
      tierCatalog,
    });

    await service.createCheckoutSession(
      { uid: 'owner-1', role: 'user' },
      {
        chatbotId: 'cb-1',
        tierId: 'auth',
      },
    );

    expect(stripeGateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_auth_20',
        tierId: 'auth',
      }),
    );
  });

  test('billing summary exposes scalable tier metadata', async () => {
    const config = createConfig();
    const service = new BillingService({
      userRepository: {
        findByUid: jest.fn(async () => ({
          uid: 'owner-1',
          stripeCustomerId: 'cus_123',
        })),
      },
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'cb-1',
          ownerUid: 'owner-1',
          premiumStatus: 'active',
          premiumPlan: 'auth',
          premiumCurrentPeriodEnd: null,
        })),
        updateById: jest.fn(),
        listByOwner: jest.fn(async () => []),
      },
      subscriptionRepository: {
        listByChatbot: jest.fn(async () => []),
      },
      stripeGateway: {
        createCheckoutSession: jest.fn(),
      },
      config: {
        environment: {
          appUrl: 'http://localhost:8080',
        },
      },
      tierCatalog: createTierCatalog(config),
    });

    const summary = await service.getSummary(
      { uid: 'owner-1', role: 'user' },
      { chatbotId: 'cb-1' },
    );

    expect(summary.currentTier).toMatchObject({
      id: 'auth',
    });
    expect(summary.availableTiers.map((tier) => tier.id)).toEqual(
      expect.arrayContaining(['free', 'auth', 'full']),
    );
  });
});
