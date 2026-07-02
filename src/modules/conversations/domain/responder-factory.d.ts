import type { Chatbot, Conversation } from '../../../types';
import type { KnowledgeService } from '../../knowledge/application/knowledge-service';
import type { OpenAIGateway } from '../../../types';
import type { TierCatalog } from '../../../shared/application/premium';
import type { RealtimeService } from '../../realtime/application/realtime-service';

export class ManualResponder {
  respond(): Promise<null>;
  respondStream(args?: {
    chatbot?: Chatbot;
    conversation?: Conversation;
    prompt?: string;
    onTextDelta?: (chunk: string) => Promise<void> | void;
  }): Promise<null>;
}

export class AiResponder {
  constructor(args: {
    openai: OpenAIGateway;
    knowledgeService: KnowledgeService;
    realtimeService?: RealtimeService | null;
  });
  buildMessages(args: {
    chatbot: Chatbot;
    conversation: Conversation;
    prompt: string;
  }): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>>;
  respond(args: {
    chatbot: Chatbot;
    conversation: Conversation;
    prompt: string;
  }): Promise<string>;
  respondStream(args: {
    chatbot: Chatbot;
    conversation: Conversation;
    prompt: string;
    onTextDelta?: (chunk: string) => Promise<void> | void;
  }): Promise<string>;
}

export class ResponderFactory {
  constructor(dependencies: {
    openai: OpenAIGateway;
    knowledgeService: KnowledgeService;
    tierCatalog: TierCatalog;
    realtimeService?: RealtimeService | null;
  });
  create(chatbot: Chatbot): ManualResponder | AiResponder;
}
