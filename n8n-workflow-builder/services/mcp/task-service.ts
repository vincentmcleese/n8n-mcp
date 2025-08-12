/**
 * Task Service
 * 
 * Handles fetching pre-configured task templates from n8n-mcp.
 * This service is part of the discovery phase optimization to leverage
 * pre-configured tasks instead of searching and configuring nodes from scratch.
 */

import { MCPClient } from '@/lib/mcp-client';
import { loggers } from '@/lib/utils/logger';
import { patchRegistry } from '@/lib/orchestrator/patches';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Result from fetching a single task configuration
 */
export interface TaskNodeConfig {
  taskName: string;
  nodeType: string;
  nodeId: string;
  config: any;
  purpose?: string;
  category?: string; // Node category from MCP: trigger, input, transform, output
  isPreConfigured: true;
}

/**
 * Failed task fetch result
 */
export interface FailedTaskFetch {
  taskName: string;
  reason: 'not_found' | 'mcp_error' | 'invalid_response';
  error?: any;
}

/**
 * Result from batch fetching task nodes
 */
export interface TaskNodeResult {
  successful: TaskNodeConfig[];
  failed: FailedTaskFetch[];
}

/**
 * Converted unmatched capability from failed task
 */
export interface UnmatchedCapability {
  name: string;
  description: string;
  searchTerms: string[];
  originalTaskName?: string;
}

/**
 * Task template cache entry
 */
interface CachedTaskTemplate {
  config: any;
  nodeType: string;
  category?: string;
  timestamp: number;
}

/**
 * Service for fetching and managing pre-configured task templates
 */
export class TaskService {
  private mcpClient: MCPClient;
  private logger = loggers.orchestrator; // Use orchestrator logger since discovery doesn't exist
  
  // Cache task templates for the session (15 minutes TTL)
  private taskCache: Map<string, CachedTaskTemplate> = new Map();
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  
  // Map task names to search terms for fallback
  private readonly taskFallbackMap: Record<string, string[]> = {
    // Webhooks
    'receive_webhook': ['webhook', 'http trigger', 'webhook trigger'],
    'webhook_with_response': ['webhook', 'respond', 'webhook response'],
    'webhook_with_error_handling': ['webhook', 'error', 'webhook error'],
    
    // Communication
    'send_slack_message': ['slack', 'message', 'notification'],
    'send_email': ['email', 'mail', 'smtp', 'sendgrid'],
    
    // Database
    'query_postgres': ['postgres', 'postgresql', 'sql', 'database'],
    'insert_postgres_data': ['postgres', 'insert', 'database'],
    'database_transaction_safety': ['postgres', 'transaction', 'database'],
    
    // API/HTTP
    'get_api_data': ['http', 'api', 'get', 'request'],
    'post_json_request': ['http', 'api', 'post', 'json'],
    'call_api_with_auth': ['http', 'api', 'auth', 'authenticated'],
    'api_call_with_retry': ['http', 'api', 'retry', 'resilient'],
    
    // AI/LLM
    'chat_with_ai': ['openai', 'chat', 'gpt', 'ai'],
    'ai_agent_workflow': ['agent', 'langchain', 'ai agent'],
    'multi_tool_ai_agent': ['agent', 'tools', 'langchain'],
    'ai_rate_limit_handling': ['openai', 'rate limit', 'ai'],
    
    // Data Processing
    'transform_data': ['code', 'transform', 'javascript'],
    'filter_data': ['filter', 'if', 'condition'],
    'process_webhook_data': ['code', 'webhook', 'process'],
    'fault_tolerant_processing': ['code', 'error', 'fault tolerant'],
    
    // Error Handling
    'modern_error_handling_patterns': ['error', 'onError', 'error handling'],
    
    // Tool Usage
    'use_google_sheets_as_tool': ['google sheets', 'spreadsheet', 'sheets'],
    'use_slack_as_tool': ['slack', 'tool', 'ai tool']
  };

  constructor(mcpClient?: MCPClient) {
    // Use provided client or try to get singleton instance
    if (mcpClient) {
      this.mcpClient = mcpClient;
    } else {
      try {
        this.mcpClient = MCPClient.getInstance();
      } catch (error) {
        // Running in mock mode or no MCP available
        this.mcpClient = undefined as any;
      }
    }
  }

  /**
   * Fetch multiple task nodes in batch
   * @param taskNames Array of exact task names from intent analysis
   * @returns Successful task configs and failed fetches
   */
  async fetchTaskNodes(taskNames: string[]): Promise<TaskNodeResult> {
    this.logger.info(`Fetching ${taskNames.length} task templates: ${taskNames.join(', ')}`);
    
    // If no MCP client (mock mode), return all as failed
    if (!this.mcpClient) {
      this.logger.warn('No MCP client available - running in mock mode');
      return {
        successful: [],
        failed: taskNames.map(name => ({
          taskName: name,
          reason: 'not_found' as const,
          error: 'MCP client not available (mock mode)'
        }))
      };
    }
    
    // Ensure MCP client is connected before batch operation
    try {
      const connectionStatus = this.mcpClient.getConnectionStatus();
      if (!connectionStatus.isConnected) {
        this.logger.debug('MCP client not connected, attempting to connect...');
        await this.mcpClient.connect();
      }
    } catch (error) {
      this.logger.error('Failed to establish MCP connection:', error);
      return {
        successful: [],
        failed: taskNames.map(name => ({
          taskName: name,
          reason: 'mcp_error' as const,
          error: error instanceof Error ? error.message : 'Connection failed'
        }))
      };
    }
    
    const successful: TaskNodeConfig[] = [];
    const failed: FailedTaskFetch[] = [];
    
    // Process tasks in parallel for better performance
    const fetchPromises = taskNames.map(async (taskName, index) => {
      try {
        // Check cache first
        const cached = this.getCachedTask(taskName);
        if (cached) {
          this.logger.debug(`Using cached template for task: ${taskName}`);
          successful.push({
            taskName,
            nodeType: cached.nodeType,
            nodeId: `task_node_${index + 1}`,
            config: cached.config,
            purpose: `Pre-configured task: ${taskName}`,
            category: cached.category,
            isPreConfigured: true
          });
          return;
        }
        
        // Fetch from MCP
        const result = await this.fetchSingleTask(taskName);
        
        if (result) {
          // Apply preconfiguration patches to fix known issues
          const { config: patchedConfig, patchesApplied } = 
            patchRegistry.applyPatches(result.nodeType, result.config);
          
          if (patchesApplied.length > 0) {
            this.logger.debug(`Applied patches to ${taskName}: ${patchesApplied.join(', ')}`);
          }
          
          // Cache the patched result
          this.cacheTask(taskName, result.nodeType, patchedConfig, result.category);
          
          successful.push({
            taskName,
            nodeType: result.nodeType,
            nodeId: `task_node_${index + 1}`,
            config: patchedConfig,
            category: result.category,
            purpose: result.purpose || `Pre-configured task: ${taskName}`,
            isPreConfigured: true
          });
          this.logger.info(`✅ Successfully fetched task: ${taskName} (${result.nodeType})`);
        } else {
          failed.push({ 
            taskName, 
            reason: 'not_found' 
          });
          this.logger.warn(`❌ Task not found: ${taskName}`);
        }
      } catch (error) {
        failed.push({ 
          taskName, 
          reason: 'mcp_error', 
          error: error instanceof Error ? error.message : error 
        });
        this.logger.error(`Failed to fetch task ${taskName}:`, error);
      }
    });
    
    // Wait for all fetches to complete
    await Promise.all(fetchPromises);
    
    // Log summary
    this.logger.info(
      `Task fetch complete: ${successful.length} successful, ${failed.length} failed`
    );
    
    if (failed.length > 0) {
      this.logger.warn('Failed tasks will be converted to search gaps:', 
        failed.map(f => `${f.taskName} (${f.reason})`).join(', ')
      );
    }
    
    return { successful, failed };
  }

  /**
   * Fetch a single task configuration from MCP
   */
  private async fetchSingleTask(taskName: string): Promise<{
    nodeType: string;
    config: any;
    purpose?: string;
    category?: string;
  } | null> {
    if (!this.mcpClient) {
      this.logger.warn(`MCP client not available for fetching task: ${taskName}`);
      return null;
    }
    
    try {
      // Ensure MCP client is connected before operation
      const connectionStatus = this.mcpClient.getConnectionStatus();
      if (!connectionStatus.isConnected) {
        this.logger.debug(`MCP client not connected, attempting to connect...`);
        await this.mcpClient.connect();
      }
      
      const result = await this.mcpClient.getNodeForTask(taskName);
      
      // Parse the result
      if (result && result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          
          // Validate the response has required fields
          // MCP returns "configuration" not "config"
          if ((data.configuration || data.config) && data.nodeType) {
            // LOG WHAT MCP RETURNS
            this.logger.info(
              `📡 MCP task response for ${taskName}: nodeType=${data.nodeType}, category=${data.category || 'NOT PROVIDED'}`
            );
            return {
              nodeType: data.nodeType,
              config: data.configuration || data.config,
              purpose: data.description,
              category: data.category
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error fetching task ${taskName}:`, error);
      throw error;
    }
  }

  /**
   * Convert failed tasks to unmatched capabilities for gap searching
   */
  convertFailedTasksToCapabilities(failed: FailedTaskFetch[]): UnmatchedCapability[] {
    return failed.map(f => ({
      name: this.taskNameToCapabilityName(f.taskName),
      description: `Task template '${f.taskName}' was not found or failed to load`,
      searchTerms: this.taskFallbackMap[f.taskName] || [f.taskName.replace(/_/g, ' ')],
      originalTaskName: f.taskName
    }));
  }

  /**
   * Convert task name to capability name for searching
   */
  private taskNameToCapabilityName(taskName: string): string {
    // Convert snake_case to readable format
    return taskName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get cached task if still valid
   */
  private getCachedTask(taskName: string): CachedTaskTemplate | null {
    const cached = this.taskCache.get(taskName);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.CACHE_TTL) {
        return cached;
      } else {
        // Remove expired cache entry
        this.taskCache.delete(taskName);
      }
    }
    
    return null;
  }

  /**
   * Cache a task template
   */
  private cacheTask(taskName: string, nodeType: string, config: any, category?: string): void {
    this.taskCache.set(taskName, {
      config,
      nodeType,
      category,
      timestamp: Date.now()
    });
  }

  /**
   * Clear the task cache
   */
  clearCache(): void {
    this.taskCache.clear();
    this.logger.debug('Task template cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    tasks: string[];
  } {
    return {
      size: this.taskCache.size,
      tasks: Array.from(this.taskCache.keys())
    };
  }

  /**
   * Validate task names against known tasks
   * Useful for checking intent analysis output
   */
  validateTaskNames(taskNames: string[]): {
    valid: string[];
    invalid: string[];
  } {
    const knownTasks = Object.keys(this.taskFallbackMap);
    
    const valid = taskNames.filter(name => knownTasks.includes(name));
    const invalid = taskNames.filter(name => !knownTasks.includes(name));
    
    if (invalid.length > 0) {
      this.logger.warn(`Unknown task names detected: ${invalid.join(', ')}`);
    }
    
    return { valid, invalid };
  }

  /**
   * Get all known task names
   */
  getKnownTaskNames(): string[] {
    return Object.keys(this.taskFallbackMap);
  }
}