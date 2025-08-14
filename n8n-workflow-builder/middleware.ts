import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/utils/supabase/middleware';

interface LogContext {
  requestId: string;
  method: string;
  path: string;
  sessionId?: string;
  timestamp: string;
}

/**
 * Extracts session ID from URL path if present
 */
function extractSessionId(pathname: string): string | undefined {
  const match = pathname.match(/\/api\/workflow\/([^\/]+)/);
  return match ? match[1] : undefined;
}

/**
 * Middleware for authentication and logging API requests
 */
export async function middleware(request: NextRequest) {
  try {
    // Handle authentication for all routes
    const authResponse = await updateSession(request);
    
    // If auth middleware returned a redirect, use it
    if (authResponse.status === 307 || authResponse.status === 302) {
      return authResponse;
    }
    
    // Only add logging headers for API routes
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return authResponse;
    }

    const requestId = request.headers.get('x-request-id') || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const isDebugMode = request.headers.get('x-debug-logs') === 'true' || process.env.NODE_ENV === 'test';
    
    const logContext: LogContext = {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      sessionId: extractSessionId(request.nextUrl.pathname),
      timestamp: new Date().toISOString()
    };

    // Log request start
    if (isDebugMode) {
      console.log(`[API] Request started`, logContext);
    }

    // Clone the response to avoid modifying headers after they're sent
    const response = NextResponse.next({
      request,
      headers: authResponse.headers,
    });

    // Add request ID to response headers
    response.headers.set('x-request-id', requestId);

    // Add timing header for debugging
    response.headers.set('x-request-timestamp', logContext.timestamp);

    // If in debug mode, add additional headers
    if (isDebugMode) {
      response.headers.set('x-debug-mode', 'true');
      response.headers.set('x-session-id', logContext.sessionId || 'none');
    }

    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, just pass through
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};