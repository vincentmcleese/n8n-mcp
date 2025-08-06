/**
 * Validation Report Types
 * 
 * Types for workflow validation results, issues, and reports.
 */

// ==========================================
// Validation Issue Types
// ==========================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Types of validation issues
 */
export type ValidationIssueType = 
  | 'missing_required_field'
  | 'invalid_field_value'
  | 'missing_connection'
  | 'invalid_connection'
  | 'circular_dependency'
  | 'orphaned_node'
  | 'missing_credentials'
  | 'invalid_credentials'
  | 'deprecated_node'
  | 'incompatible_types'
  | 'configuration_error'
  | 'workflow_error';

/**
 * Validation issue details
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  nodeId?: string;
  nodeName?: string;
  field?: string;
  message: string;
  suggestion?: string;
  documentationUrl?: string;
  path?: string[]; // Path to the field in nested objects
  expected?: any;
  actual?: any;
}

// ==========================================
// Validation Result Types
// ==========================================

/**
 * Node validation result
 */
export interface NodeValidationResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Connection validation result
 */
export interface ConnectionValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  missingConnections: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
  invalidConnections: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
}

/**
 * Workflow settings validation result
 */
export interface SettingsValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ==========================================
// Complete Validation Report
// ==========================================

/**
 * Complete workflow validation report
 */
export interface ValidationReport {
  valid: boolean;
  timestamp: string;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
    nodesValidated: number;
    nodesWithIssues: number;
  };
  nodes: NodeValidationResult[];
  connections: ConnectionValidationResult;
  settings: SettingsValidationResult;
  issues: ValidationIssue[]; // All issues flattened
  suggestions?: string[]; // General workflow improvement suggestions
}

/**
 * Validation fix result
 */
export interface ValidationFixResult {
  applied: boolean;
  issueFixed: ValidationIssue;
  operation: string;
  details?: any;
  error?: string;
}

/**
 * Validation fix report
 */
export interface ValidationFixReport {
  fixesAttempted: number;
  fixesSuccessful: number;
  fixesFailed: number;
  results: ValidationFixResult[];
  remainingIssues: ValidationIssue[];
}

// ==========================================
// Validation Configuration
// ==========================================

/**
 * Validation rule configuration
 */
export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: ValidationSeverity;
  enabled: boolean;
  nodeTypes?: string[]; // Apply only to specific node types
  check: (node: any, workflow?: any) => ValidationIssue | null;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  strict: boolean; // Fail on warnings
  rules: ValidationRule[];
  customRules?: ValidationRule[];
  ignoredIssueTypes?: ValidationIssueType[];
  ignoredNodeTypes?: string[];
  maxIssues?: number; // Stop validation after N issues
}

// ==========================================
// Validation Status Types
// ==========================================

/**
 * Real-time validation status
 */
export interface ValidationStatus {
  isValidating: boolean;
  progress?: {
    current: number;
    total: number;
    currentNode?: string;
  };
  lastValidation?: {
    timestamp: string;
    valid: boolean;
    issueCount: number;
  };
}

/**
 * Validation history entry
 */
export interface ValidationHistoryEntry {
  timestamp: string;
  report: ValidationReport;
  fixesApplied?: ValidationFixReport;
  triggeredBy: 'manual' | 'auto' | 'phase_transition';
}