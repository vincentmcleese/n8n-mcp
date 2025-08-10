/**
 * MCP Tool Definitions for Claude
 * 
 * Maps MCP client methods to Anthropic tool format for Claude to call autonomously
 */

import type { ToolDefinition } from '@/types/tools';
import type { WorkflowPhase } from '@/types/workflow';

/**
 * Configuration phase tools
 */
export const CONFIGURATION_TOOLS: Record<string, ToolDefinition> = {
  search_node_properties: {
    name: 'search_node_properties',
    description: 'Search for specific properties in a node type. Use when user mentions specific features like authentication, retry, pagination, headers, or any feature not in the essentials.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to search in (e.g., HttpRequest, Postgres)'
        },
        query: {
          type: 'string', 
          description: 'Search query for the property (e.g., "authentication", "retry", "headers")'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20
        }
      },
      required: ['nodeType', 'query']
    }
  },
  
  get_node_documentation: {
    name: 'get_node_documentation',
    description: 'Get detailed documentation and usage examples for a node type. Use for complex configurations or when you need to understand patterns.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to get documentation for'
        }
      },
      required: ['nodeType']
    }
  },
  
  validate_node_minimal: {
    name: 'validate_node_minimal',
    description: 'Quick validation of node configuration to ensure it is correct before returning it.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type being validated'
        },
        config: {
          type: 'object',
          description: 'The configuration object to validate'
        }
      },
      required: ['nodeType', 'config']
    }
  }
};

/**
 * Validation phase tools
 */
export const VALIDATION_TOOLS: Record<string, ToolDefinition> = {
  validate_workflow: {
    name: 'validate_workflow',
    description: 'Validate an entire workflow for errors, missing connections, and configuration issues.',
    input_schema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'The complete workflow object to validate'
        }
      },
      required: ['workflow']
    }
  },
  
  check_connections: {
    name: 'check_connections',
    description: 'Check if workflow connections are valid and properly configured.',
    input_schema: {
      type: 'object',
      properties: {
        connections: {
          type: 'array',
          description: 'Array of connection objects to validate'
        }
      },
      required: ['connections']
    }
  },
  
  get_input_schema: {
    name: 'get_input_schema',
    description: 'Get the expected input schema for a node type to validate compatibility.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to get input schema for'
        }
      },
      required: ['nodeType']
    }
  },
  
  get_output_schema: {
    name: 'get_output_schema',
    description: 'Get the expected output schema for a node type to validate compatibility.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to get output schema for'
        }
      },
      required: ['nodeType']
    }
  }
};

/**
 * Discovery phase tools
 */
export const DISCOVERY_TOOLS: Record<string, ToolDefinition> = {
  search_nodes: {
    name: 'search_nodes',
    description: 'Search for nodes by capability or keyword. Use to find nodes that match user requirements.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for node capabilities'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 10
        }
      },
      required: ['query']
    }
  },
  
  get_node_info: {
    name: 'get_node_info',
    description: 'Get detailed information about a specific node type including its capabilities and configuration options.',
    input_schema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'The node type to get information about'
        }
      },
      required: ['nodeType']
    }
  },
  
  list_node_types: {
    name: 'list_node_types',
    description: 'List all available node types in n8n.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

/**
 * All tool definitions combined
 */
export const ALL_TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  ...CONFIGURATION_TOOLS,
  ...VALIDATION_TOOLS,
  ...DISCOVERY_TOOLS
};

/**
 * Map workflow phase to available tools
 */
export const PHASE_TOOLS: Record<WorkflowPhase, ToolDefinition[]> = {
  discovery: Object.values(DISCOVERY_TOOLS),
  configuration: Object.values(CONFIGURATION_TOOLS),
  validation: Object.values(VALIDATION_TOOLS),
  building: [], // No tools needed for building phase
  documentation: [], // No tools needed for documentation phase
  complete: [] // No tools needed for complete phase
};

/**
 * Get tool definitions for a specific phase
 */
export function getToolsForPhase(phase: WorkflowPhase): ToolDefinition[] {
  return PHASE_TOOLS[phase] || [];
}

/**
 * Get a specific tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return ALL_TOOL_DEFINITIONS[toolName];
}