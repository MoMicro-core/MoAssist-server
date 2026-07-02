'use strict';

module.exports = {
  url: process.env.SUPABASE_URL || process.env.SupabaseUrl || '',
  serviceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SupabaseServiceRoleKey ||
    '',
  storageBucket:
    process.env.SUPABASE_STORAGE_BUCKET ||
    process.env.SupabaseStorageBucket ||
    'chatbot-assets',
  // Private bucket for per-merchant connector source files.
  connectorsBucket:
    process.env.SUPABASE_CONNECTORS_BUCKET ||
    process.env.SupabaseConnectorsBucket ||
    'merchant-connectors',
  // Private bucket mirroring files/chatbots/* knowledge artifacts (original,
  // extracted text, chunk manifest, vectors) for restore on a fresh server.
  knowledgeBucket:
    process.env.SUPABASE_KNOWLEDGE_BUCKET ||
    process.env.SupabaseKnowledgeBucket ||
    'chatbot-knowledge',
};
