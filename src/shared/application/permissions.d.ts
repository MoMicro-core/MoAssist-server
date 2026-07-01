import type { Actor } from '../../types';

export function canManageOwnerResource(
  actor: Actor | null | undefined,
  ownerUid: string,
): boolean;

export function canAccessChatbotResource(
  actor: Actor | null | undefined,
  ownerUid: string,
  chatbotId: string,
): boolean;

export function isDashboardActor(actor: Actor | null | undefined): boolean;
