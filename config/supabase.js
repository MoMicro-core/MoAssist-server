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
};
