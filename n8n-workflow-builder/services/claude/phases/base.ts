/**
 * Base Phase Service
 * 
 * Abstract base class for all phase services providing common functionality
 * like client management, token tracking, and error handling.
 */

import { AnthropicClient, type CompletionParams, type CompletionResult } from '../client';
import { parseWithPrefill, type ParseResult } from '../parsing/json-prefill';
import { type PromptParts } from '../prompts/common';
import { loggers } from '@/lib/utils/logger';
import { z } from 'zod';
import type { ToolDefinition } from '@/types/tools';
import type { MCPClient } from '@/lib/mcp-client';
import { ToolExecutor } from '../tool-executor';

// ==========================================
// Type Definitions
// ==========================================

export interface PhaseServiceConfig {
  client?: AnthropicClient;
  onTokenUsage?: (tokens: number) => void;
  logger?: typeof loggers.claude;
  mcpClient?: MCPClient; // Optional MCP client for tool execution
}

export interface PhaseContext {
  sessionId: string;
  userIntent: string;
  [key: string]: any;
}

export interface PhaseResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    wasTruncated?: boolean;
    usagePercentage?: number;
  };
  reasoning?: string[];
  raw?: any; // Raw response for debugging
}

// ==========================================
// Abstract Base Class
// ==========================================

export abstract class BasePhaseService<TInput = any, TOutput = any> {
  protected client: AnthropicClient;
  protected logger: typeof loggers.claude;
  protected toolExecutor?: ToolExecutor;
  private tokenUsageCallback?: (tokens: number) => void;

  constructor(config: PhaseServiceConfig = {}) {
    this.client = config.client || new AnthropicClient({ mcpClient: config.mcpClient });
    this.logger = config.logger || loggers.claude;
    this.tokenUsageCallback = config.onTokenUsage;
    
    // Set token usage callback on client if provided
    if (this.tokenUsageCallback) {
      this.client.setOnUsageCallback(this.tokenUsageCallback);
    }
    
    // Initialize tool executor if MCP client is provided
    if (config.mcpClient) {
      this.toolExecutor = new ToolExecutor(config.mcpClient);
      this.client.setToolExecutor(this.toolExecutor);
    }
  }

  /**
   * Abstract method that must be implemented by each phase
   */
  abstract execute(input: TInput, context: PhaseContext): Promise<PhaseResult<TOutput>>;

  /**
   * Get the phase name for logging
   */
  abstract get phaseName(): string;

  /**
   * Set or update the token usage callback
   */
  setOnUsageCallback(callback: (tokens: number) => void): void {
    this.tokenUsageCallback = callback;
    this.client.setOnUsageCallback(callback);
  }

  /**
   * Common method to call Claude and parse the response
   */
  protected async callClaude<T = any>(
    prompt: PromptParts,
    maxTokens: number,
    schema?: z.ZodSchema<T>,
    methodName?: string,
    tools?: ToolDefinition[]
  ): Promise<PhaseResult<T>> {
    try {
      // Log the phase and method
      this.logger.debug(`[${this.phaseName}] ${methodName || 'Calling Claude'}`);
      
      // Set context in client for enhanced logging
      this.client.setContext(this.phaseName, methodName);
      
      // Make the completion request
      const completionParams: CompletionParams = {
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        prefill: prompt.prefill,
        maxTokens,
        phase: this.phaseName,
        tools, // Pass tools if provided
      };
      
      const completion = await this.client.completeJSON(completionParams);
      
      // Check if response was truncated
      if (completion.usage?.wasTruncated) {
        this.logger.warn(`[${this.phaseName}] Response was truncated for ${methodName} - recovery may be needed`);
      }
      
      // Parse the response
      const parseResult = this.parseResponse<T>(
        completion,
        prompt.prefill,
        schema,
        methodName
      );
      
      if (!parseResult.success) {
        // Log the parsing error details
        this.logger.error(`[${this.phaseName}] Failed to parse response for ${methodName}`, {
          error: parseResult.error?.message,
          raw: parseResult.raw,
          methodName,
          phase: this.phaseName
        });
        return {
          success: false,
          error: new Error(parseResult.error?.message || 'Failed to parse response'),
          usage: completion.usage,
          raw: parseResult.raw, // Include raw response for debugging
        };
      }
      
      // Extract reasoning if present
      const reasoning = this.extractReasoning(parseResult.data);
      
      // Log reasoning at debug level to avoid clutter in parallel execution
      if (reasoning && reasoning.length > 0) {
        this.logger.debug(`[${this.phaseName}] Reasoning:`);
        reasoning.forEach((reason, index) => {
          const truncated = reason.length > 200 ? reason.substring(0, 200) + '...' : reason;
          this.logger.debug(`   ${index + 1}. ${truncated}`);
        });
      }
      
      return {
        success: true,
        data: parseResult.data,
        usage: completion.usage,
        reasoning,
      };
    } catch (error) {
      this.logger.error(`[${this.phaseName}] Error in ${methodName || 'phase'}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Parse Claude's response with error handling
   */
  protected parseResponse<T = any>(
    completion: CompletionResult,
    prefill?: string,
    schema?: z.ZodSchema<T>,
    methodName?: string
  ): ParseResult<T> {
    // Use the parsing utility
    return parseWithPrefill<T>(
      prefill || '',
      completion.content,
      {
        attemptRecovery: true,
        schema,
        methodName: `${this.phaseName}.${methodName || 'parse'}`,
      }
    );
  }

  /**
   * Extract reasoning array from response data
   */
  protected extractReasoning(data: any): string[] | undefined {
    if (!data) return undefined;
    
    // Check for reasoning property
    if (Array.isArray(data.reasoning)) {
      return data.reasoning;
    }
    
    // Check for nested reasoning in operations
    if (Array.isArray(data.operations)) {
      const reasoning: string[] = [];
      data.operations.forEach((op: any, index: number) => {
        if (op.reasoning) {
          reasoning.push(op.reasoning);
        } else {
          // Generate default reasoning based on operation type
          reasoning.push(this.generateDefaultReasoning(op, index));
        }
      });
      return reasoning.length > 0 ? reasoning : undefined;
    }
    
    return undefined;
  }

  /**
   * Generate default reasoning for an operation
   */
  protected generateDefaultReasoning(operation: any, index: number): string {
    const type = operation.type || 'unknown';
    
    switch (type) {
      case 'discoverNode':
        return `Discovered ${operation.node?.type || 'node'} for ${operation.node?.purpose || 'workflow'}`;
      case 'selectNode':
        return `Selected node ${operation.nodeId || index}`;
      case 'configureNode':
        return `Configured node ${operation.nodeId || index}`;
      case 'addConnection':
        return `Connected ${operation.from || 'source'} to ${operation.to || 'target'}`;
      case 'addStickyNote':
        return `Added documentation for workflow section`;
      case 'requestClarification':
        return `Requested clarification: ${operation.question || 'additional information needed'}`;
      default:
        return `Performed ${type} operation`;
    }
  }

  /**
   * Log a successful operation
   */
  protected logSuccess(operation: string, details?: any): void {
    // Create a summary string for INFO level
    let summary = `   ✓ ${operation} completed`;
    
    if (details) {
      // Add key details to the INFO message
      const detailParts: string[] = [];
      
      if (details.searchTerms && Array.isArray(details.searchTerms)) {
        detailParts.push(`${details.searchTerms.length} search terms`);
      }
      if (details.recommendations !== undefined) {
        detailParts.push(`${details.recommendations} recommendations`);
      }
      if (details.nodeType) {
        detailParts.push(`node: ${details.nodeType}`);
      }
      if (details.operations !== undefined) {
        detailParts.push(`${details.operations} operations`);
      }
      if (details.discovered !== undefined) {
        detailParts.push(`${details.discovered} discovered`);
      }
      if (details.selected !== undefined) {
        detailParts.push(`${details.selected} selected`);
      }
      if (details.errorsFixed !== undefined) {
        detailParts.push(`${details.errorsFixed} errors fixed`);
      }
      
      if (detailParts.length > 0 && this.phaseName === 'configuration') {
        // Show details for configuration phase at INFO level
        summary += ` (${detailParts.join(', ')})`;
      }
      
      // Log full details at debug level
      this.logger.debug(`[${this.phaseName}] Full details:`, details);
    }
    
    // Log at debug level to avoid clutter
    this.logger.debug(`[${this.phaseName}] ${operation} completed`, details);
  }

  /**
   * Log an error
   */
  protected logError(operation: string, error: any): void {
    this.logger.error(`[${this.phaseName}] ${operation} failed:`, error);
  }

  /**
   * Log a warning
   */
  protected logWarning(operation: string, message: string): void {
    this.logger.warn(`[${this.phaseName}] ${operation}: ${message}`);
  }

  /**
   * Attach reasoning to operations for chronological narrative
   * (Extracted from original claude-service.ts)
   */
  protected attachReasoningToOperations(
    operations: any[],
    reasoning: string[]
  ): any[] {
    return operations.map((operation, index) => {
      // Attach reasoning if available
      const reasoningText =
        reasoning[index] ||
        reasoning[Math.floor(index / 2)] ||
        reasoning[0] ||
        this.generateDefaultReasoning(operation, index);

      return {
        ...operation,
        reasoning: reasoningText,
        operationIndex: index,
      };
    });
  }

  /**
   * Validate input data
   */
  protected validateInput<T>(input: any, schema: z.ZodSchema<T>): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new Error(`Invalid input for ${this.phaseName}: ${result.error.message}`);
    }
    return result.data;
  }

  /**
   * Check if the service is properly configured
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.healthCheck();
      this.logger.info(`[${this.phaseName}] Health check: ${result ? 'OK' : 'FAILED'}`);
      return result;
    } catch (error) {
      this.logger.error(`[${this.phaseName}] Health check failed:`, error);
      return false;
    }
  }
}