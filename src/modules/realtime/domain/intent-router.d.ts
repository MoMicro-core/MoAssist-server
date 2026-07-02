export const DEFAULT_THRESHOLD: number;
export const DEFAULT_MARGIN: number;

export interface IntentVectorEntry {
  name: string;
  vector: number[];
}

export interface IntentMatch {
  name: string;
  score: number;
}

export function normalizeVector(vector?: number[]): number[];
export function buildIntentVector(phraseVectors?: number[][]): number[];
export function rankIntents(
  queryVector: number[],
  intentVectors?: IntentVectorEntry[],
  options?: { threshold?: number; margin?: number },
): IntentMatch | null;
