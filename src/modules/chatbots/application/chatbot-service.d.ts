import type {
  Actor,
  AppConfig,
  Chatbot,
  ChatbotSettings,
  ChatbotWithMetrics,
  OpenAIGateway,
  PublicChatbot,
} from '../../../types';
import type { ConversationRepository } from '../../conversations/infrastructure/conversation-repository';
import type { WidgetSessionRepository } from '../../conversations/infrastructure/widget-session-repository';
import type { KnowledgeFileRepository } from '../../knowledge/infrastructure/knowledge-file-repository';
import type { ChatbotRepository } from '../infrastructure/chatbot-repository';

export function isAllowedOrigin(domains?: string[], origin?: string): boolean;

export class ChatbotService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    conversationRepository: ConversationRepository;
    widgetSessionRepository: WidgetSessionRepository;
    knowledgeFileRepository: KnowledgeFileRepository;
    openai: OpenAIGateway;
    countriesConfig: AppConfig['countries'];
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
  updateLanguage(
    actor: Actor,
    chatbotId: string,
    language: string,
    patch?: Partial<{
      title: string;
      botName: string;
      initialMessage: string;
      inputPlaceholder: string;
      suggestedMessages: string[];
      leadsFormTitle: string;
      leadsFormLabels: string[];
      aiTemplate: string;
      aiGuidelines: string;
    }>,
  ): Promise<{
    language: string;
    translation: {
      title: string;
      botName: string;
      initialMessage: string;
      inputPlaceholder: string;
      suggestedMessages: string[];
      leadsFormTitle: string;
      leadsFormLabels: string[];
      aiTemplate: string;
      aiGuidelines: string;
    };
  }>;
  getLanguageOptions(): {
    defaultLanguage: string;
    allowedLanguages: string[];
  };
  delete(actor: Actor, chatbotId: string): Promise<{ deleted: true }>;
  getPublicWidget(
    chatbotId: string,
    origin?: string,
    preferredLanguage?: string,
  ): Promise<PublicChatbot>;
  getInstallCode(
    actor: Actor,
    chatbotId: string,
    baseUrl: string,
  ): Promise<{
    chatbotId: string;
    scriptUrl: string;
    iframeUrl: string;
    dashboardScriptUrl: string;
    dashboardIframeUrl: string;
    scriptSnippet: string;
    iframeSnippet: string;
    dashboardScriptSnippet: string;
    dashboardIframeSnippet: string;
  }>;
  getAnalytics(
    actor: Actor,
    chatbotId: string,
  ): Promise<{
    totalConversations: number;
    openConversations: number;
    activeConversations: number;
    pendingConversations: number;
    closedConversations: number;
    unreadConversations: number;
    totalMessages: number;
    totalLeads: number;
  }>;
}
