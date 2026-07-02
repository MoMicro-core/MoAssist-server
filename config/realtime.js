'use strict';

const toInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : fallback;
};

module.exports = {
  // 32-byte key (hex or base64) for encrypting connector secrets at rest.
  secretsKey: process.env.CONNECTOR_SECRETS_KEY || '',
  connectorsDirectory: 'connectors',
  workerCount: toInteger(process.env.CONNECTOR_WORKERS, 2),
  workerMaxOldGenerationSizeMb: 128,
  workerQueueLimit: 16,
  // Deadlines enforced from the main thread per connector call.
  verifyTimeoutMs: toInteger(process.env.CONNECTOR_VERIFY_TIMEOUT_MS, 5000),
  fetchTimeoutMs: toInteger(process.env.CONNECTOR_FETCH_TIMEOUT_MS, 2500),
  snapshotTimeoutMs: toInteger(process.env.CONNECTOR_SNAPSHOT_TIMEOUT_MS, 5000),
  // Per outbound HTTP request inside the connector sandbox.
  httpTimeoutMs: toInteger(process.env.CONNECTOR_HTTP_TIMEOUT_MS, 1500),
  maxResponseBytes: 256 * 1024,
  // Verified identity freshness; expired identity degrades to public mode.
  identityTtlHours: toInteger(process.env.CONNECTOR_IDENTITY_TTL_HOURS, 24),
  snapshotTtlMinutes: toInteger(process.env.CONNECTOR_SNAPSHOT_TTL_MINUTES, 10),
  // Cap on the serialized live-data block injected into the prompt.
  maxContextChars: 4000,
};
