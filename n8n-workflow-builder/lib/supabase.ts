// lib/supabase.ts

import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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

/**
 * Creates a Supabase client for server components/API routes
 * Handles cookie management for authentication
 */
export async function createServerClientInstance() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase service client for admin operations
 * Uses service role key - only use on server side!
 */
export function createServiceClient() {
  // Only allow in server environment
  if (typeof window !== 'undefined') {
    throw new Error('Service client can only be used on the server');
  }

  const env = getClientEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY is required for service client');
  }


  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Service client doesn't need cookie management
        },
      },
    }
  );
}