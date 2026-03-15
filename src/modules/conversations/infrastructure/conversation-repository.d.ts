import type { HydratedDocument } from 'mongoose';
import type { DeleteResult } from 'mongodb';
import type {
  Conversation,
  ConversationCreateInput,
  ConversationStatus,
  MongooseModel,
} from '../../../types';

export interface ConversationTotals {
  totalMessages: number;
  totalLeads: number;
}

export class ConversationRepository {
  constructor(model: MongooseModel<Conversation>);
  create(data: ConversationCreateInput): Promise<Conversation>;
  findById(id: string): Promise<Conversation | null>;
  findDocumentById(id: string): Promise<HydratedDocument<Conversation> | null>;
  findByWidgetSessionToken(widgetSessionToken: string): Promise<Conversation | null>;
  listByChatbot(
    chatbotId: string,
    filters?: Partial<Pick<Conversation, 'status'>>,
  ): Promise<Conversation[]>;
  countByChatbot(
    chatbotId: string,
    filters?: Partial<Pick<Conversation, 'status'>>,
  ): Promise<number>;
  countUnreadByChatbot(chatbotId: string): Promise<number>;
  aggregateTotals(chatbotId: string): Promise<ConversationTotals>;
  deleteByChatbot(chatbotId: string): Promise<DeleteResult>;
}
