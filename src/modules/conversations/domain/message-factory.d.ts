import type {
  ChatAuthorType,
  ChatMessageAuthor,
  ConversationMessage,
} from '../../../types';

export function createMessage(
  authorType: ChatAuthorType,
  content: string,
): ConversationMessage;

export function getMessageAuthor(authorType: ChatAuthorType): ChatMessageAuthor;
