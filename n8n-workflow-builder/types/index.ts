/**
 * Main Type Export Barrel File
 * 
 * This is the single entry point for all types in the project.
 * Import types from @/types to ensure consistent and centralized type management.
 */

// Re-export all types from subdirectories
export * from './workflow';
export * from './n8n';
export * from './claude';
export * from './validation';
export * from './orchestrator';
export * from './utils';

// ==========================================
// Convenience Type Unions
// ==========================================

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
  AddStickyNoteOperation
} from './claude';

import type {
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse,
  ConfigurationOperationsResponse,
  WorkflowBuildResponse,
  ValidationFixesResponse,
  ValidatedWorkflowResponse,
  DocumentationOperationsResponse
} from './claude';

// Union of all Claude operation types
export type AnyClaudeOperation = 
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
  | AddStickyNoteOperation;

// Union of all Claude response types
export type AnyClaudeResponse =
  | ClaudeAnalysisResponse
  | DiscoveryOperationsResponse
  | ConfigurationOperationsResponse
  | WorkflowBuildResponse
  | ValidationFixesResponse
  | ValidatedWorkflowResponse
  | DocumentationOperationsResponse;

// ==========================================
// Type Guards Export
// ==========================================

// Re-export all type guards for convenience
export {
  isWorkflowNode,
  isWorkflowConnection,
  isN8nNode,
  isN8nConnection,
  isN8nWorkflow,
  isValidationReport,
  isValidationIssue,
  isClaudeAnalysisResponse,
  isDiscoveryOperationsResponse,
  isConfigurationOperationsResponse,
  isWorkflowBuildResponse,
  isValidatedWorkflowResponse,
  isDocumentationOperationsResponse
} from './utils/guards';