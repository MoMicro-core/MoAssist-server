import type {
  Actor,
  Chatbot,
  Conversation,
  MerchantConnectorStatus,
  OpenAIGateway,
  RealtimeConfig,
  RealtimeIntent,
  RealtimeLiveContext,
  RealtimeUser,
} from '../../../types';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { WidgetSessionRepository } from '../../conversations/infrastructure/widget-session-repository';
import type { ConnectorRepository } from '../infrastructure/connector-repository';
import type { ConnectorRuntime } from '../infrastructure/connector-runtime';
import type { TierCatalog } from '../../../shared/application/premium';
import type { SecretBox } from '../../../shared/application/secret-box';

export interface ConnectorStorageGateway {
  isConfigured(): boolean;
  uploadObject(args: {
    bucket?: string;
    objectPath: string;
    buffer: Buffer;
    mimeType?: string;
  }): Promise<{ objectPath: string }>;
  downloadObject(args: {
    bucket?: string;
    objectPath: string;
  }): Promise<Buffer>;
}

export interface SetConnectorPayload {
  source?: string;
  enabled?: boolean;
  baseUrl?: string;
  allowedHosts?: string[];
  secrets?: Record<string, unknown>;
  intents?: RealtimeIntent[];
  routerThreshold?: number;
  routerMargin?: number;
}

export class RealtimeService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    widgetSessionRepository: WidgetSessionRepository;
    connectorRepository: ConnectorRepository;
    connectorStorage: ConnectorStorageGateway | null;
    runtime: ConnectorRuntime;
    openai: OpenAIGateway | null;
    tierCatalog: TierCatalog;
    secretBox: SecretBox;
    config?: Partial<RealtimeConfig>;
    log?: (line: string) => void;
  });

  connectorsDirectory: string;

  trace(line: string): void;
  syncAllOnBoot(): Promise<{ synced: number; failed: number }>;
  getConnector(
    actor: Actor,
    chatbotId: string,
  ): Promise<MerchantConnectorStatus>;
  setConnector(
    actor: Actor,
    chatbotId: string,
    payload?: SetConnectorPayload,
  ): Promise<MerchantConnectorStatus>;
  resync(
    actor: Actor,
    chatbotId: string,
  ): Promise<{ synced: boolean; version: string }>;

  isActive(chatbot: Chatbot): Promise<boolean>;
  verifyForWidget(args: {
    chatbotId: string;
    widgetToken: string;
    token: string;
  }): Promise<RealtimeUser | null>;
  verifyIdentity(args: {
    chatbot: Chatbot;
    widgetToken: string;
    token: string;
  }): Promise<RealtimeUser | null>;
  fetchLiveContext(args: {
    chatbot: Chatbot;
    conversation: Conversation;
    prompt: string;
    embedding: number[] | null;
  }): Promise<RealtimeLiveContext | null>;
}
