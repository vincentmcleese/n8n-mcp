/**
 * Documentation Phase Types
 * 
 * Types for the documentation phase of workflow annotation.
 */

import type { WorkflowPhase } from '../workflow';
import type { PhaseResult } from './base';

/**
 * Input for the documentation phase runner
 */
export interface DocumentationInput {
  sessionId: string;
  validationResult?: any; // Avoid circular dependency
}

/**
 * Output from the documentation phase runner
 */
export interface DocumentationOutput extends PhaseResult {
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  stickyNotesAdded?: number;
}

/**
 * Dependencies for the documentation runner
 */
export interface DocumentationRunnerDeps {
  claudeService: any;
  sessionRepo: any;
  loggers: any;
}