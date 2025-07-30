import { NextRequest, NextResponse } from 'next/server';

/**
 * Enhanced logging for API routes during testing
 */
export function logApiOperation(
  requestId: string,
  operation: string,
  data?: Record<string, any>
) {
  if (process.env.NODE_ENV === 'test' || process.env.DEBUG_API === 'true') {
    console.log(`[${requestId}] ${operation}`, {
      timestamp: new Date().toISOString(),
      ...data
    });
  }
}

/**
 * Extract request context for logging
 */
export function getRequestContext(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || 'unknown';
  const debugMode = request.headers.get('x-debug-logs') === 'true';
  const sessionId = request.headers.get('x-session-id');
  
  return {
    requestId,
    debugMode,
    sessionId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create an enhanced response with logging metadata
 */
export function createApiResponse<T>(
  data: T,
  options: {
    status?: number;
    headers?: Record<string, string>;
    requestId?: string;
    logData?: Record<string, any>;
  } = {}
) {
  const { status = 200, headers = {}, requestId, logData } = options;
  
  if (requestId && logData) {
    logApiOperation(requestId, 'API Response', {
      status,
      ...logData
    });
  }
  
  const response = NextResponse.json(data, { status });
  
  // Add custom headers
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  if (requestId) {
    response.headers.set('x-request-id', requestId);
  }
  
  return response;
}

/**
 * Wrap async API handlers with error logging
 */
export function withApiLogging<T extends any[], R>(
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const startTime = Date.now();
    const request = args[0] as NextRequest;
    const { requestId } = getRequestContext(request);
    
    try {
      logApiOperation(requestId, 'Handler started', {
        method: request.method,
        url: request.url
      });
      
      const result = await handler(...args);
      
      logApiOperation(requestId, 'Handler completed', {
        duration: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      logApiOperation(requestId, 'Handler error', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      throw error;
    }
  };
}