import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { 
  ListResourcesResult, 
  ListToolsResult, 
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
  ListPromptsResult
} from '@modelcontextprotocol/sdk/types.js';
import { MCPConnectionError } from './mcp-error-handler';

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
  workflow?: any;
  connections?: any[];
  nodes?: any[];
}

/**
 * Singleton MCP Client with connection pooling and retry logic
 */
class MCPClient {
  private static instance: MCPClient | null = null;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private config: MCPClientConfig;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private lastConnectionTime: number = 0;
  private readonly CONNECTION_COOLDOWN = 5000; // 5 seconds between connection attempts

  private constructor(config: MCPClientConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 30000,
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
   * Connect to MCP server with retry logic and fallback
   */
  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    // Implement connection cooldown
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastConnectionTime;
    if (timeSinceLastAttempt < this.CONNECTION_COOLDOWN) {
      throw new MCPConnectionError(
        `Connection cooldown active. Please wait ${Math.ceil((this.CONNECTION_COOLDOWN - timeSinceLastAttempt) / 1000)} seconds.`,
        false
      );
    }

    this.lastConnectionTime = now;

    try {
      // First, try Streamable HTTP transport (modern)
      await this.connectStreamableHTTP();
    } catch (error) {
      console.warn('Streamable HTTP connection failed, attempting SSE fallback:', error);
      
      // Fallback to SSE transport
      try {
        await this.connectSSE();
      } catch (sseError) {
        throw new MCPConnectionError(
          'Failed to connect to MCP server with both Streamable HTTP and SSE transports',
          true
        );
      }
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

    const baseUrl = new URL(this.config.serverUrl);
    
    // Add authentication headers
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-MCP-Profile': this.config.profile,
      'Content-Type': 'application/json'
    };

    this.transport = new StreamableHTTPClientTransport(baseUrl, { headers });

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
      console.log('Connected to MCP server using Streamable HTTP transport');
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Connect using SSE transport (fallback)
   */
  private async connectSSE(): Promise<void> {
    this.client = new Client({
      name: 'n8n-workflow-builder-sse',
      version: '1.0.0'
    });

    const baseUrl = new URL(this.config.serverUrl);
    
    // SSE transport requires different setup
    const sseUrl = new URL('/sse', baseUrl);
    sseUrl.searchParams.set('apiKey', this.config.apiKey);
    sseUrl.searchParams.set('profile', this.config.profile);

    this.transport = new SSEClientTransport(sseUrl);

    // Set connection timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SSE connection timeout')), this.config.connectionTimeout);
    });

    try {
      await Promise.race([
        this.client.connect(this.transport),
        timeoutPromise
      ]);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      console.log('Connected to MCP server using SSE transport (fallback)');
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
        console.error('Error closing transport:', error);
      }
      this.transport = null;
    }
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Ensure connection is active
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect();
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
        console.error(`${operationName} failed (attempt ${attempt + 1}):`, error);
        
        if (attempt < this.config.maxRetries!) {
          // Exponential backoff
          const delay = this.config.retryDelay! * Math.pow(2, attempt);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Reset connection for next attempt
          this.cleanup();
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
    return this.executeWithRetry(
      async () => this.client!.callTool({ name, arguments: params }),
      `callTool(${name})`
    );
  }

  /**
   * Search nodes (Discovery phase)
   */
  public async searchNodes(query: string, limit?: number): Promise<CallToolResult> {
    return this.callTool('search_nodes', { query, limit });
  }

  /**
   * Get node info (Discovery phase)
   */
  public async getNodeInfo(nodeType: string): Promise<CallToolResult> {
    return this.callTool('get_node_info', { nodeType });
  }

  /**
   * List node types (Discovery phase)
   */
  public async listNodeTypes(): Promise<CallToolResult> {
    return this.callTool('list_node_types', {});
  }

  /**
   * Get node essentials (Configuration phase)
   */
  public async getNodeEssentials(nodeType: string): Promise<CallToolResult> {
    return this.callTool('get_node_essentials', { nodeType });
  }

  /**
   * Get node schema (Configuration phase)
   */
  public async getNodeSchema(nodeType: string): Promise<CallToolResult> {
    return this.callTool('get_node_schema', { nodeType });
  }

  /**
   * Validate params (Configuration phase)
   */
  public async validateParams(nodeType: string, params: any): Promise<CallToolResult> {
    return this.callTool('validate_params', { nodeType, params });
  }

  /**
   * Validate workflow (Validation phase)
   */
  public async validateWorkflow(workflow: any): Promise<CallToolResult> {
    return this.callTool('validate_workflow', { workflow });
  }

  /**
   * Check connections (Validation phase)
   */
  public async checkConnections(connections: any[]): Promise<CallToolResult> {
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
    transportType: 'streamableHTTP' | 'sse' | null;
    connectionAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      transportType: this.transport 
        ? (this.transport instanceof StreamableHTTPClientTransport ? 'streamableHTTP' : 'sse')
        : null,
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