import type { Model } from 'mongoose';
import type { auth } from 'firebase-admin';
import type Stripe from 'stripe';

export type Role = 'user' | 'admin';
export type PremiumStatus =
  | 'free'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled';
export type BillingTierCapability = string;
export type ChatbotStatus = 'draft' | 'published';
export type WidgetLocation = 'left' | 'right' | 'top-left' | 'top-right';
export type ResponseLength = 'short' | 'medium' | 'long';
export type ConversationStatus = 'active' | 'pending' | 'closed';
export type ChatAuthorType = 'visitor' | 'owner' | 'assistant';
export type ChatMessageAuthor = 'human' | 'ai';
export type KnowledgeFileStatus = 'processing' | 'ready' | 'failed';
export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface User {
  uid: string;
  email: string;
  role: Role;
  name: string;
  photoUrl: string;
  verified: boolean;
  status: 'active' | 'blocked';
  fcmTokens: string[];
  stripeCustomerId: string;
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserPublic {
  uid: string;
  email: string;
  role: Role;
  name: string;
  photoUrl: string;
  verified: boolean;
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
}

export interface Actor {
  uid: string;
  role: Role;
  email?: string;
  name?: string;
  photoUrl?: string;
  verified?: boolean;
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
  stripeCustomerId?: string;
}

export interface AppSession {
  token: string;
  uid: string;
  role: Role;
  fcmToken: string;
  data: UserPublic;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LeadField {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

export interface ChatbotThemeVariant {
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  launcherBackgroundColor: string;
  inputBackgroundColor: string;
  textColor: string;
  accentTextColor: string;
  borderColor: string;
}

export interface ChatbotTheme {
  light: ChatbotThemeVariant;
  dark: ChatbotThemeVariant;
}

export interface BillingTierConfig {
  id: string;
  name: string;
  monthlyPriceUsd: number;
  stripePriceId?: string;
  checkoutEnabled?: boolean;
  capabilities?: BillingTierCapability[];
  limits?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface BillingTierSummary {
  id: string;
  name: string;
  monthlyPriceUsd: number;
  checkoutEnabled: boolean;
  stripePriceConfigured: boolean;
  capabilities: BillingTierCapability[];
  limits: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface ChatbotLanguagePack {
  title: string;
  botName: string;
  initialMessage: string;
  inputPlaceholder: string;
  suggestedMessages: string[];
  leadsFormTitle: string;
  leadsFormLabels: string[];
  aiTemplate: string;
  aiGuidelines: string;
}

export interface ChatbotSettings {
  status: ChatbotStatus;
  title: string;
  botName: string;
  initialMessage: string;
  inputPlaceholder: string;
  inputHeight: number;
  auth: boolean;
  inactivityHours: number;
  defaultLanguage: string;
  enabledLanguages: string[];
  widgetLocation: WidgetLocation;
  rounded: boolean;
  cornerRadius: number;
  domains: string[];
  suggestedMessages: string[];
  leadsFormTitle: string;
  leadsForm: LeadField[];
  brand: {
    logoUrl: string;
    logoBackgroundColor: string;
    bubbleIconUrl: string;
  };
  theme: ChatbotTheme;
  ai: {
    enabled: boolean;
    template: string;
    responseLength: ResponseLength;
    guidelines: string;
  };
  translations?: Record<string, ChatbotLanguagePack>;
  translationSourceHash?: string;
}

export interface Chatbot {
  id: string;
  ownerUid: string;
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
  trialUsedAt?: Date | null;
  settings: ChatbotSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChatbotMetrics {
  conversationsCount: number;
  unreadCount: number;
  filesCount: number;
}

export type ChatbotWithMetrics = Chatbot & { metrics: ChatbotMetrics };

export interface PublicChatbot {
  id: string;
  ownerUid: string;
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
  settings: ChatbotSettings;
}

export interface ConversationMessage {
  id: string;
  authorType: ChatAuthorType;
  author: ChatMessageAuthor;
  content: string;
  createdAt: Date;
  read: boolean;
  readByOwner: boolean;
  readByVisitor: boolean;
}

export interface Conversation {
  id: string;
  chatbotId: string;
  ownerUid: string;
  widgetSessionToken: string;
  authClient: string;
  status: ConversationStatus;
  visitor: Record<string, string>;
  locale: Record<string, unknown>;
  lastMessagePreview: string;
  lastMessageAt: Date | null;
  lastVisitorMessageAt: Date | null;
  unreadForOwner: number;
  messages: ConversationMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ConversationView {
  id: string;
  chatbotId: string;
  authClient: string;
  status: ConversationStatus;
  visitor: Record<string, string>;
  locale: Record<string, unknown>;
  lastMessagePreview: string;
  lastMessageAt: Date | null;
  lastVisitorMessageAt: Date | null;
  unreadForOwner: number;
  messages: ConversationMessage[];
}

export interface WidgetSession {
  token: string;
  chatbotId: string;
  conversationId: string;
  authClient: string;
  visitorData: Record<string, string>;
  locale: Record<string, unknown>;
  origin: string;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KnowledgeFile {
  id: string;
  chatbotId: string;
  ownerUid: string;
  name: string;
  mimeType: string;
  size: number;
  status: KnowledgeFileStatus;
  chunksCount: number;
  directory: string;
  originalPath: string;
  textPath: string;
  manifestPath: string;
  vectorsPath: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Subscription {
  id: string;
  userUid: string;
  chatbotId: string;
  customerId: string;
  priceId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  raw: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VectorSearchResult {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  score: number;
}

export interface UploadFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface AppConfig {
  environment: {
    port?: number;
    host?: string;
    appUrl?: string;
    productName?: string;
  };
  billing: {
    trialTierId?: string;
    defaultCheckoutTierId?: string;
    tiers: BillingTierConfig[];
  };
  stripe: {
    secretKey?: string;
    webhookSecret?: string;
    premiumPriceId?: string;
  };
  openai: {
    enabled: boolean;
    key: string;
    chat: { model: string };
    embeddings: { model: string };
  };
  countries: {
    europe?: string[];
    countryAliases?: Record<string, string>;
    localizationByCountry?: Record<
      string,
      {
        language?: string;
        currency?: string;
      }
    >;
  };
  mongodb: {
    url: string;
    database: string;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
    storageBucket: string;
  };
}

export type MongooseModel<T> = Model<T>;

export interface FastifyMongoModels {
  user: MongooseModel<User>;
  appSession: MongooseModel<AppSession>;
  chatbot: MongooseModel<Chatbot>;
  conversation: MongooseModel<Conversation>;
  widgetSession: MongooseModel<WidgetSession>;
  subscription: MongooseModel<Subscription>;
  knowledgeFile: MongooseModel<KnowledgeFile>;
}

export interface FastifyApp {
  mongodb: FastifyMongoModels;
  stripe: StripeGateway;
  openai: OpenAIGateway;
  supabaseStorage: {
    uploadPublicObject(args: {
      objectPath: string;
      buffer: Buffer;
      mimeType?: string;
    }): Promise<{ objectPath: string; publicUrl: string }>;
  };
  config: AppConfig;
  firebaseAuth: auth.Auth | null;
  client: ConnectionManager;
}

export interface StripeGateway {
  ensureCustomer(args: {
    customerId: string;
    email: string;
    uid: string;
  }): Promise<Stripe.Customer>;
  createCheckoutSession(args: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    uid: string;
    chatbotId: string;
    tierId: string;
  }): Promise<{ id: string; url: string | null }>;
  createPortalSession(args: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string | null }>;
  constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string,
  ): Stripe.Event;
}

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface OpenAIGateway {
  createChatCompletion(args: {
    messages: ChatMessage[];
    temperature?: number;
  }): Promise<string>;
  streamChatCompletion(args: {
    messages: ChatMessage[];
    temperature?: number;
    onTextDelta?: (chunk: string) => Promise<void> | void;
  }): Promise<string>;
  createEmbedding(input: string): Promise<number[]>;
  createEmbeddings(input: string[]): Promise<number[][]>;
}

export interface ConnectionManager {
  publish(room: string, event: string, payload: unknown): void;
}

export interface UserCreateInput {
  uid: string;
  email: string;
  role?: Role;
  name?: string;
  photoUrl?: string;
  verified?: boolean;
  status?: 'active' | 'blocked';
  fcmTokens?: string[];
  stripeCustomerId?: string;
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
}

export interface AppSessionCreateInput {
  token: string;
  uid: string;
  role: Role;
  fcmToken?: string;
  data: UserPublic;
  expiresAt: Date;
}

export interface ChatbotCreateInput {
  id: string;
  ownerUid: string;
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
  trialUsedAt?: Date | null;
  settings: ChatbotSettings;
}

export interface ConversationCreateInput {
  id: string;
  chatbotId: string;
  ownerUid: string;
  widgetSessionToken: string;
  authClient: string;
  status: ConversationStatus;
  visitor: Record<string, string>;
  locale: Record<string, unknown>;
  lastMessagePreview: string;
  lastMessageAt: Date | null;
  lastVisitorMessageAt: Date | null;
  unreadForOwner: number;
  messages: ConversationMessage[];
}

export interface WidgetSessionCreateInput {
  token: string;
  chatbotId: string;
  conversationId: string;
  authClient: string;
  visitorData: Record<string, string>;
  locale: Record<string, unknown>;
  origin: string;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface KnowledgeFileCreateInput {
  id: string;
  chatbotId: string;
  ownerUid: string;
  name: string;
  mimeType: string;
  size: number;
  status: KnowledgeFileStatus;
  chunksCount: number;
  directory: string;
  originalPath: string;
  textPath: string;
  manifestPath: string;
  vectorsPath: string;
}
