/**
 * n8n Node Type Definitions
 * 
 * Types for defining n8n workflow nodes with proper structure and parameters.
 */

// ==========================================
// Node Parameter Types
// ==========================================

/**
 * Flexible node parameter type supporting nested structures
 */
export type NodeParameterValue = 
  | string 
  | number 
  | boolean 
  | null
  | NodeParameter 
  | NodeParameterValue[];

/**
 * Node parameter object with flexible key-value pairs
 */
export interface NodeParameter {
  [key: string]: NodeParameterValue;
}

/**
 * Named parameter value structure
 */
export interface NamedParameterValue {
  name: string;
  value: string | number;
}

// ==========================================
// Node Types
// ==========================================

/**
 * Base n8n node structure
 */
export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: NodeParameter;
  credentials?: Record<string, string | { id: string; name: string }>;
  disabled?: boolean;
  notes?: string;
  color?: string;
  issues?: {
    parameters?: Record<string, string[]>;
    credentials?: Record<string, string[]>;
  };
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
}

/**
 * Webhook-specific node configuration
 */
export interface N8nWebhookNode extends N8nNode {
  type: 'n8n-nodes-base.webhook';
  webhookId?: string;
  parameters: {
    httpMethod: string;
    path: string;
    responseMode?: string;
    responseData?: string;
    options?: NodeParameter;
  };
}

/**
 * HTTP Request node configuration
 */
export interface N8nHttpRequestNode extends N8nNode {
  type: 'n8n-nodes-base.httpRequest';
  parameters: {
    url: string;
    authentication?: string;
    method: string;
    options?: NodeParameter;
    headerParametersUi?: NodeParameter;
    queryParametersUi?: NodeParameter;
    bodyParametersUi?: NodeParameter;
  };
}

/**
 * Function node configuration
 */
export interface N8nFunctionNode extends N8nNode {
  type: 'n8n-nodes-base.function';
  parameters: {
    functionCode: string;
  };
}

/**
 * Code node configuration
 */
export interface N8nCodeNode extends N8nNode {
  type: 'n8n-nodes-base.code';
  parameters: {
    language: 'javaScript' | 'python';
    jsCode?: string;
    pythonCode?: string;
  };
}

/**
 * Set node configuration
 */
export interface N8nSetNode extends N8nNode {
  type: 'n8n-nodes-base.set';
  parameters: {
    values: {
      string?: Array<{
        name: string;
        value: string;
      }>;
      number?: Array<{
        name: string;
        value: number;
      }>;
      boolean?: Array<{
        name: string;
        value: boolean;
      }>;
    };
    options?: NodeParameter;
  };
}

/**
 * If node configuration
 */
export interface N8nIfNode extends N8nNode {
  type: 'n8n-nodes-base.if';
  parameters: {
    conditions: {
      string?: Array<{
        value1: string;
        operation: string;
        value2: string;
      }>;
      number?: Array<{
        value1: number;
        operation: string;
        value2: number;
      }>;
      boolean?: Array<{
        value1: boolean;
        operation: string;
        value2: boolean;
      }>;
    };
    combineOperation?: 'all' | 'any';
  };
}

/**
 * Switch node configuration
 */
export interface N8nSwitchNode extends N8nNode {
  type: 'n8n-nodes-base.switch';
  parameters: {
    dataType: 'string' | 'number' | 'boolean';
    value1: string;
    rules: {
      rules: Array<{
        operation: string;
        value2: string | number | boolean;
        output?: number;
      }>;
    };
    fallbackOutput?: number;
  };
}

/**
 * Start node configuration (workflow trigger)
 */
export interface N8nStartNode extends N8nNode {
  type: 'n8n-nodes-base.start';
  parameters: Record<string, never>; // No parameters
}

/**
 * Manual trigger node
 */
export interface N8nManualTriggerNode extends N8nNode {
  type: 'n8n-nodes-base.manualTrigger';
  parameters: Record<string, never>; // No parameters
}

/**
 * Sticky note (not a node, but part of workflow)
 */
export interface N8nStickyNote {
  id: string;
  type: 'n8n-nodes-base.stickyNote';
  position: [number, number];
  parameters: {
    content: string;
    height?: number;
    width?: number;
    color?: number; // 1-7 for different colors
  };
}

// ==========================================
// Node Category Types
// ==========================================

export type TriggerNode = 
  | N8nWebhookNode 
  | N8nStartNode 
  | N8nManualTriggerNode;

export type ActionNode = 
  | N8nHttpRequestNode 
  | N8nFunctionNode 
  | N8nCodeNode 
  | N8nSetNode;

export type FlowControlNode = 
  | N8nIfNode 
  | N8nSwitchNode;

export type AnyN8nNode = 
  | TriggerNode 
  | ActionNode 
  | FlowControlNode 
  | N8nNode;