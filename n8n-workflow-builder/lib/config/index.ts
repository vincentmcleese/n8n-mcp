// Central configuration export
export { getEnv, getClientEnv, isServer, type Env } from './env';
export { createBrowserClient, createServerClient, supabase } from './supabase';
export { createAnthropicClient, isAnthropicConfigured } from './anthropic';
export { isMCPConfigured } from './mcp';

// Re-export common configuration values
export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
} as const;