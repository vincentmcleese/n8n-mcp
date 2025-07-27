import { createClient } from '@supabase/supabase-js';
import { getEnv, getClientEnv, isServer } from './env';

// Singleton instances
let browserClient: ReturnType<typeof createClient> | undefined;
let serverClient: ReturnType<typeof createClient> | undefined;

// Create a Supabase client for browser (uses public env vars)
export function createBrowserClient() {
  if (browserClient) return browserClient;
  
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getClientEnv();
  
  browserClient = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
  
  return browserClient;
}

// Create a Supabase client for server (uses validated env)
export function createServerClient() {
  if (serverClient) return serverClient;
  
  if (!isServer) {
    throw new Error('createServerClient can only be called on the server');
  }
  
  const env = getEnv();
  
  serverClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
  
  return serverClient;
}

// Export a default client based on environment
export const supabase = isServer ? createServerClient() : createBrowserClient();