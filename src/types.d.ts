import type { Model } from 'mongoose';
import type { auth } from 'firebase-admin';
import type Stripe from 'stripe';

export type Role = 'user' | 'admin' | 'dashboard';
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
export type ChatbotMood = 'friendly' | 'normal' | 'professional';
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
  dashboardChatbotId?: string;
  email?: string;
  name?: string;
  photoUrl?: string;
  verified?: boolean;
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
  stripeCustomerId?: string;
}

export interface DashboardSessionData {
  dashboardChatbotId: string;
}

export interface AppSession {
  token: string;
  uid: string;
  role: Role;
  fcmToken: string;
  data: UserPublic | DashboardSessionData;
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
  suggestionBackgroundColor: string;
  suggestionTextColor: string;
  suggestionBorderColor: string;
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
  leadsFormDescription: string;
  leadsFormSubmitLabel: string;
  leadsFormSkipLabel: string;
  leadsFormLabels: string[];
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
  leadsFormDescription: string;
  leadsFormSubmitLabel: string;
  leadsFormSkipLabel: string;
  leadsForm: LeadField[];
  brand: {
    logoUrl: string;
    logoBackgroundColor: string;
    bubbleIconUrl: string;
  };
  theme: ChatbotTheme;
  ai: {
    enabled: boolean;
    responseLength: ResponseLength;
    mood: ChatbotMood;
    businessSummary: string;
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
  realtimeUser: RealtimeUser | null;
  realtimeVerifiedAt: Date | null;
  realtimeTokenHash: string;
  realtimeSnapshot: Record<string, unknown> | null;
  realtimeSnapshotAt: Date | null;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RealtimeUser {
  id: string;
  [key: string]: string | number | boolean | null;
}

export interface RealtimeIntent {
  name: string;
  phrases: string[];
  endpoint: string;
  args: string;
  freshness: 'snapshot' | 'live';
}

export interface IntentVector {
  name: string;
  vector: number[];
}

export interface MerchantConnector {
  chatbotId: string;
  ownerUid: string;
  enabled: boolean;
  version: string;
  storagePath: string;
  baseUrl: string;
  allowedHosts: string[];
  secrets: { encrypted?: boolean; payload?: string };
  intents: RealtimeIntent[];
  intentVectors: IntentVector[];
  intentsEmbeddedAt: Date | null;
  routerThreshold: number;
  routerMargin: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MerchantConnectorStatus {
  chatbotId: string;
  enabled: boolean;
  version: string;
  storagePath: string;
  baseUrl: string;
  allowedHosts: string[];
  intents: RealtimeIntent[];
  routerThreshold: number;
  routerMargin: number;
  hasSecrets: boolean;
  intentsEmbeddedAt: Date | null;
  updatedAt: Date | null;
  source: string;
}

export interface RealtimeLiveContext {
  text: string;
  asOf: Date;
}

export interface RealtimeConfig {
  secretsKey: string;
  debug: boolean;
  baseUrlOverride: string;
  allowPrivateHosts: boolean;
  connectorsDirectory: string;
  connectorsBucket?: string;
  workerCount: number;
  workerMaxOldGenerationSizeMb: number;
  workerQueueLimit: number;
  verifyTimeoutMs: number;
  fetchTimeoutMs: number;
  snapshotTimeoutMs: number;
  httpTimeoutMs: number;
  maxResponseBytes: number;
  identityTtlHours: number;
  snapshotTtlMinutes: number;
  maxContextChars: number;
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
  backedUpAt?: Date | null;
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
    connectorsBucket: string;
    knowledgeBucket: string;
  };
  realtime: RealtimeConfig;
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
  externalDashboardCredential: MongooseModel<ExternalDashboardCredential>;
  merchantConnector: MongooseModel<MerchantConnector>;
}

export interface FastifyApp {
  mongodb: FastifyMongoModels;
  stripe: StripeGateway;
  openai: OpenAIGateway;
  supabaseStorage: {
    isConfigured(): boolean;
    uploadPublicObject(args: {
      objectPath: string;
      buffer: Buffer;
      mimeType?: string;
    }): Promise<{ objectPath: string; publicUrl: string }>;
    uploadObject(args: {
      bucket?: string;
      objectPath: string;
      buffer: Buffer;
      mimeType?: string;
    }): Promise<{ objectPath: string }>;
    downloadObject(args: {
      bucket?: string;
      objectPath: string;
    }): Promise<Buffer>;
    ensureBucket(args: {
      bucket: string;
      isPublic?: boolean;
    }): Promise<{ bucket: string; created: boolean }>;
    deleteObject(args: {
      bucket?: string;
      objectPath: string;
    }): Promise<{ objectPath: string }>;
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
  data: UserPublic | DashboardSessionData;
  expiresAt: Date;
}

export interface ExternalDashboardCredential {
  chatbotId: string;
  ownerUid: string;
  enabled: boolean;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExternalDashboardStatus {
  enabled: boolean;
  username: string;
  hasPassword: boolean;
}

export interface ExternalDashboardLoginResult {
  token: string;
  expiresAt: Date;
  chatbot: { id: string; title: string; botName: string };
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
  backedUpAt?: Date | null;
}
