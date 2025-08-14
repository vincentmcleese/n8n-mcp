// types/workflow.ts

import type { WorkflowSEOMetadata } from "./seo";
import type {
  DiscoverNodeOperation,
  SelectNodeOperation,
  DeselectNodeOperation,
  RequestClarificationOperation,
  ConfigureNodeOperation,
  AddFieldOperation,
  UpdateFieldOperation,
  RemoveFieldOperation,
  AddConnectionOperation,
  RemoveConnectionOperation,
  AddNodeOperation,
  UpdateWorkflowSettingsOperation,
  SetWorkflowNameOperation,
  AddStickyNoteOperation,
} from "./claude";

// ==========================================
// Core Types
// ==========================================

/**
 * Represents a node in the n8n workflow
 */
export interface WorkflowNode {
  id: string;
  name: string; // Required display name for the node
  type: string;
  typeVersion?: number; // Version of the node type
  position: [number, number];
  parameters: Record<string, any>; // Flexible for MCP integration
  category?: string; // Node category: trigger, input, transform, output
  onError?: string; // Error handling strategy
  // Optional fields referenced by analyzers and UI
  notes?: string;
  credentials?: Record<string, { id?: string; name?: string } | undefined>;
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
  | "discovery"
  | "configuration"
  | "validation"
  | "building"
  | "documentation"
  | "complete";

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
    buildPhases?: Array<{
      type: string;
      description: string;
      nodeIds: string[];
    }>;
    operationHistory: WorkflowOperation[];
    pendingClarifications: ClarificationRequest[];
    clarificationHistory: ClarificationResponse[];
    nodeEssentials?: Map<string, any>; // Cache of node essentials by nodeType
    seo?: WorkflowSEOMetadata; // SEO metadata generated after discovery
    configAnalysis?: WorkflowConfigAnalysis; // Configuration analysis generated during building
    tokenUsage?: {
      byPhase: Record<string, number>;
      byCalls: Array<{
        phase: string;
        method: string;
        tokens: number;
        timestamp: string;
      }>;
      total: number;
    };
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
  timestamp?: string; // When the operation occurred
  reasoning?: string; // Why this operation was performed
  operationIndex?: number; // Index in the operation sequence
}

/**
 * Extended operation types for session management
 * These extend the Claude operation types with additional session-specific operations
 *
 * @see Claude operation types in @/types/claude/operations.ts
 */
export type SessionOperation =
  // Use imported Claude operation types
  | DiscoverNodeOperation
  | SelectNodeOperation
  | DeselectNodeOperation
  | RequestClarificationOperation
  | ConfigureNodeOperation
  | AddFieldOperation
  | UpdateFieldOperation
  | RemoveFieldOperation
  | AddConnectionOperation
  | RemoveConnectionOperation
  | AddNodeOperation
  | UpdateWorkflowSettingsOperation
  | SetWorkflowNameOperation
  | AddStickyNoteOperation

  // Additional session-specific operations not in Claude types
  | { type: "clarificationResponse"; questionId: string; response: string }
  | {
      type: "setUserPrompt";
      prompt: string;
      reason?: "clarification" | "user_edit";
    }
  | { type: "updateNodeConfig"; nodeId: string; path: string; value: any }
  | { type: "validateNode"; nodeId: string; result: ValidationResult }
  | { type: "addValidationError"; nodeId: string; error: ValidationError }
  | {
      type: "validationHistory";
      nodeId: string;
      nodeType: string;
      history: any[];
      finalValid: boolean;
      totalAttempts: number;
    }
  | { type: "addToWorkflow"; nodeId: string; position: [number, number] }
  | {
      type: "setWorkflow";
      workflow: { nodes: any[]; connections: any; settings: any };
    }
  | { type: "setPhase"; phase: WorkflowPhase }
  | { type: "completePhase"; phase: WorkflowPhase }
  | {
      type: "setBuildPhases";
      phases: Array<{
        type: string;
        description: string;
        nodeIds: string[];
        row?: number;
      }>;
    }
  | {
      type: "setSEOMetadata";
      seo: WorkflowSEOMetadata;
    }
  | {
      type: "setConfigAnalysis";
      analysis: WorkflowConfigAnalysis;
    };

/**
 * Workflow operation with metadata
 * Combines base operation metadata with specific operation types
 */
export type WorkflowOperation = BaseOperation & SessionOperation;

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
  // New flags for task-based discovery
  isPreConfigured?: boolean; // True for task nodes with pre-configured settings
  needsConfiguration?: boolean; // True for searched nodes that need configuration
  config?: any; // Pre-configured settings from task template
}

/**
 * Workflow phase analysis for logical grouping
 */
export interface WorkflowPhaseAnalysis {
  phases: Array<{
    id: string;
    name: string;
    description: string; // 2-3 sentences describing what this phase does
    nodeIds: string[]; // IDs of nodes in this phase
    order: number; // Chronological order (1, 2, 3, etc.)
  }>;
}

/**
 * Sticky note for workflow documentation
 */
export interface StickyNote {
  id: string;
  content: string;
  nodeGroupIds: string[]; // IDs of nodes this note documents
  color?: number; // 1-7 for different colors in n8n
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
  severity: "error" | "warning";
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
    type: "claude_api" | "mcp_server" | "database" | "validation" | "client";
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
    suggestion?: string;
    context?: any; // Flexible for debugging
  };
  fallback?: {
    action: "use_cache" | "skip_step" | "simplified_mode" | "offline_mode";
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
 * Configuration analysis for workflow nodes
 */
export interface WorkflowConfigAnalysis {
  timestamp: string;
  isComplete: boolean;
  totalNodes: number;
  configuredNodes: number;
  missingCredentials: string[];
  nodes: NodeConfigStatus[];
}

/**
 * Configuration status for individual nodes
 */
export interface NodeConfigStatus {
  id: string;
  name: string;
  type: string;
  purpose: string;
  status: "configured" | "needs_credentials" | "needs_decisions" | "partial";
  configured: ConfiguredField[];
  needsCredentials: CredentialRequirement[];
  needsDecisions: DecisionRequirement[];
  isReady: boolean;
}

/**
 * A configured field in a node
 */
export interface ConfiguredField {
  field: string;
  value: any;
  description?: string;
}

/**
 * A credential requirement for a node
 */
export interface CredentialRequirement {
  field: string;
  credentialType: string;
  variable: string;
  description: string;
  isAlternative?: boolean; // True when this is one of multiple credential options
}

/**
 * A decision requirement for a node
 */
export interface DecisionRequirement {
  field: string;
  decision: string;
  options?: string[];
  description: string;
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
