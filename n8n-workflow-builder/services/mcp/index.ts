/**
 * MCP Services Index
 * 
 * Export all MCP-related services for the discovery phase optimization
 */

export { TaskService } from './task-service';
export type { 
  TaskNodeConfig, 
  FailedTaskFetch, 
  TaskNodeResult, 
  UnmatchedCapability 
} from './task-service';

export { GapSearchService } from './gap-search-service';
export type { 
  CapabilitySearchResult, 
  GapSearchResults, 
  NodeOption 
} from './gap-search-service';

// Re-export MCP client for convenience
export { MCPClient } from '@/lib/mcp-client';
export type { MCPToolParams } from '@/lib/mcp-client';