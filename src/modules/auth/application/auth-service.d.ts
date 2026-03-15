import type { Auth } from 'firebase-admin/auth';
import type { Actor, User, UserPublic } from '../../../types';
import type { BillingService } from '../../billing/application/billing-service';
import type { UserRepository } from '../infrastructure/user-repository';
import type { SessionRepository } from '../infrastructure/session-repository';

export const SESSION_TTL_DAYS: number;

export function addDays(value: Date | string | number, days: number): Date;
export function sanitizeUser(user: User): UserPublic;

export class AuthService {
  constructor(args: {
    userRepository: UserRepository;
    sessionRepository: SessionRepository;
    billingService: BillingService;
    firebaseAuth: Auth | null;
  });

  signInWithFirebase(args: {
    idToken: string;
    fcmToken?: string;
  }): Promise<{ token: string; expiresAt: Date; user: UserPublic }>;
  getCurrentUser(actor: Actor): Promise<UserPublic>;
  updateCurrentUser(
    actor: Actor,
    patch?: Partial<Pick<User, 'name' | 'photoUrl'>>,
  ): Promise<UserPublic>;
  logout(token: string): Promise<{ loggedOut: true }>;
}
