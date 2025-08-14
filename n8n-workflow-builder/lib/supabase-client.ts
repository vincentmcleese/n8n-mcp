// lib/supabase-client.ts
// Client-only Supabase utilities (no server imports)

import { createBrowserClient } from '@supabase/ssr';
import { getClientEnv } from './config/env';

// Type for our database - will be generated later with Supabase CLI
export type Database = any; // TODO: Replace with generated types

/**
 * Creates a Supabase client for browser/client components
 * Uses singleton pattern to ensure only one instance
 */
export function createClient() {
  const env = getClientEnv();
  
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}