/**
 * Base Orchestrator Types
 *
 * Common types and interfaces used across all orchestrator phases.
 */

import type { WorkflowOperation } from "../workflow";

/**
 * Common interface for all phase runners
 * Each phase runner implements this contract to ensure consistency
 */
export interface PhaseRunner<TInput, TOutput> {
  /**
   * Execute the phase logic
   * @param input Phase-specific input data
   * @returns Phase-specific output with standard result structure
   */
  run(input: TInput): Promise<TOutput>;
}

/**
 * Base result structure that all phase outputs extend
 */
export interface PhaseResult {
  success: boolean;
  phase: string;
  operations: WorkflowOperation[];
  reasoning?: string[];
  error?: {
    type: "validation" | "claude_api" | "mcp_server" | "database" | "client";
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
}

/**
 * Common error types for phase execution
 */
export type PhaseErrorType =
  | "validation"
  | "claude_api"
  | "mcp_server"
  | "database"
  | "client";

/**
 * Phase error details
 */
export interface PhaseError {
  type: PhaseErrorType;
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  retryAfter?: number;
  suggestion?: string;
  context?: any;
}

/**
 * Phase execution context
 */
export interface PhaseContext {
  sessionId: string;
  userId?: string;
  timestamp: string;
  environment?: "development" | "staging" | "production";
  metadata?: Record<string, any>;
}

/**
 * Phase execution options
 */
export interface PhaseOptions {
  timeout?: number;
  retries?: number;
  skipValidation?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}

/**
 * Orchestrator dependencies
 */
export interface OrchestratorDeps {
  mcpClient?: any;
  claudeService?: any;
  phaseManager?: any;
  sessionRepo?: any;
  nodeContextService?: any;
  /** Optional Anthropic client for Claude services */
  anthropicClient?: any;
}
