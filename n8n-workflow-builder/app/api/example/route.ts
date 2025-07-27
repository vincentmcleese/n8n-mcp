/**
 * Example API route showing environment variable usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnv, isAnthropicConfigured, isMCPConfigured } from '@/lib/config';
import { createAnthropicClient } from '@/lib/config';
import { createServerClient } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get type-safe environment variables
    const env = getEnv();
    
    // Check service availability
    const services = {
      supabase: true, // Always available with public env vars
      anthropic: isAnthropicConfigured(),
      mcp: isMCPConfigured(),
    };
    
    // Example: Using Supabase
    const supabase = createServerClient();
    // const { data, error } = await supabase.from('workflows').select('*').limit(1);
    
    // Example: Using Anthropic (if configured)
    if (services.anthropic) {
      const anthropic = createAnthropicClient();
      // const response = await anthropic.messages.create({...});
    }
    
    // Example: Protected endpoint with CRON_SECRET
    const authHeader = request.headers.get('authorization');
    if (request.nextUrl.searchParams.get('cron') === 'true') {
      if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json({
      status: 'ok',
      environment: env.NODE_ENV,
      services,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate environment before processing
    const env = getEnv();
    
    if (!isAnthropicConfigured()) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }
    
    const body = await request.json();
    
    // Use services with confidence they're configured
    const anthropic = createAnthropicClient();
    const supabase = createServerClient();
    
    // Your implementation here...
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}