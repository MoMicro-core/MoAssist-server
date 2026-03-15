import type { Chatbot } from '../../../types';

export class EmbedService {
  renderScript(args: { chatbot: Chatbot; baseUrl: string }): string;
  renderIframe(args: { chatbot: Chatbot; baseUrl: string }): string;
}
