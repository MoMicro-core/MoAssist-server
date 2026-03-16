import type { DeleteResult } from 'mongodb';
import type Stripe from 'stripe';
import type { MongooseModel, Subscription } from '../../../types';

export class SubscriptionRepository {
  constructor(model: MongooseModel<Subscription>);
  findById(id: string): Promise<Subscription | null>;
  upsertFromStripe(
    userUid: string,
    chatbotId: string,
    subscription: Stripe.Subscription,
  ): Promise<Subscription>;
  listByUser(userUid: string): Promise<Subscription[]>;
  listByChatbot(chatbotId: string): Promise<Subscription[]>;
  deleteByUser(userUid: string): Promise<DeleteResult>;
  deleteByChatbot(chatbotId: string): Promise<DeleteResult>;
}
