'use strict';

const canManageOwnerResource = (actor, ownerUid) =>
  Boolean(actor) && (actor.role === 'admin' || actor.uid === ownerUid);

// External-dashboard tokens are scoped to a single chatbot's inbox. They carry
// role 'dashboard' and a dashboardChatbotId; they may only reach resources that
// belong to that exact chatbot, never another chatbot of the same owner.
const canAccessChatbotResource = (actor, ownerUid, chatbotId) => {
  if (!actor) return false;
  if (actor.role === 'dashboard') {
    return Boolean(chatbotId) && actor.dashboardChatbotId === chatbotId;
  }
  return canManageOwnerResource(actor, ownerUid);
};

const isDashboardActor = (actor) => actor?.role === 'dashboard';

module.exports = {
  canManageOwnerResource,
  canAccessChatbotResource,
  isDashboardActor,
};
