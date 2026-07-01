import type { DeleteResult } from 'mongodb';
import type {
  ExternalDashboardCredential,
  MongooseModel,
} from '../../../types';

export class ExternalDashboardCredentialRepository {
  constructor(model: MongooseModel<ExternalDashboardCredential>);
  findByChatbotId(
    chatbotId: string,
  ): Promise<ExternalDashboardCredential | null>;
  upsert(
    chatbotId: string,
    data: Partial<ExternalDashboardCredential>,
  ): Promise<ExternalDashboardCredential>;
  deleteByChatbotId(chatbotId: string): Promise<DeleteResult>;
}
