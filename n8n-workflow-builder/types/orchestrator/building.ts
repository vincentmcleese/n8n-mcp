/**
 * Building Phase Types
 * 
 * Types for the building phase of workflow construction.
 */

import type { WorkflowPhase } from '../workflow';
import type { PhaseResult } from './base';

/**
 * Input for the building phase runner
 */
export interface BuildingInput {
  sessionId: string;
}

/**
 * Output from the building phase runner
 */
export interface BuildingOutput extends PhaseResult {
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
}

/**
 * Dependencies for the building runner
 */
export interface BuildingRunnerDeps {
  claudeService: any;
  sessionRepo: any;
  loggers: any;
}