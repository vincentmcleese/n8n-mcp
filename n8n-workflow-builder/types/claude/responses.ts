/**
 * Claude Response Types
 *
 * This file contains all TypeScript interfaces for Claude's responses
 * across all workflow phases. It serves as the single source of truth
 * for expected JSON formats from the Claude service.
 */

import type {
  DiscoverNodeOperation,
  SelectNodeOperation,
  DeselectNodeOperation,
  RequestClarificationOperation,
  ConfigureNodeOperation,
  ValidationFixOperation,
  AddStickyNoteOperation,
} from "./operations";

// ==========================================
// Common Types
// ==========================================

/**
 * Token usage information from Claude API
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  wasTruncated?: boolean;
  usagePercentage?: number;
}

/**
 * Base response structure that all Claude responses extend
 */
export interface BaseClaudeResponse {
  reasoning: string[];
  usage?: TokenUsage; // Optional to maintain backward compatibility
}

// ==========================================
// Discovery Phase Types
// ==========================================

/**
 * Initial workflow intent analysis response (optimized for task-based discovery)
 * Used in: analyzeWorkflowIntent()
 *
 * @example
 * {
 *   "intent": "Create a webhook that sends Slack notifications",
 *   "logic_flow": [
 *     {"step": 1, "action": "Receive webhook", "type": "trigger", "task": "receive_webhook"},
 *     {"step": 2, "action": "Send to Slack", "type": "output", "task": "send_slack_message"}
 *   ],
 *   "matched_tasks": ["receive_webhook", "send_slack_message"],
 *   "unmatched_capabilities": [],
 *   "search_suggestions": [],
 *   "workflow_pattern": "trigger-notify",
 *   "complexity": "simple",
 *   "clarification_needed": false,
 *   "reasoning": ["User needs webhook to receive data", "Slack for notifications"]
 * }
 */
export interface ClaudeAnalysisResponse extends BaseClaudeResponse {
  intent: string;
  logic_flow: Array<{
    step: number;
    action: string;
    type: "trigger" | "process" | "condition" | "output";
    task?: string; // Exact MCP task name if applicable
    nodeType?: string; // For non-task nodes
  }>;
  matched_tasks: string[]; // EXACT task names from MCP
  task_selection_reasoning?: Array<{
    task: string;
    reason: string;
  }>; // Optional for backward compatibility
  unmatched_capabilities: Array<{
    name: string;
    description: string;
    searchTerms: string[];
  }>;
  search_suggestions: Array<{
    capability: string;
    primary: string;
    alternatives: string[];
  }>;
  workflow_pattern: string;
  complexity: "simple" | "medium" | "complex" | "unknown";
  clarification_needed: boolean;
  clarification?: {
    question: string;
    context: string;
    suggestions: string[];
  };
}

/**
 * Discovery phase operations response
 * Used in: analyzeDiscoveryIntent()
 *
 * @example
 * {
 *   "operations": [
 *     {
 *       "type": "discoverNode",
 *       "node": {
 *         "id": "node_1",
 *         "type": "nodes-base.webhook",
 *         "purpose": "Receive incoming webhooks"
 *       }
 *     },
 *     {
 *       "type": "selectNode",
 *       "nodeId": "node_1"
 *     }
 *   ],
 *   "reasoning": ["Selected webhook for receiving data"]
 * }
 */
export interface DiscoveryOperationsResponse extends BaseClaudeResponse {
  operations: Array<
    | DiscoverNodeOperation
    | SelectNodeOperation
    | DeselectNodeOperation
    | RequestClarificationOperation
  >;
}

// ==========================================
// Configuration Phase Types
// ==========================================

/**
 * Node requirements analysis response
 * Used in: analyzeNodeRequirements()
 *
 * @example
 * {
 *   "needsAuth": true,
 *   "needsProperties": ["channelId", "messageFormat"],
 *   "suggestedTask": "send_slack_message",
 *   "needsDocumentation": false,
 *   "reasoning": ["Slack requires auth", "Channel property not in essentials"]
 * }
 */
// Deprecated in optimized configuration flow (MVP). Retained for compatibility but unused.
// (Removed) NodeRequirementsResponse – replaced by essentials-based configuration flow.

/**
 * Configuration phase operations response
 * Used in: generateConfiguration()
 *
 * @example
 * {
 *   "operations": [
 *     {
 *       "type": "configureNode",
 *       "nodeId": "node_1",
 *       "config": {
 *         "resource": "message",
 *         "operation": "post",
 *         "channelId": "#general",
 *         "text": "New webhook received!"
 *       }
 *     }
 *   ],
 *   "reasoning": ["Configured Slack to post to #general channel"]
 * }
 */
export interface ConfigurationOperationsResponse extends BaseClaudeResponse {
  operations: ConfigureNodeOperation[];
}

// ==========================================
// Building Phase Types
// ==========================================

/**
 * Complete workflow build response
 * Used in: buildWorkflow()
 *
 * @example
 * {
 *   "name": "Webhook to Slack Notification",
 *   "nodes": [
 *     {
 *       "id": "node_1",
 *       "name": "Webhook",
 *       "type": "n8n-nodes-base.webhook",
 *       "typeVersion": 1,
 *       "position": [250, 300],
 *       "parameters": {
 *         "httpMethod": "POST",
 *         "path": "webhook-endpoint"
 *       },
 *       "onError": "stopWorkflow"
 *     }
 *   ],
 *   "connections": {
 *     "Webhook": {
 *       "main": [[{"node": "Send to Slack", "type": "main", "index": 0}]]
 *     }
 *   },
 *   "settings": {
 *     "executionOrder": "v1",
 *     "saveDataSuccessExecution": "all",
 *     "saveDataErrorExecution": "all",
 *     "saveManualExecutions": true
 *   },
 *   "reasoning": ["Connected webhook to Slack for notifications"]
 * }
 */
export interface WorkflowBuildResponse extends BaseClaudeResponse {
  name: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    typeVersion: number;
    position: [number, number];
    parameters: Record<string, any>;
    onError?: "stopWorkflow" | "continueRegularOutput" | "continueErrorOutput";
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
  }>;
  connections: Record<
    string,
    {
      main: Array<
        Array<{
          node: string;
          type: "main";
          index: number;
        }>
      >;
    }
  >;
  settings: {
    executionOrder: string;
    saveDataSuccessExecution: string;
    saveDataErrorExecution: string;
    saveManualExecutions: boolean;
  };
  phases?: Array<{
    type:
      | "trigger"
      | "data_collection"
      | "data_processing"
      | "decision"
      | "aggregation"
      | "notification"
      | "storage"
      | "integration"
      | "error_handling";
    description: string;
    nodeIds: string[];
    row?: number;
  }>;
}

// ==========================================
// Validation Phase Types
// ==========================================

/**
 * Validation fixes response
 * Used in: generateValidationFixes()
 * Returns either an array of fixes (legacy) or an object with fixes and reasoning
 *
 * @example
 * {
 *   "fixes": [
 *     {
 *       "type": "addField",
 *       "nodeId": "node_1",
 *       "field": "channelId",
 *       "value": "#general"
 *     },
 *     {
 *       "type": "updateField",
 *       "nodeId": "node_2",
 *       "field": "onError",
 *       "value": "continueErrorOutput"
 *     }
 *   ],
 *   "reasoning": [
 *     "Added missing channelId field to Slack node",
 *     "Updated error handling to continue on error with output"
 *   ]
 * }
 */
export type ValidationFixesResponse =
  | {
      fixes: ValidationFixOperation[];
      reasoning: string[];
    }
  | ValidationFixOperation[];

/**
 * Complete validated workflow response
 * Used in: validateWorkflow()
 *
 * Note: This response uses custom markers in the actual implementation:
 * === BEGIN RESULT ===
 * { workflow object }
 * === END RESULT ===
 *
 * @example
 * {
 *   "workflow": {
 *     "name": "Validated Workflow",
 *     "nodes": [...],
 *     "connections": {...},
 *     "settings": {...},
 *     "valid": true
 *   },
 *   "validationReport": {
 *     "initial": { "errors": [...] },
 *     "fixesApplied": [...],
 *     "final": { "errors": [] }
 *   },
 *   "reasoning": ["Fixed missing fields", "Validated connections"]
 * }
 */
export interface ValidatedWorkflowResponse extends BaseClaudeResponse {
  workflow: {
    name: string;
    nodes: any[];
    connections: Record<string, any>;
    settings: Record<string, any>;
    valid: boolean;
  };
  validationReport: {
    initial?: {
      errors?: any[];
      warnings?: any[];
    };
    fixesApplied?: any[];
    final?: {
      errors?: any[];
      warnings?: any[];
    };
  };
}

// ==========================================
// Documentation Phase Types
// ==========================================

/**
 * Documentation phase operations response
 * Used in: generateDocumentation()
 *
 * @example
 * {
 *   "operations": [
 *     {
 *       "type": "addStickyNote",
 *       "note": {
 *         "id": "sticky_1",
 *         "content": "This webhook receives incoming data and validates the payload",
 *         "nodeGroupIds": ["node_1", "node_2"],
 *         "color": 1
 *       }
 *     }
 *   ],
 *   "reasoning": ["Added documentation for webhook entry point", "Grouped validation nodes"]
 * }
 */
export interface DocumentationOperationsResponse extends BaseClaudeResponse {
  operations: AddStickyNoteOperation[];
}

// ==========================================
// Combined Response Types for Claude Service
// ==========================================

/**
 * Union type for all possible Claude responses
 */
export type ClaudeResponse =
  | ClaudeAnalysisResponse
  | DiscoveryOperationsResponse
  | ConfigurationOperationsResponse
  | WorkflowBuildResponse
  | ValidationFixesResponse
  | ValidatedWorkflowResponse
  | DocumentationOperationsResponse;

/**
 * Response with operations (Discovery, Configuration, Documentation phases)
 */
export interface ClaudeOperationsResponse extends BaseClaudeResponse {
  operations: any[];
}

/**
 * Building phase specific response
 */
export interface ClaudeBuildingResponse extends WorkflowBuildResponse {
  operations: any[]; // For compatibility, usually empty
}

/**
 * Validation phase specific response
 */
export interface ClaudeValidationResponse extends BaseClaudeResponse {
  operations: any[]; // For compatibility, usually empty
  workflow: any;
  validationReport: any;
}

// Backward compatibility exports
export type ClaudeDiscoveryResponse = DiscoveryOperationsResponse;
export type ClaudeConfigurationResponse = ConfigurationOperationsResponse;
