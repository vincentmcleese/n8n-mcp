/**
 * n8n Connection Type Definitions
 * 
 * Types for defining connections between n8n workflow nodes.
 */

// ==========================================
// Connection Types
// ==========================================

/**
 * Basic connection information between nodes
 */
export interface N8nConnection {
  node: string;      // Target node name (not ID)
  type: 'main';      // Connection type (always 'main' for regular connections)
  index: number;     // Input index on target node (usually 0)
}

/**
 * Connection output structure
 * Each output can connect to multiple nodes
 */
export type N8nConnectionOutput = N8nConnection[];

/**
 * Node connection structure
 * Each node can have multiple outputs (array of arrays)
 */
export interface N8nNodeConnections {
  main: N8nConnectionOutput[];
}

/**
 * Complete workflow connections mapping
 * Maps source node names to their connections
 */
export interface N8nWorkflowConnections {
  [sourceNodeName: string]: N8nNodeConnections;
}

// ==========================================
// Connection Builder Types
// ==========================================

/**
 * Simplified connection for building
 */
export interface SimpleConnection {
  source: string;      // Source node name
  sourceOutput?: number; // Source output index (default 0)
  target: string;      // Target node name
  targetInput?: number; // Target input index (default 0)
}

/**
 * Connection validation result
 */
export interface ConnectionValidation {
  valid: boolean;
  errors?: Array<{
    type: 'missing_source' | 'missing_target' | 'duplicate_connection' | 'self_connection';
    source?: string;
    target?: string;
    message: string;
  }>;
}

// ==========================================
// Connection Utility Types
// ==========================================

/**
 * Node connection info for analysis
 */
export interface NodeConnectionInfo {
  nodeName: string;
  inputs: string[];   // Names of nodes connecting TO this node
  outputs: string[];  // Names of nodes this node connects TO
  isSource: boolean;  // Has no inputs
  isSink: boolean;    // Has no outputs
}

/**
 * Workflow connection analysis
 */
export interface ConnectionAnalysis {
  nodes: Map<string, NodeConnectionInfo>;
  sources: string[];  // Nodes with no inputs
  sinks: string[];    // Nodes with no outputs
  orphans: string[];  // Nodes with no connections
  hasLoops: boolean;
  isCyclic: boolean;
}

// ==========================================
// Helper Types
// ==========================================

/**
 * Connection path for tracing execution flow
 */
export interface ConnectionPath {
  nodes: string[];
  isComplete: boolean;
  hasCycle: boolean;
}

/**
 * Connection group for organizing related nodes
 */
export interface ConnectionGroup {
  id: string;
  name: string;
  nodes: string[];
  description?: string;
}