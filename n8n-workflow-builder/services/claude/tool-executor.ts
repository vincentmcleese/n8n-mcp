/**
 * Tool Executor for Claude
 * 
 * Executes tool calls from Claude by mapping them to MCP client methods.
 * Handles errors gracefully and provides comprehensive logging.
 */

import type { MCPClient } from '@/lib/mcp-client';
import type { ToolCall, ToolResult, ToolExecutionResult } from '@/types/tools';
import { loggers } from '@/lib/utils/logger';

export class ToolExecutor {
  private logger = loggers.tools || loggers.claude; // Use tools logger if available, fallback to claude
  
  constructor(private mcpClient: MCPClient) {}
  
  /**
   * Execute a tool call from Claude
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const { name, input, id } = toolCall;
    const startTime = Date.now();
    
    this.logger.info(`🔧 Tool called: ${name}`, { input });
    
    try {
      const result = await this.executeToolByName(name, input);
      const duration = Date.now() - startTime;
      
      this.logger.info(`✅ Tool ${name} completed in ${duration}ms`);
      
      // Return in format Claude expects
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: this.formatResult(result)
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Tool ${name} failed after ${duration}ms:`, error);
      
      // Return error in format Claude can understand
      return {
        type: 'tool_result',
        tool_use_id: id,
        is_error: true,
        content: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  /**
   * Execute multiple tool calls in parallel
   */
  async executeMultiple(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    this.logger.info(`🔧 Executing ${toolCalls.length} tools in parallel`);
    
    const promises = toolCalls.map(toolCall => this.execute(toolCall));
    const results = await Promise.all(promises);
    
    return results;
  }
  
  /**
   * Map tool name to MCP client method and execute
   */
  private async executeToolByName(name: string, input: any): Promise<any> {
    // Configuration tools
    switch(name) {
      case 'search_node_properties':
        return await this.mcpClient.searchNodeProperties(
          input.nodeType,
          input.query,
          input.maxResults || 20
        );
      
      case 'get_node_documentation':
        return await this.mcpClient.getNodeDocumentation(input.nodeType);
      
      case 'validate_node_minimal':
        return await this.mcpClient.validateNodeMinimal(
          input.nodeType,
          input.config
        );
      
      // Validation tools
      case 'validate_workflow':
        return await this.mcpClient.validateWorkflow(input.workflow);
      
      case 'check_connections':
        return await this.mcpClient.checkConnections(input.connections);
      
      case 'get_input_schema':
        return await this.mcpClient.getInputSchema(input.nodeType);
      
      case 'get_output_schema':
        return await this.mcpClient.getOutputSchema(input.nodeType);
      
      // Discovery tools
      case 'search_nodes':
        return await this.mcpClient.searchNodes({
          query: input.query,
          limit: input.limit || 10
        });
      
      case 'get_node_info':
        return await this.mcpClient.getNodeInfo(input.nodeType);
      
      case 'list_node_types':
        return await this.mcpClient.listNodeTypes();
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  
  /**
   * Format the result for Claude
   */
  private formatResult(result: any): string {
    // If result is already a string, return it
    if (typeof result === 'string') {
      return result;
    }
    
    // If result has content property (MCP response format), extract it
    if (result?.content) {
      // MCP returns content array with text objects
      if (Array.isArray(result.content)) {
        const textContent = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        
        // Try to parse as JSON if it looks like JSON
        if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
          try {
            return textContent; // Return raw JSON string for Claude to parse
          } catch {
            return textContent;
          }
        }
        
        return textContent;
      }
      
      // Single content item
      if (result.content.type === 'text') {
        return result.content.text;
      }
    }
    
    // Otherwise, stringify the result
    return JSON.stringify(result, null, 2);
  }
  
  /**
   * Check if MCP client is available and connected
   */
  async ensureConnected(): Promise<boolean> {
    try {
      const status = this.mcpClient.getConnectionStatus();
      if (!status.isConnected) {
        this.logger.debug('MCP client not connected, attempting to connect...');
        await this.mcpClient.connect();
        return true;
      }
      return true;
    } catch (error) {
      this.logger.error('Failed to ensure MCP connection:', error);
      return false;
    }
  }
}