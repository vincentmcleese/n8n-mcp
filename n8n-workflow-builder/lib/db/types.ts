// Database types for workflow sessions
// Matches the PostgreSQL schema in Supabase

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  purpose: string;
  position: [number, number];
  parameters: Record<string, any>;
  isSelected: boolean;
}

export interface WorkflowConnection {
  source: string;
  target: string;
  sourceOutput: string;
  targetInput: string;
}

export interface WorkflowSettings {
  name: string;
  timezone?: string;
  [key: string]: any;
}

export interface WorkflowClarification {
  id: string;
  type: string;
  nodeId?: string;
  message: string;
  options?: string[];
  resolved?: boolean;
  response?: any;
}

export interface WorkflowValidation {
  isValid: boolean;
  errors?: Array<{
    nodeId?: string;
    message: string;
    type: string;
  }>;
  warnings?: Array<{
    nodeId?: string;
    message: string;
    type: string;
  }>;
}

export interface WorkflowState {
  phase: 'discovery' | 'clarification' | 'building' | 'validation' | 'complete';
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  settings: WorkflowSettings;
  pendingClarifications: WorkflowClarification[];
  clarificationHistory: WorkflowClarification[];
  validations: WorkflowValidation;
}

export interface WorkflowOperation {
  index: number;
  type: string;
  data: Record<string, any>;
  timestamp: string;
  createdBy: 'claude' | 'user' | 'system';
}

export interface WorkflowSession {
  id: number;
  session_id: string;
  created_at: string;
  updated_at: string;
  state: WorkflowState;
  operations: WorkflowOperation[];
  user_prompt: string | null;
  is_active: boolean;
}

// Type guards
export function isWorkflowNode(obj: any): obj is WorkflowNode {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.position) &&
    obj.position.length === 2
  );
}

export function isWorkflowConnection(obj: any): obj is WorkflowConnection {
  return (
    typeof obj === 'object' &&
    typeof obj.source === 'string' &&
    typeof obj.target === 'string' &&
    typeof obj.sourceOutput === 'string' &&
    typeof obj.targetInput === 'string'
  );
}

export function isWorkflowState(obj: any): obj is WorkflowState {
  return (
    typeof obj === 'object' &&
    ['discovery', 'clarification', 'building', 'validation', 'complete'].includes(obj.phase) &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.connections) &&
    typeof obj.settings === 'object'
  );
}

// Default values
export const defaultWorkflowState: WorkflowState = {
  phase: 'discovery',
  nodes: [],
  connections: [],
  settings: {
    name: 'Untitled Workflow'
  },
  pendingClarifications: [],
  clarificationHistory: [],
  validations: {
    isValid: true
  }
};