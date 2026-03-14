'use strict';

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date);

const deepMerge = (target, patch) => {
  if (!isPlainObject(target) || !isPlainObject(patch)) return patch;
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
      continue;
    }
    result[key] = value;
  }
  return result;
};

module.exports = { deepMerge };
