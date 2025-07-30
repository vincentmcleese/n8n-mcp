import { NextRequest, NextResponse } from 'next/server';

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
 * Middleware for logging and debugging API requests
 */
export function middleware(request: NextRequest) {
  // Only process API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
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

  // Clone the request to add request ID header
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set('x-request-id', requestId);

  // Create response with modified headers
  const response = NextResponse.next({
    request: {
      headers: modifiedHeaders,
    },
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
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};