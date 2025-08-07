import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSmitheryUrl } from '@smithery/sdk/shared/config.js';
import type { 
  ListResourcesResult, 
  ListToolsResult, 
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
  ListPromptsResult
} from '@modelcontextprotocol/sdk/types.js';
import { MCPConnectionError } from './mcp-error-handler';
import { loggers } from './utils/logger';

/**
 * MCP Client configuration
 */
interface MCPClientConfig {
  serverUrl: string;
  apiKey: string;
  profile: string;
  maxRetries?: number;
  retryDelay?: number;
  connectionTimeout?: number;
}

/**
 * MCP Tool parameters based on PRD
 */
export interface MCPToolParams {
  query?: string;
  limit?: number;
  nodeType?: string;
  params?: Record<string, any>;
  config?: any;
  profile?: string;
  task?: string;
  workflow?: any;
  connections?: any[];
  nodes?: any[];
  options?: any;
  [key: string]: any; // Allow additional properties
}

/**
 * Singleton MCP Client with connection pooling and retry logic
 */
class MCPClient {
  private static instance: MCPClient | null = null;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private config: MCPClientConfig;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private lastConnectionTime: number = 0;
  private isReconnecting: boolean = false;
  private readonly CONNECTION_COOLDOWN = process.env.NODE_ENV === 'test' ? 100 : 1000; // Reduced cooldown for faster recovery
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  private constructor(config: MCPClientConfig) {
    this.config = {
      maxRetries: process.env.NODE_ENV === 'test' ? 1 : 3,
      retryDelay: process.env.NODE_ENV === 'test' ? 100 : 1000,
      connectionTimeout: process.env.NODE_ENV === 'test' ? 5000 : 30000,
      ...config
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: MCPClientConfig): MCPClient {
    if (!MCPClient.instance) {
      if (!config) {
        throw new Error('MCPClient config required for first initialization');
      }
      MCPClient.instance = new MCPClient(config);
    }
    return MCPClient.instance;
  }
  
  /**
   * Reset the singleton instance (useful for reconnection scenarios)
   */
  public static reset(): void {
    if (MCPClient.instance) {
      MCPClient.instance.cleanup();
      MCPClient.instance = null;
    }
  }

  /**
   * Connect to MCP server with retry logic
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    // Skip cooldown if this is a reconnection attempt after error
    if (!this.isReconnecting) {
      // Implement connection cooldown only for new connection attempts
      const now = Date.now();
      const timeSinceLastAttempt = now - this.lastConnectionTime;
      if (timeSinceLastAttempt < this.CONNECTION_COOLDOWN && this.connectionAttempts > 0) {
        throw new MCPConnectionError(
          `Connection cooldown active. Please wait ${Math.ceil((this.CONNECTION_COOLDOWN - timeSinceLastAttempt) / 1000)} seconds.`,
          false
        );
      }
      this.lastConnectionTime = now;
    }

    try {
      await this.connectStreamableHTTP();
    } catch (error) {
      throw new MCPConnectionError(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true
      );
    }
  }

  /**
   * Connect using Streamable HTTP transport
   */
  private async connectStreamableHTTP(): Promise<void> {
    this.client = new Client({
      name: 'n8n-workflow-builder',
      version: '1.0.0'
    });

    // Use Smithery SDK to create the URL with proper authentication
    const serverUrl = createSmitheryUrl(this.config.serverUrl, { 
      apiKey: this.config.apiKey, 
      profile: this.config.profile 
    });

    this.transport = new StreamableHTTPClientTransport(serverUrl);

    // Set connection timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout);
    });

    try {
      await Promise.race([
        this.client.connect(this.transport),
        timeoutPromise
      ]);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      loggers.mcp.info('Connected to MCP server using Streamable HTTP transport');
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }


  /**
   * Disconnect and cleanup
   */
  public async disconnect(): Promise<void> {
    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.transport) {
      try {
        this.transport.close();
      } catch (error) {
        loggers.mcp.error('Error closing transport:', error);
      }
      this.transport = null;
    }
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Ensure connection is active with reconnection support
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.isReconnecting = true;
      try {
        await this.connect();
      } finally {
        this.isReconnecting = false;
      }
    }
    
    // Verify connection is still healthy
    if (this.client && !await this.isConnectionHealthy()) {
      loggers.mcp.debug('Connection unhealthy, attempting reconnection...');
      this.cleanup();
      this.isReconnecting = true;
      try {
        await this.connect();
      } finally {
        this.isReconnecting = false;
      }
    }
  }
  
  /**
   * Check if the connection is healthy
   */
  private async isConnectionHealthy(): Promise<boolean> {
    try {
      // Quick health check - just verify the client exists and transport is open
      return this.isConnected && this.client !== null && this.transport !== null;
    } catch {
      return false;
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        await this.ensureConnected();
        return await operation();
      } catch (error) {
        lastError = error as Error;
        loggers.mcp.debug(`${operationName} failed (attempt ${attempt + 1}):`, error);
        
        if (attempt < this.config.maxRetries!) {
          // Exponential backoff
          const delay = this.config.retryDelay! * Math.pow(2, attempt);
          loggers.mcp.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Only cleanup if it's a connection error
          if (lastError.message.includes('Connection') || 
              lastError.message.toLowerCase().includes('transport') ||
              lastError.message.includes('closed')) {
            this.cleanup();
          }
        }
      }
    }
    
    throw new MCPConnectionError(
      `${operationName} failed after ${this.config.maxRetries} retries: ${lastError?.message}`,
      false
    );
  }

  // Tool methods from PRD

  /**
   * List available tools
   */
  public async listTools(): Promise<ListToolsResult> {
    return this.executeWithRetry(
      async () => this.client!.listTools(),
      'listTools'
    );
  }

  /**
   * Call a tool
   */
  public async callTool(name: string, params: MCPToolParams): Promise<CallToolResult> {
    const startTime = Date.now();
    loggers.mcp.verbose(`Calling tool: ${name} with params:`, params);
    
    try {
      const result = await this.executeWithRetry(
        async () => this.client!.callTool({ name, arguments: params as { [x: string]: unknown } }),
        `callTool(${name})`
      );
      
      const duration = Date.now() - startTime;
      
      // Extract useful info from result for INFO level logging
      let resultSummary = '';
      if (result && 'content' in result && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            
            // Tool-specific result summaries
            switch (name) {
              case 'search_nodes':
                if (Array.isArray(data)) {
                  resultSummary = ` - Found ${data.length} nodes`;
                  if (data.length > 0 && data.length <= 5) {
                    const types = data.map((n: any) => n.nodeType || n.type).join(', ');
                    resultSummary += `: ${types}`;
                  }
                }
                break;
              case 'get_node_info':
              case 'get_node_essentials':
                if (data.displayName || data.name) {
                  resultSummary = ` - ${data.displayName || data.name}`;
                }
                break;
              case 'validate_node_minimal':
              case 'validate_node_operation':
                if (data.valid !== undefined) {
                  resultSummary = data.valid ? ' - ✅ Valid' : ` - ❌ Invalid: ${data.errors?.length || 0} errors`;
                }
                break;
              case 'get_node_for_task':
                if (data.config) {
                  resultSummary = ' - ✅ Template found';
                }
                break;
              case 'validate_workflow':
                const errorCount = data.errors?.length || 0;
                const warningCount = data.warnings?.length || 0;
                if (errorCount === 0 && warningCount === 0) {
                  resultSummary = ' - ✅ Valid workflow';
                } else {
                  resultSummary = ` - ⚠️  ${errorCount} errors, ${warningCount} warnings`;
                }
                break;
            }
            
            // Log full result at verbose level
            loggers.mcp.verbose(`Result data:`, data);
          } catch (e) {
            // If not JSON, show text preview
            const preview = content.text.length > 100 
              ? content.text.substring(0, 100) + '...' 
              : content.text;
            loggers.mcp.verbose(`Result preview: ${preview}`);
          }
        }
      }
      
      loggers.mcp.info(`Tool ${name} completed in ${duration}ms${resultSummary}`);
      
      return result as CallToolResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      loggers.mcp.error(`Tool ${name} failed after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Search nodes (Discovery phase)
   */
  public async searchNodes(params: { query: string; limit?: number }): Promise<CallToolResult> {
    loggers.mcp.debug(`🔍 Searching nodes for: "${params.query}" (limit: ${params.limit || 'default'})`);
    return this.callTool('search_nodes', params);
  }

  /**
   * Get node info (Discovery phase)
   */
  public async getNodeInfo(nodeType: string): Promise<CallToolResult> {
    loggers.mcp.debug(`📖 Getting info for node type: ${nodeType}`);
    return this.callTool('get_node_info', { nodeType });
  }

  /**
   * List node types (Discovery phase)
   */
  public async listNodeTypes(): Promise<CallToolResult> {
    loggers.mcp.debug(`📋 Listing all available node types`);
    return this.callTool('list_node_types', {});
  }

  /**
   * List nodes by category (Discovery phase)
   */
  public async listNodes(params?: { category?: string; limit?: number }): Promise<CallToolResult> {
    loggers.mcp.debug(`📋 Listing nodes${params?.category ? ` in category: ${params.category}` : ''} (limit: ${params?.limit || 'default'})`);
    return this.callTool('list_nodes', params || {});
  }

  /**
   * List AI-capable tools (Discovery phase)
   */
  public async listAITools(): Promise<CallToolResult> {
    loggers.mcp.debug(`🤖 Listing AI-capable nodes`);
    return this.callTool('list_ai_tools', {});
  }

  /**
   * Get node essentials (Configuration phase)
   */
  public async getNodeEssentials(nodeType: string): Promise<CallToolResult> {
    loggers.mcp.debug(`🔧 Getting essentials for configuration: ${nodeType}`);
    return this.callTool('get_node_essentials', { nodeType });
  }

  /**
   * Get node schema (Configuration phase)
   */
  public async getNodeSchema(nodeType: string): Promise<CallToolResult> {
    loggers.mcp.debug(`📋 Getting schema for configuration: ${nodeType}`);
    return this.callTool('get_node_schema', { nodeType });
  }

  /**
   * Validate params (Configuration phase)
   */
  public async validateParams(nodeType: string, params: any): Promise<CallToolResult> {
    loggers.mcp.verbose(`✅ Validating params for ${nodeType}:`, params);
    return this.callTool('validate_node_operation', { 
      nodeType, 
      config: params,
      profile: 'ai-friendly'  // balanced validation for AI configuration
    });
  }

  /**
   * Search node properties (Configuration phase)
   */
  public async searchNodeProperties(nodeType: string, query: string, maxResults?: number): Promise<CallToolResult> {
    loggers.mcp.debug(`🔍 Searching properties for ${nodeType}: "${query}"`);
    return this.callTool('search_node_properties', { 
      nodeType, 
      query,
      maxResults: maxResults || 20
    });
  }

  /**
   * Get pre-configured node for task (Configuration phase)
   */
  public async getNodeForTask(task: string): Promise<CallToolResult> {
    loggers.mcp.debug(`📦 Getting pre-configured node for task: ${task}`);
    return this.callTool('get_node_for_task', { task });
  }

  /**
   * Get node documentation (Configuration phase)
   */
  public async getNodeDocumentation(nodeType: string): Promise<CallToolResult> {
    loggers.mcp.debug(`📚 Getting documentation for ${nodeType}`);
    return this.callTool('get_node_documentation', { nodeType });
  }

  /**
   * Validate workflow (Validation phase)
   */
  public async validateWorkflow(workflow: any): Promise<CallToolResult> {
    loggers.mcp.debug(`🔍 Validating complete workflow with ${workflow.nodes?.length || 0} nodes`);
    return this.callTool('validate_workflow', { workflow });
  }

  /**
   * Check connections (Validation phase)
   */
  public async checkConnections(connections: any[]): Promise<CallToolResult> {
    loggers.mcp.debug(`🔗 Checking ${connections.length} workflow connections`);
    return this.callTool('check_connections', { connections });
  }

  /**
   * Get input schema (Validation phase)
   */
  public async getInputSchema(nodeType: string): Promise<CallToolResult> {
    return this.callTool('get_input_schema', { nodeType });
  }

  /**
   * Get output schema (Validation phase)
   */
  public async getOutputSchema(nodeType: string): Promise<CallToolResult> {
    return this.callTool('get_output_schema', { nodeType });
  }

  /**
   * Validate node configuration - minimal check (Configuration phase)
   */
  public async validateNodeMinimal(nodeType: string, config: any): Promise<CallToolResult> {
    loggers.mcp.debug(`✅ Running minimal validation for ${nodeType}`);
    return this.callTool('validate_node_minimal', { nodeType, config });
  }

  /**
   * Validate node operation - full validation (Configuration phase)
   */
  public async validateNodeOperation(nodeType: string, config: any, profile?: string): Promise<CallToolResult> {
    loggers.mcp.debug(`✅ Running full validation for ${nodeType} with profile: ${profile || 'runtime'}`);
    return this.callTool('validate_node_operation', { 
      nodeType, 
      config, 
      profile: profile || 'runtime' 
    });
  }

  /**
   * Generate workflow (Building phase)
   */
  public async generateWorkflow(nodes: any[], connections: any[]): Promise<CallToolResult> {
    return this.callTool('generate_workflow', { nodes, connections });
  }

  /**
   * Optimize workflow (Building phase)
   */
  public async optimizeWorkflow(workflow: any): Promise<CallToolResult> {
    return this.callTool('optimize_workflow', { workflow });
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    isConnected: boolean;
    transportType: 'streamableHTTP' | null;
    connectionAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      transportType: this.transport ? 'streamableHTTP' : null,
      connectionAttempts: this.connectionAttempts
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return tools.tools.length > 0;
    } catch (error) {
      return false;
    }
  }
}

export default MCPClient;
export { MCPClient };