/**
 * Tool-related Type Definitions
 * 
 * Types for Anthropic tool calling and MCP tool integration
 */

/**
 * Anthropic tool definition format
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool call from Claude
 */
export interface ToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input: any;
}

/**
 * Tool result to send back to Claude
 */
export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Tool execution response
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

/**
 * Tool executor configuration
 */
export interface ToolExecutorConfig {
  mcpClient: any; // MCPClient instance
  logger?: any; // Logger instance
}

/**
 * Available tool names by phase
 */
export type ConfigurationToolName = 
  | 'search_node_properties'
  | 'get_node_documentation'
  | 'validate_node_minimal';

export type ValidationToolName =
  | 'validate_workflow'
  | 'check_connections'
  | 'get_input_schema'
  | 'get_output_schema';

export type DiscoveryToolName =
  | 'search_nodes'
  | 'get_node_info'
  | 'list_node_types';

export type ToolName = ConfigurationToolName | ValidationToolName | DiscoveryToolName;