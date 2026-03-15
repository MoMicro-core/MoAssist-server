import type { DeleteResult } from 'mongodb';
import type { KnowledgeFile, KnowledgeFileCreateInput, MongooseModel } from '../../../types';

export class KnowledgeFileRepository {
  constructor(model: MongooseModel<KnowledgeFile>);
  create(data: KnowledgeFileCreateInput): Promise<KnowledgeFile>;
  listByChatbot(chatbotId: string): Promise<KnowledgeFile[]>;
  countByChatbot(chatbotId: string): Promise<number>;
  findById(id: string): Promise<KnowledgeFile | null>;
  deleteById(id: string): Promise<KnowledgeFile | null>;
  deleteByChatbot(chatbotId: string): Promise<DeleteResult>;
}
