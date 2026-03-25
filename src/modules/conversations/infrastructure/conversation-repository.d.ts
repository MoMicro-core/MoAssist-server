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
  findByChatbotAndAuthClient(
    chatbotId: string,
    authClient: string,
  ): Promise<Conversation | null>;
  findDocumentByChatbotAndAuthClient(
    chatbotId: string,
    authClient: string,
  ): Promise<HydratedDocument<Conversation> | null>;
  listLifecycleCandidates(): Promise<Array<HydratedDocument<Conversation>>>;
  listByChatbot(
    chatbotId: string,
    filters?: Partial<Pick<Conversation, 'status'>>,
  ): Promise<Conversation[]>;
  listByOwner(
    ownerUid: string,
    filters?: Partial<Pick<Conversation, 'status' | 'chatbotId'>>,
  ): Promise<Conversation[]>;
  countByChatbot(
    chatbotId: string,
    filters?: Partial<Pick<Conversation, 'status'>>,
  ): Promise<number>;
  countUnreadByChatbot(chatbotId: string): Promise<number>;
  aggregateTotals(chatbotId: string): Promise<ConversationTotals>;
  deleteByChatbot(chatbotId: string): Promise<DeleteResult>;
}
