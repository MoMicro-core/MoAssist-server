import type { DeleteResult } from 'mongodb';
import type Stripe from 'stripe';
import type { MongooseModel, Subscription } from '../../../types';

export class SubscriptionRepository {
  constructor(model: MongooseModel<Subscription>);
  upsertFromStripe(userUid: string, subscription: Stripe.Subscription): Promise<Subscription>;
  listByUser(userUid: string): Promise<Subscription[]>;
  deleteByUser(userUid: string): Promise<DeleteResult>;
}
