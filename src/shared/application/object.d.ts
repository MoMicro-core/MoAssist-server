export function deepMerge<
  T extends Record<string, unknown>,
  U extends Record<string, unknown>,
>(target: T, patch: U): T & U;
