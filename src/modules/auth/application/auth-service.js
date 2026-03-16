'use strict';

const { createId } = require('../../../shared/application/ids');
const {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
} = require('../../../shared/application/errors');

const SESSION_TTL_DAYS = 30;

const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const sanitizeUser = (user) => ({
  uid: user.uid,
  email: user.email,
  role: user.role,
  name: user.name,
  photoUrl: user.photoUrl,
  verified: user.verified,
  premiumStatus: 'free',
  premiumPlan: 'free',
  premiumCurrentPeriodEnd: null,
});

class AuthService {
  constructor({
    userRepository,
    sessionRepository,
    billingService,
    firebaseAuth,
  }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.billingService = billingService;
    this.firebaseAuth = firebaseAuth;
  }

  async signInWithFirebase({ idToken, fcmToken = '' }) {
    if (!idToken) throw new BadRequestError('Firebase idToken is required');
    if (!this.firebaseAuth) {
      throw new UnauthorizedError('Firebase authentication is not configured');
    }

    const decoded = await this.firebaseAuth.verifyIdToken(idToken, true);

    if (!decoded.uid || !decoded.email) {
      throw new BadRequestError('Firebase token is missing required claims');
    }

    const existing = await this.userRepository.findByUid(decoded.uid);
    const roleFromToken =
      decoded.role === 'admin' || decoded.admin === true ? 'admin' : 'user';

    let stripeCustomerId = existing?.stripeCustomerId || '';
    if (!stripeCustomerId) {
      stripeCustomerId = await this.billingService.ensureCustomer({
        customerId: stripeCustomerId,
        email: decoded.email,
        uid: decoded.uid,
      });
    } else {
      stripeCustomerId = await this.billingService.ensureCustomer({
        customerId: stripeCustomerId,
        email: decoded.email,
        uid: decoded.uid,
      });
    }

    const nextUserPayload = {
      uid: decoded.uid,
      email: decoded.email,
      role: existing?.role || roleFromToken,
      name: decoded.name || existing?.name || '',
      photoUrl: decoded.picture || existing?.photoUrl || '',
      verified: Boolean(decoded.email_verified),
      stripeCustomerId,
      premiumStatus: 'free',
      premiumPlan: 'free',
      premiumCurrentPeriodEnd: null,
    };
    const sessionDevicePatch = fcmToken
      ? { $addToSet: { fcmTokens: fcmToken } }
      : {};

    const user = existing
      ? await this.userRepository.updateByUid(decoded.uid, {
          $set: nextUserPayload,
          ...sessionDevicePatch,
        })
      : await this.userRepository.create({
          ...nextUserPayload,
          fcmTokens: fcmToken ? [fcmToken] : [],
        });

    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
    const session = await this.sessionRepository.create({
      token: createId(),
      uid: user.uid,
      role: user.role,
      fcmToken,
      data: sanitizeUser(user),
      expiresAt,
    });

    return {
      token: session.token,
      expiresAt,
      user: sanitizeUser(user),
    };
  }

  async getCurrentUser(actor) {
    const user = await this.userRepository.findByUid(actor.uid);
    if (!user) throw new NotFoundError('User not found');
    return sanitizeUser(user);
  }

  async updateCurrentUser(actor, patch = {}) {
    const allowedFields = ['name', 'photoUrl'];
    const update = {};

    for (const field of allowedFields) {
      if (typeof patch[field] === 'string') update[field] = patch[field];
    }

    const user = await this.userRepository.updateByUid(actor.uid, {
      $set: update,
    });

    if (!user) throw new NotFoundError('User not found');
    return sanitizeUser(user);
  }

  async logout(token) {
    await this.sessionRepository.deleteByToken(token);
    return { loggedOut: true };
  }
}

module.exports = { AuthService, sanitizeUser, addDays, SESSION_TTL_DAYS };
