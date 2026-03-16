import type {
  Actor,
  Chatbot,
  ChatbotSettings,
  ChatbotWithMetrics,
  PublicChatbot,
} from '../../../types';
import type { ConversationRepository } from '../../conversations/infrastructure/conversation-repository';
import type { WidgetSessionRepository } from '../../conversations/infrastructure/widget-session-repository';
import type { KnowledgeFileRepository } from '../../knowledge/infrastructure/knowledge-file-repository';
import type { ChatbotRepository } from '../infrastructure/chatbot-repository';

export function isAllowedOrigin(
  domains?: string[],
  origin?: string,
): boolean;

export class ChatbotService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    conversationRepository: ConversationRepository;
    widgetSessionRepository: WidgetSessionRepository;
    knowledgeFileRepository: KnowledgeFileRepository;
  });

  list(actor: Actor): Promise<ChatbotWithMetrics[]>;
  create(
    actor: Actor,
    payload?: { settings?: Partial<ChatbotSettings> },
  ): Promise<Chatbot>;
  getForActor(actor: Actor, chatbotId: string): Promise<Chatbot>;
  update(
    actor: Actor,
    chatbotId: string,
    patch: { settings?: Partial<ChatbotSettings> } | undefined,
  ): Promise<Chatbot>;
  delete(actor: Actor, chatbotId: string): Promise<{ deleted: true }>;
  getPublicWidget(
    chatbotId: string,
    origin?: string,
  ): Promise<PublicChatbot>;
  getInstallCode(
    actor: Actor,
    chatbotId: string,
    baseUrl: string,
  ): Promise<{
    chatbotId: string;
    scriptUrl: string;
    iframeUrl: string;
    scriptSnippet: string;
    iframeSnippet: string;
  }>;
  getAnalytics(actor: Actor, chatbotId: string): Promise<{
    totalConversations: number;
    openConversations: number;
    unreadConversations: number;
    totalMessages: number;
    totalLeads: number;
  }>;
}
