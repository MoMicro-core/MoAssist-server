import type { Model } from 'mongoose';
import type { MerchantConnector } from '../../../types';

export class ConnectorRepository {
  constructor(model: Model<MerchantConnector>);
  model: Model<MerchantConnector>;
  findByChatbotId(chatbotId: string): Promise<MerchantConnector | null>;
  listEnabled(): Promise<MerchantConnector[]>;
  upsertByChatbotId(
    chatbotId: string,
    data: Partial<MerchantConnector>,
  ): Promise<MerchantConnector | null>;
  deleteByChatbotId(chatbotId: string): Promise<{ deletedCount?: number }>;
}
