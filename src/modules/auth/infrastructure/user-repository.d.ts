import type { HydratedDocument, UpdateQuery } from 'mongoose';
import type { MongooseModel, User, UserCreateInput } from '../../../types';

export class UserRepository {
  constructor(model: MongooseModel<User>);
  create(data: UserCreateInput): Promise<User>;
  findByUid(uid: string): Promise<User | null>;
  findDocumentByUid(uid: string): Promise<HydratedDocument<User> | null>;
  findByStripeCustomerId(customerId: string): Promise<User | null>;
  updateByUid(uid: string, update: UpdateQuery<User>): Promise<User | null>;
  deleteByUid(uid: string): Promise<User | null>;
}
