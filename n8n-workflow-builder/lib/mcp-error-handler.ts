import type { ErrorResponse } from '@/types/workflow';

/**
 * MCP-specific error class with retry capabilities
 */
export class MCPConnectionError extends Error {
  public readonly retryable: boolean;
  public readonly retryAfter?: number;
  public readonly fallbackAction?: 'use_cache' | 'skip_step' | 'simplified_mode' | 'offline_mode';
  public readonly context?: any;

  constructor(
    message: string, 
    retryable: boolean = true,
    options?: {
      retryAfter?: number;
      fallbackAction?: 'use_cache' | 'skip_step' | 'simplified_mode' | 'offline_mode';
      context?: any;
    }
  ) {
    super(message);
    this.name = 'MCPConnectionError';
    this.retryable = retryable;
    this.retryAfter = options?.retryAfter;
    this.fallbackAction = options?.fallbackAction;
    this.context = options?.context;
  }

  /**
   * Convert to ErrorResponse format from PRD
   */
  toErrorResponse(): ErrorResponse {
    return {
      error: {
        type: 'mcp_server',
        code: 'MCP_CONNECTION_ERROR',
        message: this.message,
        userMessage: this.getUserFriendlyMessage(),
        retryable: this.retryable,
        retryAfter: this.retryAfter,
        suggestion: this.getSuggestion(),
        context: this.context
      },
      fallback: this.fallbackAction ? {
        action: this.fallbackAction,
        data: this.getFallbackData()
      } : undefined
    };
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(): string {
    if (this.message.includes('timeout')) {
      return 'Connection to n8n node server timed out. The server might be busy.';
    }
    if (this.message.includes('401') || this.message.includes('unauthorized')) {
      return 'Authentication failed. Please check your API credentials.';
    }
    if (this.message.includes('404')) {
      return 'MCP server endpoint not found. The server might be down.';
    }
    if (this.message.includes('rate limit')) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    if (this.message.includes('cooldown')) {
      return this.message; // Already user-friendly
    }
    return 'Unable to connect to n8n node server. Please try again.';
  }

  /**
   * Get suggestion for user
   */
  private getSuggestion(): string {
    if (this.message.includes('timeout')) {
      return 'Try again in a few moments or check your internet connection.';
    }
    if (this.message.includes('401') || this.message.includes('unauthorized')) {
      return 'Verify your API key and profile in the environment configuration.';
    }
    if (this.message.includes('rate limit')) {
      return `Wait ${this.retryAfter ? Math.ceil(this.retryAfter / 1000) : 60} seconds before retrying.`;
    }
    if (!this.retryable) {
      return 'This error requires manual intervention. Please check the logs.';
    }
    return 'The system will automatically retry this operation.';
  }

  /**
   * Get fallback data based on action
   */
  private getFallbackData(): any {
    switch (this.fallbackAction) {
      case 'use_cache':
        return { source: 'cache', timestamp: new Date().toISOString() };
      case 'skip_step':
        return { skipped: true, reason: this.message };
      case 'simplified_mode':
        return { mode: 'simplified', features: ['basic_nodes'] };
      case 'offline_mode':
        return { mode: 'offline', available_tools: [] };
      default:
        return null;
    }
  }
}

/**
 * MCP tool error
 */
export class MCPToolError extends Error {
  public readonly tool: string;
  public readonly params: any;

  constructor(tool: string, params: any, message: string) {
    super(message);
    this.name = 'MCPToolError';
    this.tool = tool;
    this.params = params;
  }
}

/**
 * MCP validation error
 */
export class MCPValidationError extends Error {
  public readonly field?: string;
  public readonly value?: any;
  public readonly validationErrors?: string[];

  constructor(message: string, options?: {
    field?: string;
    value?: any;
    validationErrors?: string[];
  }) {
    super(message);
    this.name = 'MCPValidationError';
    this.field = options?.field;
    this.value = options?.value;
    this.validationErrors = options?.validationErrors;
  }
}

/**
 * Connect to MCP with retry logic and exponential backoff
 */
export async function connectWithRetry(
  client: any, // MCPClient type
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await client.connect();
      return; // Success
    } catch (error) {
      lastError = error as Error;
      console.error(`MCP connection attempt ${attempt + 1} failed:`, error);
      
      // Check if error is retryable
      if (error instanceof MCPConnectionError && !error.retryable) {
        throw error; // Don't retry non-retryable errors
      }
      
      if (attempt < maxRetries - 1) {
        // Calculate delay with exponential backoff and jitter
        const baseDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
        const delay = Math.min(baseDelay + jitter, 30000); // Max 30 seconds
        
        console.log(`Retrying MCP connection in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries exhausted
  throw new MCPConnectionError(
    `Failed to connect after ${maxRetries} attempts: ${lastError?.message}`,
    false,
    { fallbackAction: 'offline_mode' }
  );
}

/**
 * Error recovery strategies
 */
export const MCPErrorRecovery = {
  /**
   * Determine recovery strategy based on error type
   */
  getRecoveryStrategy(error: Error): {
    strategy: 'retry' | 'fallback' | 'fail';
    action?: 'use_cache' | 'skip_step' | 'simplified_mode' | 'offline_mode';
    delay?: number;
  } {
    // Network errors - retry
    if (error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('EAI_AGAIN')) {
      return { strategy: 'retry', delay: 5000 };
    }
    
    // Rate limiting - retry with delay
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return { strategy: 'retry', delay: 60000 }; // 1 minute
    }
    
    // Authentication errors - fail
    if (error.message.includes('401') || error.message.includes('403')) {
      return { strategy: 'fail' };
    }
    
    // Server errors - fallback
    if (error.message.includes('500') || error.message.includes('503')) {
      return { strategy: 'fallback', action: 'use_cache' };
    }
    
    // Tool not found - skip
    if (error.message.includes('tool not found') || error.message.includes('404')) {
      return { strategy: 'fallback', action: 'skip_step' };
    }
    
    // Default - retry once
    return { strategy: 'retry', delay: 2000 };
  },

  /**
   * Create user-friendly error message
   */
  createUserMessage(error: Error): string {
    if (error instanceof MCPConnectionError) {
      return error.toErrorResponse().error.userMessage;
    }
    
    if (error instanceof MCPToolError) {
      return `Failed to execute ${error.tool} operation. Please try again.`;
    }
    
    if (error instanceof MCPValidationError) {
      return `Invalid configuration${error.field ? ` for ${error.field}` : ''}. Please check your inputs.`;
    }
    
    return 'An unexpected error occurred. Please try again.';
  },

  /**
   * Log error with context
   */
  logError(error: Error, context: {
    operation: string;
    phase?: string;
    sessionId?: string;
    [key: string]: any;
  }): void {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    };
    
    if (error instanceof MCPConnectionError) {
      errorInfo.error = {
        ...errorInfo.error,
        retryable: error.retryable,
        fallbackAction: error.fallbackAction
      } as any;
    }
    
    console.error('[MCP Error]', JSON.stringify(errorInfo, null, 2));
  }
};

/**
 * Cache manager for fallback scenarios
 */
export class MCPCacheManager {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly TTL = 3600000; // 1 hour

  /**
   * Get cached data
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set cached data
   */
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }
}