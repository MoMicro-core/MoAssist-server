import type { OpenAIGateway, RealtimeConfig } from '../../../types';

export interface ConnectorRunArgs {
  connector: {
    chatbotId: string;
    version: string;
    source: string;
    baseUrl?: string;
    allowedHosts?: string[];
    secrets?: Record<string, unknown>;
    intents?: unknown[];
    cacheScope?: string;
  };
  fn: 'verifyIdentity' | 'loadSnapshot' | 'fetchContext';
  args?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ConnectorRunResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class ConnectorRuntime {
  constructor(args: {
    openai: OpenAIGateway;
    config?: Partial<RealtimeConfig>;
    log?: (line: string) => void;
  });
  config: Partial<RealtimeConfig>;
  run(args: ConnectorRunArgs): Promise<ConnectorRunResult>;
  stop(): Promise<void>;
}
