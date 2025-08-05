// types/workflow.ts

// ==========================================
// Core Types
// ==========================================

/**
 * Represents a node in the n8n workflow
 */
export interface WorkflowNode {
  id: string;
  type: string;
  position: [number, number];
  parameters: Record<string, any>; // Flexible for MCP integration
}

/**
 * Represents a connection between two nodes
 */
export interface WorkflowConnection {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

/**
 * Workflow-level settings and metadata
 */
export interface WorkflowSettings {
  name: string;
  executionOrder?: string;
  timezone?: string;
  saveDataSuccessExecution?: boolean;
}

/**
 * Workflow phase states
 */
export type WorkflowPhase = 
  | 'discovery' 
  | 'configuration' 
  | 'validation' 
  | 'building' 
  | 'documentation'
  | 'complete';

// ==========================================
// State Types
// ==========================================

/**
 * Server-side workflow session state (canonical)
 */
export interface WorkflowSession {
  sessionId: string;
  createdAt: Date;
  state: {
    phase: WorkflowPhase;
    userPrompt: string;
    discovered: DiscoveredNode[];
    selected: string[];
    configured: Map<string, NodeConfiguration>;
    validated: Map<string, ValidationResult>;
    workflow: {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
      settings: WorkflowSettings;
    };
    operationHistory: WorkflowOperation[];
    pendingClarifications: ClarificationRequest[];
    clarificationHistory: ClarificationResponse[];
  };
}

/**
 * Client-side UI state (minimal)
 */
export interface ClientWorkflowState {
  sessionId: string;
  currentPhase: WorkflowPhase;
  selectedNodeId?: string;
  expandedSections: string[];
  pendingOperations: WorkflowOperation[];
  lastServerUpdate: {
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: ValidationError[];
  };
}

// ==========================================
// Operation Types (Delta Architecture)
// ==========================================

/**
 * All possible workflow operations for delta-based updates
 */
/**
 * Base operation type with narrative fields
 */
export interface BaseOperation {
  timestamp?: string;     // When the operation occurred
  reasoning?: string;     // Why this operation was performed
  operationIndex?: number; // Index in the operation sequence
}

export type WorkflowOperation = BaseOperation & (
  // Discovery phase operations
  | { type: 'discoverNode'; node: { id: string; type: string; purpose: string } }
  | { type: 'selectNode'; nodeId: string }
  | { type: 'deselectNode'; nodeId: string }
  | { type: 'requestClarification'; questionId: string; question: string; context: any }
  | { type: 'clarificationResponse'; questionId: string; response: string }
  
  // Configuration phase operations
  | { type: 'configureNode'; nodeId: string; nodeType: string; purpose: string; config: any } // Enhanced with metadata
  | { type: 'updateNodeConfig'; nodeId: string; path: string; value: any }
  
  // Validation phase operations
  | { type: 'validateNode'; nodeId: string; result: ValidationResult }
  | { type: 'addValidationError'; nodeId: string; error: ValidationError }
  
  // Building phase operations
  | { type: 'addToWorkflow'; nodeId: string; position: [number, number] }
  | { type: 'addConnection'; source: string; target: string }
  | { type: 'updateWorkflowSettings'; settings: Partial<WorkflowSettings> }
  | { type: 'setWorkflow'; workflow: { nodes: any[]; connections: any; settings: any } }
  
  // Documentation phase operations
  | { type: 'addStickyNote'; note: StickyNote }
  
  // Phase transition operations
  | { type: 'setPhase'; phase: WorkflowPhase }
  | { type: 'completePhase'; phase: WorkflowPhase }
);

// ==========================================
// Supporting Types
// ==========================================

/**
 * A discovered node suggestion from Claude/MCP
 */
export interface DiscoveredNode {
  id: string;
  type: string;
  purpose: string;
  displayName?: string;
  description?: string;
  category?: string;
}

/**
 * Sticky note for workflow documentation
 */
export interface StickyNote {
  id: string;
  content: string;
  nodeGroupIds: string[];  // IDs of nodes this note documents
  color?: number;          // 1-7 for different colors in n8n
}

/**
 * Node configuration with parameters
 */
export interface NodeConfiguration {
  nodeId: string;
  nodeType: string;
  parameters: Record<string, any>; // Flexible for MCP integration
}

/**
 * Validation result for a node
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  nodeId: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Clarification request from Claude
 */
export interface ClarificationRequest {
  questionId: string;
  question: string;
  context: any; // Flexible context for different scenarios
  timestamp: Date;
}

/**
 * User's response to clarification
 */
export interface ClarificationResponse {
  questionId: string;
  question: string;
  response: string;
  timestamp: Date;
}

// ==========================================
// Error Types
// ==========================================

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  error: {
    type: 'claude_api' | 'mcp_server' | 'database' | 'validation' | 'client';
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
    suggestion?: string;
    context?: any; // Flexible for debugging
  };
  fallback?: {
    action: 'use_cache' | 'skip_step' | 'simplified_mode' | 'offline_mode';
    data?: any;
  };
}

// ==========================================
// API Response Types
// ==========================================

/**
 * Response from creating a new session
 */
export interface CreateSessionResponse {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Response from applying operations
 */
export interface ApplyOperationsResponse {
  success: boolean;
  applied: number;
  stateUpdate: {
    phase: string;
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: ValidationError[];
  };
  pendingClarification?: {
    questionId: string;
    question: string;
  };
}

/**
 * Response from getting workflow state
 */
export interface GetStateResponse {
  phase: string;
  stats: {
    discovered: number;
    selected: number;
    configured: number;
    validated: number;
  };
  metadata?: {
    name?: string;
    description?: string;
    initialPrompt?: string;
    [key: string]: any;
  };
}

/**
 * Response from exporting workflow
 */
export interface ExportWorkflowResponse {
  workflow: {
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
    settings: WorkflowSettings;
  };
  metadata: {
    createdAt: string;
    operationCount: number;
    tokensSaved: string;
  };
}

/**
 * Response from phase status check
 */
export interface PhaseStatusResponse {
  currentPhase: WorkflowPhase;
  canProgress: boolean;
  autoTransition: boolean;
  reason?: string;
}

/**
 * Response from cleanup operations
 */
export interface CleanupResponse {
  success: boolean;
  expired: number;
  deleted: number;
  timestamp: string;
}

// ==========================================
// MCP Integration Types (Flexible)
// ==========================================

/**
 * MCP tool parameters - kept flexible for now
 */
export interface MCPToolParams {
  [key: string]: any;
}

/**
 * MCP tool response - kept flexible for now
 */
export interface MCPToolResponse {
  [key: string]: any;
}

/**
 * Claude API request - flexible structure
 */
export interface ClaudeRequest {
  sessionId: string;
  phase: WorkflowPhase;
  prompt: string;
  selectedNodes?: string[];
  [key: string]: any; // Additional fields as needed
}

/**
 * Claude API response - operations to apply
 */
export interface ClaudeResponse {
  operations: WorkflowOperation[];
}