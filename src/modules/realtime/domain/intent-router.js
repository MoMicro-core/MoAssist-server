'use strict';

// Lever-1 intent routing: match the message embedding (already computed for
// RAG) against per-intent centroid vectors. All vectors must be
// L2-normalized so the dot product equals cosine similarity.

const DEFAULT_THRESHOLD = 0.35;
const DEFAULT_MARGIN = 0.05;

const dot = (left, right) => {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
};

const normalizeVector = (vector) => {
  if (!Array.isArray(vector) || !vector.length) return [];
  let sum = 0;
  for (const value of vector) sum += value * value;
  const magnitude = Math.sqrt(sum);
  if (!Number.isFinite(magnitude) || magnitude === 0) return [];
  return vector.map((value) => value / magnitude);
};

// One vector per intent: the normalized centroid of its example-phrase
// vectors. Cheaper and more stable than max-over-phrases.
const buildIntentVector = (phraseVectors = []) => {
  const vectors = phraseVectors.filter(
    (vector) => Array.isArray(vector) && vector.length,
  );
  if (!vectors.length) return [];

  const dimension = vectors[0].length;
  const centroid = new Array(dimension).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dimension; index += 1) {
      centroid[index] += vector[index] || 0;
    }
  }
  for (let index = 0; index < dimension; index += 1) {
    centroid[index] /= vectors.length;
  }
  return normalizeVector(centroid);
};

// Two-condition acceptance: the absolute threshold rejects off-topic
// messages, the top1-top2 margin rejects ambiguity between intents.
const rankIntents = (
  queryVector,
  intentVectors = [],
  { threshold = DEFAULT_THRESHOLD, margin = DEFAULT_MARGIN } = {},
) => {
  if (!Array.isArray(queryVector) || !queryVector.length) return null;

  const scored = intentVectors
    .filter((entry) => Array.isArray(entry?.vector) && entry.vector.length)
    .map((entry) => ({
      name: entry.name,
      score: dot(queryVector, entry.vector),
    }))
    .sort((left, right) => right.score - left.score);

  if (!scored.length) return null;
  const [top1, top2] = scored;
  if (top1.score < threshold) return null;
  if (top2 && top1.score - top2.score < margin) return null;
  return top1;
};

module.exports = {
  DEFAULT_THRESHOLD,
  DEFAULT_MARGIN,
  normalizeVector,
  buildIntentVector,
  rankIntents,
};
