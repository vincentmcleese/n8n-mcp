import { NextRequest, NextResponse } from 'next/server';

interface ServerLog {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  context?: Record<string, any>;
}

class ServerLogger {
  private logs: Map<string, ServerLog[]> = new Map();
  private maxLogsPerRequest = 100;
  private logRetentionMs = 5 * 60 * 1000; // 5 minutes

  log(requestId: string, level: ServerLog['level'], message: string, context?: Record<string, any>) {
    if (!this.logs.has(requestId)) {
      this.logs.set(requestId, []);
    }

    const logs = this.logs.get(requestId)!;
    logs.push({
      timestamp: new Date(),
      level,
      message,
      context
    });

    // Limit logs per request
    if (logs.length > this.maxLogsPerRequest) {
      logs.shift();
    }

    // Also log to console for debugging
    const logMessage = `[${requestId}] ${message}`;
    switch (level) {
      case 'error':
        console.error(logMessage, context);
        break;
      case 'warn':
        console.warn(logMessage, context);
        break;
      case 'info':
        console.info(logMessage, context);
        break;
      case 'debug':
        console.debug(logMessage, context);
        break;
    }
  }

  getLogs(requestId: string): ServerLog[] {
    return this.logs.get(requestId) || [];
  }

  clearOldLogs() {
    const now = Date.now();
    for (const [requestId, logs] of this.logs.entries()) {
      if (logs.length > 0) {
        const oldestLog = logs[0];
        if (now - oldestLog.timestamp.getTime() > this.logRetentionMs) {
          this.logs.delete(requestId);
        }
      }
    }
  }

  // Create a middleware wrapper
  middleware(handler: (req: NextRequest, logger: ServerLoggerInstance) => Promise<NextResponse>) {
    return async (req: NextRequest) => {
      const requestId = req.headers.get('x-request-id') || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const logger = new ServerLoggerInstance(this, requestId);

      try {
        // Clear old logs periodically
        if (Math.random() < 0.1) { // 10% chance
          this.clearOldLogs();
        }

        const response = await handler(req, logger);
        
        // Add logs to response headers if in test mode
        if (process.env.NODE_ENV === 'test' || req.headers.get('x-debug-logs') === 'true') {
          const logs = this.getLogs(requestId);
          if (logs.length > 0) {
            response.headers.set('x-server-logs', encodeURIComponent(JSON.stringify(logs)));
          }
        }

        response.headers.set('x-request-id', requestId);
        return response;
      } catch (error) {
        logger.error('Unhandled error in request', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
  }
}

export class ServerLoggerInstance {
  constructor(
    private serverLogger: ServerLogger,
    private requestId: string
  ) {}

  error(message: string, context?: Record<string, any>) {
    this.serverLogger.log(this.requestId, 'error', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.serverLogger.log(this.requestId, 'warn', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.serverLogger.log(this.requestId, 'info', message, context);
  }

  debug(message: string, context?: Record<string, any>) {
    this.serverLogger.log(this.requestId, 'debug', message, context);
  }
}

// Export singleton instance
export const serverLogger = new ServerLogger();

// Export convenience function for wrapping API routes
export function withLogging<T extends NextRequest>(
  handler: (req: T, logger: ServerLoggerInstance) => Promise<NextResponse>
) {
  return serverLogger.middleware(handler as any);
}