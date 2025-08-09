/**
 * Configuration Phase Types
 * 
 * Types for the configuration phase of workflow building.
 */

import type { WorkflowPhase } from '../workflow';
import type { PhaseResult } from './base';

/**
 * Input for the configuration phase runner
 */
export interface ConfigurationInput {
  sessionId: string;
}

/**
 * A configured node with validation status
 */
export interface ConfiguredNode {
  id: string;
  type: string;
  purpose: string;
  config: any;
  validated: boolean;
  validationErrors?: string[];
  category?: string; // Node category from MCP: trigger, input, transform, output
}

/**
 * Output from the configuration phase runner
 */
export interface ConfigurationOutput extends PhaseResult {
  phase: WorkflowPhase;
  configured: ConfiguredNode[];
}

/**
 * Dependencies for the configuration runner
 */
export interface ConfigurationRunnerDeps {
  claudeService: any;
  nodeContextService: any;
  sessionRepo: any;
  loggers: any;
}