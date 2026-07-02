'use strict';

const {
  normalizeVector,
  buildIntentVector,
  rankIntents,
} = require('../../src/modules/realtime/domain/intent-router');

describe('intent-router', () => {
  describe('normalizeVector', () => {
    it('produces a unit-length vector', () => {
      const normalized = normalizeVector([3, 4]);
      expect(normalized[0]).toBeCloseTo(0.6);
      expect(normalized[1]).toBeCloseTo(0.8);
    });

    it('returns an empty array for zero or invalid input', () => {
      expect(normalizeVector([0, 0])).toEqual([]);
      expect(normalizeVector(undefined)).toEqual([]);
      expect(normalizeVector([])).toEqual([]);
    });
  });

  describe('buildIntentVector', () => {
    it('builds the normalized centroid of phrase vectors', () => {
      const centroid = buildIntentVector([
        [1, 0],
        [0, 1],
      ]);
      expect(centroid[0]).toBeCloseTo(Math.SQRT1_2);
      expect(centroid[1]).toBeCloseTo(Math.SQRT1_2);
    });

    it('ignores empty phrase vectors', () => {
      expect(buildIntentVector([[], undefined])).toEqual([]);
    });
  });

  describe('rankIntents', () => {
    const intents = [
      { name: 'orders', vector: [1, 0] },
      { name: 'referrals', vector: [0, 1] },
    ];

    it('routes to the closest intent above the threshold', () => {
      const match = rankIntents([0.95, 0.05], intents, {
        threshold: 0.35,
        margin: 0.05,
      });
      expect(match.name).toBe('orders');
      expect(match.score).toBeGreaterThan(0.9);
    });

    it('rejects off-topic messages below the absolute threshold', () => {
      const match = rankIntents([0.1, 0.1], intents, {
        threshold: 0.35,
        margin: 0.05,
      });
      expect(match).toBeNull();
    });

    it('rejects ambiguous messages via the top1-top2 margin', () => {
      const query = normalizeVector([1, 0.96]);
      const match = rankIntents(query, intents, {
        threshold: 0.35,
        margin: 0.05,
      });
      expect(match).toBeNull();
    });

    it('returns null without a query vector or intents', () => {
      expect(rankIntents(null, intents)).toBeNull();
      expect(rankIntents([1, 0], [])).toBeNull();
    });
  });
});
