// app/api/supabase-test/route.ts

import { NextResponse } from 'next/server';
import { createServerClientInstance, createServiceClient } from '@/lib/supabase';

export async function GET() {
  try {
    // Test regular server client
    const supabase = await createServerClientInstance();
    
    // Test connection by checking auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Test service client (admin operations)
    let serviceStatus = 'Not tested';
    try {
      const serviceClient = createServiceClient();
      // Simple health check - list buckets in storage
      const { data: buckets, error: bucketsError } = await serviceClient.storage.listBuckets();
      serviceStatus = bucketsError ? `Error: ${bucketsError.message}` : 'Connected';
    } catch (error) {
      serviceStatus = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      connections: {
        serverClient: {
          connected: !authError,
          user: user?.email || null,
          error: authError?.message || null,
        },
        serviceClient: {
          status: serviceStatus,
        },
      },
      environment: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing',
        serviceKey: process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Missing',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to test Supabase connection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}