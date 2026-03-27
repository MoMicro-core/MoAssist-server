'use strict';

const billingConfig = require('../../config/billing');
const {
  TIER_CAPABILITIES,
  createTierCatalog,
} = require('../../src/shared/application/premium');

describe('tier catalog', () => {
  test('default tiers expose expected capabilities', () => {
    const catalog = createTierCatalog(billingConfig);

    expect(
      catalog
        .get('free')
        ?.hasCapability(TIER_CAPABILITIES.AUTHENTICATED_WIDGET),
    ).toBe(false);
    expect(
      catalog
        .get('auth')
        ?.hasCapability(TIER_CAPABILITIES.AUTHENTICATED_WIDGET),
    ).toBe(true);
    expect(
      catalog.get('auth')?.hasCapability(TIER_CAPABILITIES.AI_RESPONDER),
    ).toBe(false);
    expect(
      catalog.get('full')?.hasCapability(TIER_CAPABILITIES.AI_RESPONDER),
    ).toBe(true);
    expect(
      catalog.get('full')?.hasCapability(TIER_CAPABILITIES.KNOWLEDGE_FILES),
    ).toBe(true);
  });

  test('custom tiers can be added without changing the catalog code', () => {
    const catalog = createTierCatalog({
      ...billingConfig,
      trialTierId: 'enterprise',
      defaultCheckoutTierId: 'enterprise',
      tiers: [
        ...billingConfig.tiers,
        {
          id: 'enterprise',
          name: 'Enterprise',
          monthlyPriceUsd: 100,
          checkoutEnabled: true,
          stripePriceId: 'price_enterprise',
          capabilities: Object.values(TIER_CAPABILITIES),
          limits: {
            monthlyAiMessages: 250000,
            monthlyCustomers: 50000,
          },
        },
      ],
    });

    expect(catalog.get('enterprise')?.toSummary()).toMatchObject({
      id: 'enterprise',
      monthlyPriceUsd: 100,
      checkoutEnabled: true,
      limits: {
        monthlyAiMessages: 250000,
        monthlyCustomers: 50000,
      },
    });
    expect(
      catalog.resolveForState({
        premiumStatus: 'trialing',
        premiumPlan: 'trial',
      }).id,
    ).toBe('enterprise');
  });
});
