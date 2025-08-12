/**
 * Anthropic Client Wrapper
 * 
 * Provides a robust wrapper around the Anthropic SDK with:
 * - Automatic retry logic for transient failures
 * - Token usage tracking
 * - Structured error handling
 * - Request/response logging
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { 
  RETRY_CONFIG, 
  API_CONFIG, 
  LOGGING,
  getModel,
  TEMPERATURE 
} from "./constants";
import { loggers } from "@/lib/utils/logger";
import type { ToolDefinition, ToolCall, ToolResult } from "@/types/tools";
import { ToolExecutor } from "./tool-executor";
import type { MCPClient } from "@/lib/mcp-client";

// ==========================================
// Type Definitions
// ==========================================

export interface CompletionParams {
  systemPrompt: string;
  userMessage: string;
  prefill?: string;
  maxTokens: number;
  temperature?: number;
  model?: string;
  phase?: string; // For logging context
  tools?: ToolDefinition[]; // Optional tools for Claude to use
}

export interface CompletionResult {
  content: string;
  fullContent: string; // prefill + content
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    wasTruncated?: boolean;
    usagePercentage?: number;
  };
}

export interface ClientConfig {
  apiKey?: string;
  onUsageCallback?: (tokens: number) => void;
  baseURL?: string;
  timeout?: number;
  mcpClient?: MCPClient; // Optional MCP client for tool execution
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ==========================================
// Anthropic Client Implementation
// ==========================================

export class AnthropicClient {
  private client: Anthropic;
  private onUsageCallback?: (tokens: number) => void;
  private toolExecutor?: ToolExecutor;
  private currentPhase?: string;
  private currentMethod?: string;

  constructor(config: ClientConfig = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError("ANTHROPIC_API_KEY is not configured", undefined, 'missing_api_key');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseURL || API_CONFIG.baseURL,
      timeout: config.timeout || API_CONFIG.timeout,
      defaultHeaders: API_CONFIG.defaultHeaders,
    });

    this.onUsageCallback = config.onUsageCallback;
    
    // Initialize tool executor if MCP client is provided
    if (config.mcpClient) {
      this.toolExecutor = new ToolExecutor(config.mcpClient);
    }
  }
  
  /**
   * Set or update the tool executor
   */
  setToolExecutor(toolExecutor: ToolExecutor): void {
    this.toolExecutor = toolExecutor;
  }

  /**
   * Set or update the token usage callback
   */
  setOnUsageCallback(callback: (tokens: number) => void): void {
    this.onUsageCallback = callback;
  }

  /**
   * Set the current phase and method context for logging
   */
  setContext(phase: string, method?: string): void {
    this.currentPhase = phase;
    this.currentMethod = method;
  }

  /**
   * Complete a JSON generation request with automatic retry logic
   */
  async completeJSON(params: CompletionParams): Promise<CompletionResult> {
    // Set context if phase is provided
    if (params.phase) {
      this.currentPhase = params.phase;
    }
    
    // If tools are provided and we have a tool executor, use enhanced flow
    if (params.tools && params.tools.length > 0 && this.toolExecutor) {
      return this.completeJSONWithTools(params);
    }
    
    // Otherwise use the basic flow (existing implementation)
    return this.completeJSONBasic(params);
  }
  
  /**
   * Complete JSON with tool calling support
   */
  private async completeJSONWithTools(params: CompletionParams): Promise<CompletionResult> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: params.userMessage }
    ];
    
    // Add prefill if provided
    if (params.prefill) {
      messages.push({ role: "assistant", content: params.prefill });
    }
    
    // Make the request with tools
    const response = await this.makeRequestWithTools(params, messages);
    
    // Handle the response (may involve tool calls)
    return this.handleToolResponse(response, messages, params);
  }
  
  /**
   * Handle response that may contain tool use
   */
  private async handleToolResponse(
    response: any,
    messages: Anthropic.MessageParam[],
    params: CompletionParams
  ): Promise<CompletionResult> {
    // Check if Claude wants to use tools
    if (response.stop_reason === 'tool_use') {
      // Extract tool calls
      const toolCalls = response.content.filter((c: any) => c.type === 'tool_use') as ToolCall[];
      
      if (toolCalls.length > 0) {
        loggers.claude.info(`🔧 Claude requesting ${toolCalls.length} tool(s):`, 
          toolCalls.map(t => t.name)
        );
        
        // Execute tools
        const toolResults = await this.toolExecutor!.executeMultiple(toolCalls);
        
        // Add Claude's response (with tool calls) to messages
        messages.push({ role: 'assistant', content: response.content });
        
        // Add tool results to messages
        messages.push({ role: 'user', content: toolResults as any });
        
        // Continue conversation with tool results
        const nextResponse = await this.client.messages.create({
          model: params.model || getModel(),
          max_tokens: params.maxTokens,
          temperature: params.temperature ?? TEMPERATURE.default,
          messages,
          system: params.systemPrompt,
          tools: params.tools as any,
          tool_choice: { type: 'auto' } // Correct format for tool_choice
        });
        
        // Recursively handle (in case Claude needs more tools)
        return this.handleToolResponse(nextResponse, messages, params);
      }
    }
    
    // Extract text content from response
    const content = response.content[0].type === "text" 
      ? response.content[0].text 
      : "";
    
    // Track token usage
    const usage = this.trackTokenUsage(response, params.maxTokens);
    
    // Combine prefill with response for full content
    const fullContent = params.prefill ? params.prefill + content : content;
    
    return {
      content,
      fullContent,
      usage
    };
  }
  
  /**
   * Make request with tools
   */
  private async makeRequestWithTools(
    params: CompletionParams,
    messages: Anthropic.MessageParam[]
  ): Promise<any> {
    const model = params.model || getModel();
    const temperature = params.temperature ?? TEMPERATURE.default;
    
    return await this.client.messages.create({
      model,
      max_tokens: params.maxTokens,
      temperature,
      messages,
      system: params.systemPrompt,
      tools: params.tools as any,
      tool_choice: { type: 'auto' } // Correct format for tool_choice
    });
  }
  
  /**
   * Original completeJSON implementation (without tools)
   */
  private async completeJSONBasic(params: CompletionParams): Promise<CompletionResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    
    // Log the request if debugging is enabled
    if (LOGGING.logPrompts) {
      loggers.claude.debug(`[${params.phase || 'unknown'}] Starting completion request`);
      loggers.claude.verbose('System prompt preview:', params.systemPrompt.substring(0, 200));
      loggers.claude.verbose('User message preview:', params.userMessage.substring(0, 200));
    }

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        const result = await this.makeRequest(params);
        
        // Log success
        const duration = Date.now() - startTime;
        loggers.claude.info(
          `[${params.phase || 'unknown'}] Completion successful in ${duration}ms (attempt ${attempt}/${RETRY_CONFIG.maxAttempts})`
        );
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === RETRY_CONFIG.maxAttempts) {
          throw this.wrapError(error, params.phase);
        }
        
        // Calculate delay with exponential backoff
        const delay = this.calculateBackoffDelay(attempt);
        loggers.claude.warn(
          `[${params.phase || 'unknown'}] Attempt ${attempt} failed, retrying in ${delay}ms...`,
          error instanceof Error ? error.message : String(error)
        );
        
        // Wait before retrying
        await this.sleep(delay);
      }
    }
    
    // This should never be reached due to the throw in the loop, but TypeScript needs it
    throw this.wrapError(lastError, params.phase);
  }

  /**
   * Make a single request to the Anthropic API
   */
  private async makeRequest(params: CompletionParams): Promise<CompletionResult> {
    const model = params.model || getModel();
    const temperature = params.temperature ?? TEMPERATURE.default;
    
    // Build messages array
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: params.userMessage }
    ];
    
    // Add prefill if provided
    if (params.prefill) {
      messages.push({ role: "assistant", content: params.prefill });
    }
    
    // Make the API call
    const response = await this.client.messages.create({
      model,
      max_tokens: params.maxTokens,
      temperature,
      messages,
      system: params.systemPrompt,
    });
    
    // Extract the text content
    const content = response.content[0].type === "text" 
      ? response.content[0].text 
      : "";
    
    // Track token usage
    const usage = this.trackTokenUsage(response, params.maxTokens);
    
    // Combine prefill with response for full content
    const fullContent = params.prefill ? params.prefill + content : content;
    
    // Log response if verbose mode is enabled
    if (LOGGING.logFullResponses) {
      loggers.claude.verbose(
        'Full response:', 
        fullContent.substring(0, LOGGING.maxResponseLogLength)
      );
    }
    
    return {
      content,
      fullContent,
      usage,
    };
  }

  /**
   * Track token usage from Anthropic response
   */
  private trackTokenUsage(response: any, maxTokens?: number): CompletionResult['usage'] | undefined {
    if (!response.usage) return undefined;

    const promptTokens = response.usage.input_tokens || 0;
    const completionTokens = response.usage.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    
    // Check if response was truncated
    const wasTruncated = maxTokens ? completionTokens >= maxTokens : false;
    
    // Calculate usage percentage
    const usagePercentage = maxTokens ? (completionTokens / maxTokens * 100) : 0;
    
    const usage = {
      promptTokens,
      completionTokens,
      totalTokens,
      wasTruncated,
      usagePercentage,
    };

    // Get context for logging
    const phase = this.currentPhase || 'unknown';
    const method = this.currentMethod || 'request';
    
    // Enhanced logging at INFO level with context
    if (maxTokens) {
      // Log at INFO level with limit context
      loggers.claude.info(
        `[${phase}] ${method}: ${totalTokens} tokens (${promptTokens} in + ${completionTokens} out) of ${maxTokens} limit [${usagePercentage.toFixed(0)}%]`
      );
      
      // Add warnings based on usage
      if (wasTruncated) {
        loggers.claude.error(
          `🚨 TOKEN LIMIT EXCEEDED - Response truncated! Output tokens (${completionTokens}) = max_tokens limit (${maxTokens})`
        );
        loggers.claude.error(`🔴 CRITICAL: Response likely incomplete - attempting recovery`);
      } else if (usagePercentage >= 90) {
        loggers.claude.warn(`⚠️ VERY HIGH TOKEN USAGE - ${usagePercentage.toFixed(0)}% of limit used`);
      } else if (usagePercentage >= 80) {
        loggers.claude.warn(`⚠️ HIGH TOKEN USAGE - Approaching limit`);
      }
    } else {
      // Fallback to simple INFO logging
      loggers.claude.info(
        `[${phase}] ${method}: ${totalTokens} tokens (${promptTokens} in + ${completionTokens} out)`
      );
    }

    // Call the callback if set
    if (this.onUsageCallback) {
      this.onUsageCallback(totalTokens);
    }

    return usage;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Check for rate limit errors
    if (error?.status && RETRY_CONFIG.retryableStatuses.includes(error.status)) {
      return true;
    }
    
    // Check for specific error codes
    if (error?.error?.type && RETRY_CONFIG.retryableErrorCodes.includes(error.error.type)) {
      return true;
    }
    
    // Check for network errors
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate backoff delay for retry attempts
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
      RETRY_CONFIG.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Wrap errors with additional context
   */
  private wrapError(error: any, phase?: string): ProviderError {
    const phaseContext = phase ? `[${phase}] ` : '';
    
    if (error instanceof ProviderError) {
      return error;
    }
    
    if (error?.status === 429) {
      return new ProviderError(
        `${phaseContext}Rate limit exceeded. Please try again later.`,
        429,
        'rate_limit_error',
        true
      );
    }
    
    if (error?.status >= 500) {
      return new ProviderError(
        `${phaseContext}Anthropic service error: ${error.message || 'Unknown error'}`,
        error.status,
        'server_error',
        true
      );
    }
    
    if (error?.status === 401) {
      return new ProviderError(
        `${phaseContext}Invalid API key. Please check your ANTHROPIC_API_KEY.`,
        401,
        'auth_error',
        false
      );
    }
    
    if (error?.status === 400) {
      return new ProviderError(
        `${phaseContext}Invalid request: ${error.message || 'Bad request'}`,
        400,
        'validation_error',
        false
      );
    }
    
    // Generic error
    return new ProviderError(
      `${phaseContext}${error?.message || 'Unknown error occurred'}`,
      undefined,
      'unknown_error',
      false
    );
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check to verify the client is properly configured
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.completeJSON({
        systemPrompt: "You are a helpful assistant. Respond with a simple JSON object.",
        userMessage: "Return {\"status\": \"ok\"}",
        prefill: "{\"status\":\"",
        maxTokens: 10,
        phase: "health_check"
      });
      
      return result.fullContent.includes('"ok"');
    } catch (error) {
      loggers.claude.error('Health check failed:', error);
      return false;
    }
  }
}