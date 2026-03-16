import type { HydratedDocument, UpdateQuery } from 'mongoose';
import type { Chatbot, ChatbotCreateInput, MongooseModel } from '../../../types';

export class ChatbotRepository {
  constructor(model: MongooseModel<Chatbot>);
  create(data: ChatbotCreateInput): Promise<Chatbot>;
  findById(id: string): Promise<Chatbot | null>;
  findDocumentById(id: string): Promise<HydratedDocument<Chatbot> | null>;
  listByOwner(ownerUid: string): Promise<Chatbot[]>;
  listAll(): Promise<Chatbot[]>;
  deleteById(id: string): Promise<Chatbot | null>;
  updateById(id: string, update: UpdateQuery<Chatbot>): Promise<Chatbot | null>;
}
