/**
 * Claude Operation Types
 * 
 * This file contains all operation types that Claude can generate
 * for workflow state mutations across all phases.
 */

// ==========================================
// Discovery Phase Operations
// ==========================================

export interface DiscoverNodeOperation {
  type: "discoverNode";
  node: {
    id: string;
    type: string;
    purpose: string;
    displayName?: string;
    category?: string; // trigger, input, transform, output
    isPreConfigured?: boolean;
    config?: any;
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
// Configuration Phase Operations
// ==========================================

export interface ConfigureNodeOperation {
  type: "configureNode";
  nodeId: string;
  nodeType?: string;
  purpose?: string;
  config: Record<string, any>;
}

// ==========================================
// Validation Phase Operations
// ==========================================

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

// ==========================================
// Documentation Phase Operations
// ==========================================

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
// Operation Type Unions
// ==========================================

export type DiscoveryOperation = 
  | DiscoverNodeOperation
  | SelectNodeOperation
  | DeselectNodeOperation
  | RequestClarificationOperation;

export type ConfigurationOperation = ConfigureNodeOperation;

export type ValidationFixOperation = 
  | AddFieldOperation
  | UpdateFieldOperation
  | RemoveFieldOperation
  | AddConnectionOperation
  | RemoveConnectionOperation
  | AddNodeOperation
  | UpdateWorkflowSettingsOperation
  | SetWorkflowNameOperation;

export type DocumentationOperation = AddStickyNoteOperation;

export type ClaudeOperation = 
  | DiscoveryOperation
  | ConfigurationOperation
  | ValidationFixOperation
  | DocumentationOperation;