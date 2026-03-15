import type { HydratedDocument } from 'mongoose';
import type { DeleteResult } from 'mongodb';
import type { AppSession, AppSessionCreateInput, MongooseModel } from '../../../types';

export class SessionRepository {
  constructor(model: MongooseModel<AppSession>);
  create(data: AppSessionCreateInput): Promise<AppSession>;
  findByToken(token: string): Promise<AppSession | null>;
  touch(token: string, expiresAt: Date): Promise<HydratedDocument<AppSession> | null>;
  deleteByToken(token: string): Promise<DeleteResult>;
  deleteByUid(uid: string): Promise<DeleteResult>;
}
