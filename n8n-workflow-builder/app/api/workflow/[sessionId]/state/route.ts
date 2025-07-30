import { NextRequest, NextResponse } from 'next/server';
import { getSessionStats, getWorkflowSession, extendSessionTimeout } from '@/lib/session-utils';
import { retryWithBackoff } from '@/lib/db/transaction-utils';

/**
 * GET /api/workflow/[sessionId]/state
 * Get current workflow session state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const startTime = Date.now();
  
  try {
    // Validate session exists
    const session = await getWorkflowSession(params.sessionId);
    if (!session) {
      return NextResponse.json(
        { 
          error: 'Session not found',
          message: 'The specified workflow session does not exist or has expired'
        },
        { status: 404 }
      );
    }

    // Get session statistics with retry logic for consistency
    console.log('GET /state - Getting stats for session:', params.sessionId);
    
    let stats;
    try {
      // Use retry logic to handle potential stale reads
      stats = await retryWithBackoff(
        async () => {
          const result = await getSessionStats(params.sessionId);
          if (!result) {
            throw new Error('Stats returned null');
          }
          return result;
        },
        {
          maxRetries: 3,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 500
        }
      );
    } catch (retryError) {
      console.error('Failed to get stats after retries:', retryError);
      return NextResponse.json(
        { 
          error: 'Session state unavailable',
          message: 'Unable to retrieve session state after multiple attempts'
        },
        { status: 500 }
      );
    }
    
    console.log('GET /state - Stats result:', stats);

    // Extend session timeout (heartbeat)
    await extendSessionTimeout(params.sessionId);

    const responseTime = Date.now() - startTime;

    // Return state matching PRD format with cache headers
    const response = NextResponse.json({
      phase: stats.phase,
      stats: {
        discovered: stats.stats.discovered,
        selected: stats.stats.selected,
        configured: stats.stats.configured,
        validated: stats.stats.validated
      },
      metadata: session.state?.metadata || session.metadata || {},
      performance: {
        responseTime,
        withinTarget: responseTime < 500
      }
    });
    
    // Add cache headers for consistency
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Last-Modified', new Date().toUTCString());
    
    return response;

  } catch (error) {
    console.error('Get state error:', error);
    
    const responseTime = Date.now() - startTime;
    
    if (error instanceof Error) {
      // Database connection errors
      if (error.message.includes('Database') || error.message.includes('connection')) {
        return NextResponse.json(
          { 
            error: 'Database error',
            message: 'Unable to connect to database',
            retryable: true,
            performance: { responseTime }
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to retrieve workflow state',
        retryable: true,
        performance: { responseTime }
      },
      { status: 500 }
    );
  }
}