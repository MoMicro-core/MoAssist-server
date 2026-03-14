'use strict';

const canManageOwnerResource = (actor, ownerUid) =>
  Boolean(actor) && (actor.role === 'admin' || actor.uid === ownerUid);

module.exports = { canManageOwnerResource };
