/**
 * n8n Workflow Type Definitions
 * 
 * Types for complete n8n workflow structures including nodes, connections, and settings.
 */

import type { N8nNode, N8nStickyNote } from './node';
import type { N8nWorkflowConnections } from './connection';

// ==========================================
// Workflow Settings
// ==========================================

/**
 * n8n workflow execution settings
 */
export interface N8nWorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveDataSuccessExecution?: 'all' | 'none';
  saveDataErrorExecution?: 'all' | 'none';
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  callerPolicy?: 'any' | 'none' | 'workflowsFromAList' | 'workflowsFromSameOwner';
  callerIds?: string[];
  errorWorkflow?: string;
  timezone?: string;
  timeout?: number;
  maxExecutionTime?: number;
}

/**
 * n8n workflow metadata
 */
export interface N8nWorkflowMetadata {
  id?: string;
  name: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  versionId?: string;
  tags?: Array<{ id: string; name: string }>;
  pinData?: Record<string, any>;
  sharedWith?: Array<{ id: string; name: string }>;
  ownedBy?: { id: string; name: string };
}

// ==========================================
// Complete Workflow Structure
// ==========================================

/**
 * Complete n8n workflow structure
 */
export interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: N8nWorkflowConnections;
  active?: boolean;
  settings?: N8nWorkflowSettings;
  staticData?: Record<string, any>;
  tags?: Array<{ id: string; name: string }>;
  pinData?: Record<string, any>;
  versionId?: string;
  meta?: {
    templateId?: string;
    templateVersion?: number;
    instanceId?: string;
  };
}

/**
 * n8n workflow with UI elements (includes sticky notes)
 */
export interface N8nWorkflowWithUI extends N8nWorkflow {
  notes?: N8nStickyNote[];
  zoom?: number;
  viewport?: {
    x: number;
    y: number;
  };
}

// ==========================================
// Workflow Export/Import Types
// ==========================================

/**
 * n8n workflow export format
 */
export interface N8nWorkflowExport {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: N8nWorkflowConnections;
  active: boolean;
  settings: N8nWorkflowSettings;
  versionId?: string;
  tags?: string[];
  pinData?: Record<string, any>;
  staticData?: Record<string, any>;
}

/**
 * n8n workflow JSON format (for file export)
 */
export interface N8nWorkflowJson {
  name: string;
  nodes: N8nNode[];
  connections: N8nWorkflowConnections;
  active: boolean;
  settings: N8nWorkflowSettings;
  versionId?: string;
  id?: string;
  tags?: string[];
  pinData?: Record<string, any>;
  staticData?: Record<string, any>;
  triggerCount?: number;
  hash?: string;
}

// ==========================================
// Workflow Execution Types
// ==========================================

/**
 * Workflow execution mode
 */
export type WorkflowExecutionMode = 
  | 'manual'
  | 'trigger'
  | 'webhook'
  | 'cron'
  | 'interval'
  | 'error'
  | 'integrated'
  | 'cli'
  | 'internal';

/**
 * Workflow execution status
 */
export type WorkflowExecutionStatus =
  | 'new'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'crashed'
  | 'waiting';

/**
 * Basic workflow execution info
 */
export interface WorkflowExecutionInfo {
  id: string;
  finished: boolean;
  mode: WorkflowExecutionMode;
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: Date;
  stoppedAt?: Date;
  workflowId?: string;
  workflowName?: string;
  status: WorkflowExecutionStatus;
  waitTill?: Date;
}

// ==========================================
// Workflow Template Types
// ==========================================

/**
 * n8n workflow template info
 */
export interface N8nWorkflowTemplate {
  id: number;
  name: string;
  workflow: N8nWorkflowExport;
  description?: string;
  image?: string[];
  categories?: Array<{
    id: number;
    name: string;
  }>;
  creator?: {
    username: string;
  };
  createdAt?: string;
}