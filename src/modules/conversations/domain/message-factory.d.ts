import type { ChatAuthorType, ConversationMessage } from '../../../types';

export function createMessage(
  authorType: ChatAuthorType,
  content: string,
): ConversationMessage;
