import type {
  Actor,
  Conversation,
  ConversationMessage,
  ConversationView,
  PublicChatbot,
  WidgetSession,
} from '../../../types';
import type { ConnectionManager } from '../../../types';
import type { ChatbotService } from '../../chatbots/application/chatbot-service';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { ConversationRepository } from '../infrastructure/conversation-repository';
import type { WidgetSessionRepository } from '../infrastructure/widget-session-repository';
import type { ResponderFactory } from '../domain/responder-factory';

export interface MessageCreatedPayload {
  conversationId: string;
  chatbotId: string;
  message: ConversationMessage;
}

export interface MessageStreamStartedPayload extends MessageCreatedPayload {}

export interface MessageStreamDeltaPayload {
  conversationId: string;
  chatbotId: string;
  messageId: string;
  chunk: string;
}

export interface MessageStreamCompletedPayload {
  conversationId: string;
  chatbotId: string;
  messageId: string;
}

export class ConversationService {
  constructor(args: {
    chatbotService: ChatbotService;
    chatbotRepository: ChatbotRepository;
    conversationRepository: ConversationRepository;
    widgetSessionRepository: WidgetSessionRepository;
    responderFactory: ResponderFactory;
    connectionManager: ConnectionManager;
  });

  createOrRestoreWidgetSession(args: {
    chatbotId: string;
    token?: string;
    visitor?: Record<string, string>;
    origin?: string;
    locale?: Record<string, unknown>;
    language?: string;
    authClient?: string;
  }): Promise<{
    token: string;
    conversation: ConversationView;
    chatbot: PublicChatbot;
  }>;

  authenticateWidget(token: string, authClient?: string): Promise<{
    widgetSession: WidgetSession;
    conversation: ConversationView;
  }>;

  listAllForActor(
    actor: Actor,
    filters?: { status?: 'active' | 'pending' | 'closed'; chatbotId?: string },
  ): Promise<ConversationView[]>;
  listForActor(actor: Actor, chatbotId: string): Promise<ConversationView[]>;
  getForActor(actor: Actor, conversationId: string): Promise<ConversationView>;

  sendVisitorMessage(args: {
    widgetToken: string;
    authClient?: string;
    content: string;
  }): Promise<MessageCreatedPayload>;

  sendOwnerMessage(
    actor: Actor,
    conversationId: string,
    content: string,
  ): Promise<MessageCreatedPayload>;

  closeForWidget(
    widgetToken: string,
    authClient?: string,
  ): Promise<{ closed: true; conversation: ConversationView }>;
  closeForActor(
    actor: Actor,
    conversationId: string,
  ): Promise<{ closed: true; conversation: ConversationView }>;
  markRead(actor: Actor, conversationId: string): Promise<{ read: true }>;
  markReadByWidget(widgetToken: string): Promise<{ read: true }>;
}
