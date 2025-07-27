import { NextResponse } from 'next/server';
import { getEnv, isAnthropicConfigured } from '@/lib/config';

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not available in production', { status: 404 });
  }

  try {
    // Try to get validated environment
    const env = getEnv();
    
    // Check which variables are configured
    const status = {
      environment: process.env.NODE_ENV || 'not set',
      publicVars: {
        supabaseUrl: !!env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseKey: !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      serverVars: {
        anthropic: !!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.startsWith('sk-'),
        mcpUrl: !!env.MCP_SERVER_URL,
        mcpKey: !!env.MCP_API_KEY,
        mcpProfile: !!env.MCP_PROFILE,
        cronSecret: !!env.CRON_SECRET && env.CRON_SECRET.length >= 32,
      },
      services: {
        anthropicConfigured: isAnthropicConfigured(),
      },
      allValid: true,
      message: '✅ All environment variables are properly configured!'
    };

    return NextResponse.json(status, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    // If validation fails, return error details
    return NextResponse.json({
      environment: process.env.NODE_ENV || 'not set',
      allValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: '❌ Environment validation failed. Check your .env.local file.',
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}