import type { Actor } from '../../types';

export function canManageOwnerResource(
  actor: Actor | null | undefined,
  ownerUid: string,
): boolean;
