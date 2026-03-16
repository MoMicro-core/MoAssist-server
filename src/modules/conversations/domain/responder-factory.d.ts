import type { Chatbot, Conversation } from '../../../types';
import type { KnowledgeService } from '../../knowledge/application/knowledge-service';
import type { OpenAIGateway } from '../../../types';

export class ManualResponder {
  respond(): Promise<null>;
}

export class AiResponder {
  constructor(args: { openai: OpenAIGateway; knowledgeService: KnowledgeService });
  respond(args: {
    chatbot: Chatbot;
    conversation: Conversation;
    prompt: string;
  }): Promise<string>;
}

export class ResponderFactory {
  constructor(dependencies: {
    openai: OpenAIGateway;
    knowledgeService: KnowledgeService;
  });
  create(chatbot: Chatbot): ManualResponder | AiResponder;
}
