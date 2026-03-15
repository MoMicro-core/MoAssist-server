import type { FastifyApp } from './types';
import type { AuthService } from './modules/auth/application/auth-service';
import type { BillingService } from './modules/billing/application/billing-service';
import type { ChatbotService } from './modules/chatbots/application/chatbot-service';
import type { ConversationService } from './modules/conversations/application/conversation-service';
import type { KnowledgeService } from './modules/knowledge/application/knowledge-service';
import type { UserRepository } from './modules/auth/infrastructure/user-repository';
import type { EmbedService } from './modules/widget/application/embed-service';

export interface Services {
  authService: AuthService;
  billingService: BillingService;
  chatbotService: ChatbotService;
  conversationService: ConversationService;
  knowledgeService: KnowledgeService;
  userRepository: UserRepository;
  embedService: EmbedService;
}

export function createServices(fastify: FastifyApp): Promise<Services>;
