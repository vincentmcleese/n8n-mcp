/**
 * Discovery Phase Types
 * 
 * Types for the discovery phase of workflow building.
 */

import type { WorkflowPhase, DiscoveredNode } from '../workflow';
import type { PhaseResult } from './base';

/**
 * Input for the discovery phase runner
 */
export interface DiscoveryInput {
  sessionId: string;
  prompt: string;
  userId?: string; // Optional user ID for workflow ownership
}

/**
 * Input for handling clarification responses
 */
export interface ClarificationInput {
  sessionId: string;
  questionId: string;
  response: string;
}

/**
 * Output from the discovery phase runner
 */
export interface DiscoveryOutput extends PhaseResult {
  phase: WorkflowPhase;
  discoveredNodes: DiscoveredNode[];
  selectedNodeIds: string[];
  pendingClarification?: {
    questionId: string;
    question: string;
  };
}

/**
 * Dependencies for the discovery runner
 */
export interface DiscoveryRunnerDeps {
  claudeService: any; // Avoid circular dependency
  nodeContextService: any;
  sessionRepo: any;
  loggers: any;
  mcpClient?: any; // Optional MCP client
}