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
import type { UserRepository } from '../../auth/infrastructure/user-repository';
import type { ConversationRepository } from '../infrastructure/conversation-repository';
import type { WidgetSessionRepository } from '../infrastructure/widget-session-repository';
import type { ResponderFactory } from '../domain/responder-factory';

export interface MessageCreatedPayload {
  conversationId: string;
  chatbotId: string;
  message: ConversationMessage;
}

export class ConversationService {
  constructor(args: {
    chatbotService: ChatbotService;
    chatbotRepository: ChatbotRepository;
    conversationRepository: ConversationRepository;
    widgetSessionRepository: WidgetSessionRepository;
    userRepository: UserRepository;
    responderFactory: ResponderFactory;
    connectionManager: ConnectionManager;
  });

  createOrRestoreWidgetSession(args: {
    chatbotId: string;
    token?: string;
    visitor?: Record<string, string>;
    origin?: string;
    locale?: Record<string, unknown>;
  }): Promise<{
    token: string;
    conversation: ConversationView;
    chatbot: PublicChatbot;
  }>;

  authenticateWidget(token: string): Promise<{
    widgetSession: WidgetSession;
    conversation: Conversation;
  }>;

  listAllForActor(
    actor: Actor,
    filters?: { status?: 'open' | 'closed'; chatbotId?: string },
  ): Promise<ConversationView[]>;
  listForActor(actor: Actor, chatbotId: string): Promise<ConversationView[]>;
  getForActor(actor: Actor, conversationId: string): Promise<ConversationView>;

  sendVisitorMessage(args: {
    widgetToken: string;
    content: string;
  }): Promise<MessageCreatedPayload>;

  sendOwnerMessage(
    actor: Actor,
    conversationId: string,
    content: string,
  ): Promise<MessageCreatedPayload>;

  markRead(actor: Actor, conversationId: string): Promise<{ read: true }>;
}
