import type { Actor, KnowledgeFile, UploadFile, VectorSearchResult, User } from '../../../types';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { KnowledgeFileRepository } from '../infrastructure/knowledge-file-repository';
import type { VectorStore } from '../infrastructure/vector-store';

export class KnowledgeService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    knowledgeFileRepository: KnowledgeFileRepository;
    vectorStore: VectorStore;
  });

  list(actor: Actor, chatbotId: string): Promise<KnowledgeFile[]>;
  upload(
    actor: Actor,
    owner: User,
    chatbotId: string,
    files: UploadFile[],
  ): Promise<KnowledgeFile[]>;
  delete(actor: Actor, chatbotId: string, fileId: string): Promise<{ deleted: true }>;
  search(
    chatbotId: string,
    query: string,
    limit?: number,
  ): Promise<VectorSearchResult[]>;
}
