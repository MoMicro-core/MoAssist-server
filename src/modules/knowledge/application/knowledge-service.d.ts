import type {
  Actor,
  KnowledgeFile,
  OpenAIGateway,
  UploadFile,
  VectorSearchResult,
} from '../../../types';
import type { TierCatalog } from '../../../shared/application/premium';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { KnowledgeFileRepository } from '../infrastructure/knowledge-file-repository';
import type { VectorStore } from '../infrastructure/vector-store';

export interface KnowledgeFileStorage {
  isConfigured(): boolean;
  ensureBucket(args: {
    bucket: string;
    isPublic?: boolean;
  }): Promise<{ bucket: string; created: boolean }>;
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
  deleteObject(args: {
    bucket?: string;
    objectPath: string;
  }): Promise<{ objectPath: string }>;
}

export class KnowledgeService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    knowledgeFileRepository: KnowledgeFileRepository;
    vectorStore: VectorStore;
    fileStorage?: KnowledgeFileStorage | null;
    tierCatalog: TierCatalog;
    openai: OpenAIGateway;
    knowledgeBucket?: string;
    log?: (line: string) => void;
  });

  restoreMissingArtifacts(): Promise<{ restored: number; failed: number }>;

  list(actor: Actor, chatbotId: string): Promise<KnowledgeFile[]>;
  upload(
    actor: Actor,
    chatbotId: string,
    files: UploadFile[],
  ): Promise<KnowledgeFile[]>;
  delete(
    actor: Actor,
    chatbotId: string,
    fileId: string,
  ): Promise<{ deleted: true }>;
  refreshBusinessSummary(
    chatbotId: string,
    knowledgeFiles?: KnowledgeFile[],
  ): Promise<string | null>;
  search(
    chatbotId: string,
    query: string,
    limit?: number,
    queryVector?: number[] | null,
  ): Promise<VectorSearchResult[]>;
}
