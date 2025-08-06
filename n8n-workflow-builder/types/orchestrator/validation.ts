/**
 * Validation Phase Types
 * 
 * Types for the validation phase of workflow verification.
 */

import type { WorkflowPhase } from '../workflow';
import type { PhaseResult } from './base';

/**
 * Input for the validation phase runner
 */
export interface ValidationInput {
  sessionId: string;
  buildingResult?: any; // Avoid circular dependency
}

/**
 * Output from the validation phase runner
 */
export interface ValidationOutput extends PhaseResult {
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  validationReport: any;
}

/**
 * Dependencies for the validation runner
 */
export interface ValidationRunnerDeps {
  claudeService: any;
  nodeContextService: any;
  sessionRepo: any;
  loggers: any;
}