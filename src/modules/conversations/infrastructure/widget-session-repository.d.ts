import type { UpdateQuery } from 'mongoose';
import type { DeleteResult } from 'mongodb';
import type { MongooseModel, WidgetSession, WidgetSessionCreateInput } from '../../../types';

export class WidgetSessionRepository {
  constructor(model: MongooseModel<WidgetSession>);
  create(data: WidgetSessionCreateInput): Promise<WidgetSession>;
  findByToken(token: string): Promise<WidgetSession | null>;
  updateByToken(
    token: string,
    update: UpdateQuery<WidgetSession>,
  ): Promise<WidgetSession | null>;
  deleteByChatbot(chatbotId: string): Promise<DeleteResult>;
}
