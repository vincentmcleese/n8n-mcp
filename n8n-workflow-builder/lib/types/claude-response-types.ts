/**
 * Claude Response Types
 * 
 * This file contains all TypeScript interfaces for Claude's responses
 * across all workflow phases. It serves as the single source of truth
 * for expected JSON formats from the Claude service.
 */

// ==========================================
// Common Types
// ==========================================

/**
 * Base response structure that all Claude responses extend
 */
export interface BaseClaudeResponse {
  reasoning: string[];
}

// ==========================================
// Discovery Phase Types
// ==========================================

/**
 * Initial workflow intent analysis response
 * Used in: analyzeWorkflowIntent()
 * 
 * @example
 * {
 *   "intent": "Create a webhook that sends Slack notifications",
 *   "requiredCapabilities": ["webhook-receiver", "message-sender"],
 *   "suggestedSearchTerms": ["webhook", "slack", "notification"],
 *   "nodeRecommendations": [{
 *     "type": "webhook",
 *     "purpose": "Receive incoming webhook requests",
 *     "priority": "essential"
 *   }],
 *   "reasoning": ["User needs webhook to receive data", "Slack for notifications"]
 * }
 */
export interface ClaudeAnalysisResponse {
  intent: string;
  requiredCapabilities: string[];
  suggestedSearchTerms: string[];
  nodeRecommendations: Array<{
    type: string;
    purpose: string;
    priority: "essential" | "recommended" | "optional";
  }>;
  reasoning: string[];
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

export interface DiscoverNodeOperation {
  type: "discoverNode";
  node: {
    id: string;
    type: string;
    purpose: string;
  };
}

export interface SelectNodeOperation {
  type: "selectNode";
  nodeId: string;
}

export interface DeselectNodeOperation {
  type: "deselectNode";
  nodeId: string;
}

export interface RequestClarificationOperation {
  type: "requestClarification";
  questionId: string;
  question: string;
  context: {
    reason: string;
    [key: string]: any;
  };
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
export interface NodeRequirementsResponse {
  needsAuth: boolean;
  needsProperties: string[];
  suggestedTask?: string;
  needsDocumentation: boolean;
  reasoning: string[];
}

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

export interface ConfigureNodeOperation {
  type: "configureNode";
  nodeId: string;
  config: Record<string, any>;
}

/**
 * Fixed node configuration response
 * Used in: fixNodeConfig()
 * Returns just the fixed configuration object
 * 
 * @example
 * {
 *   "resource": "message",
 *   "operation": "post",
 *   "select": "channel",
 *   "channelId": "#general",
 *   "text": "Message text"
 * }
 */
export type FixedNodeConfigResponse = Record<string, any>;

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
  connections: Record<string, {
    main: Array<Array<{
      node: string;
      type: "main";
      index: number;
    }>>;
  }>;
  settings: {
    executionOrder: string;
    saveDataSuccessExecution: string;
    saveDataErrorExecution: string;
    saveManualExecutions: boolean;
  };
}

// ==========================================
// Validation Phase Types
// ==========================================

/**
 * Validation fixes response
 * Used in: generateValidationFixes()
 * Returns an array of fix operations
 * 
 * @example
 * [
 *   {
 *     "type": "addField",
 *     "nodeId": "node_1",
 *     "field": "channelId",
 *     "value": "#general"
 *   },
 *   {
 *     "type": "updateField",
 *     "nodeId": "node_2",
 *     "field": "onError",
 *     "value": "continueErrorOutput"
 *   }
 * ]
 */
export type ValidationFixesResponse = ValidationFixOperation[];

export type ValidationFixOperation = 
  | AddFieldOperation
  | UpdateFieldOperation
  | RemoveFieldOperation
  | AddConnectionOperation
  | RemoveConnectionOperation
  | AddNodeOperation
  | UpdateWorkflowSettingsOperation
  | SetWorkflowNameOperation;

export interface AddFieldOperation {
  type: "addField";
  nodeId: string;
  field: string;
  value: any;
}

export interface UpdateFieldOperation {
  type: "updateField";
  nodeId: string;
  field: string;
  value: any;
}

export interface RemoveFieldOperation {
  type: "removeField";
  nodeId: string;
  field: string;
}

export interface AddConnectionOperation {
  type: "addConnection";
  from: string;
  to: string;
}

export interface RemoveConnectionOperation {
  type: "removeConnection";
  from: string;
  to: string;
}

export interface AddNodeOperation {
  type: "addNode";
  node: {
    id: string;
    name: string;
    type: string;
    position?: [number, number];
    parameters?: Record<string, any>;
  };
}

export interface UpdateWorkflowSettingsOperation {
  type: "updateWorkflowSettings";
  settings: Record<string, any>;
}

export interface SetWorkflowNameOperation {
  type: "setWorkflowName";
  name: string;
}

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

export interface AddStickyNoteOperation {
  type: "addStickyNote";
  note: {
    id: string;
    content: string;
    nodeGroupIds: string[];
    color?: number;
  };
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
  | NodeRequirementsResponse
  | ConfigurationOperationsResponse
  | FixedNodeConfigResponse
  | WorkflowBuildResponse
  | ValidationFixesResponse
  | ValidatedWorkflowResponse
  | DocumentationOperationsResponse;

/**
 * Response with operations (Discovery, Configuration phases)
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