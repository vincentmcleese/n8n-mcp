// lib/orchestrator/utils/wrapPhase.ts

import { WorkflowPhase, ErrorResponse } from "@/types/workflow";
import { OperationLogger } from "./OperationLogger";
import { SessionRepo } from "@/lib/orchestrator/context/SessionRepo";
import { loggers } from "@/lib/utils/logger";

export interface PhaseContext {
  sessionId: string;
  phase: WorkflowPhase;
  operationLogger: OperationLogger;
  sessionRepo: SessionRepo;
}

export interface PhaseResult<T> {
  success: boolean;
  phase: WorkflowPhase;
  error?: ErrorResponse["error"];
  [key: string]: any; // Allow phase-specific properties
}

export interface PhaseError extends Error {
  phase: WorkflowPhase;
  operation?: string;
  retryable?: boolean;
  userMessage?: string;
}

/**
 * Maps error types to user-friendly messages and retry strategies
 */
const ERROR_MAPPINGS: Record<
  string,
  { userMessage: string; retryable: boolean }
> = {
  // Claude API errors
  ECONNREFUSED: {
    userMessage: "Unable to connect to AI service. Please try again.",
    retryable: true,
  },
  ETIMEDOUT: {
    userMessage: "Request timed out. Please try again.",
    retryable: true,
  },
  "429": {
    userMessage: "Rate limit exceeded. Please wait a moment and try again.",
    retryable: true,
  },
  "500": {
    userMessage: "Service temporarily unavailable. Please try again.",
    retryable: true,
  },

  // Validation errors
  NO_NODES_SELECTED: {
    userMessage: "Please select nodes before proceeding to configuration.",
    retryable: false,
  },
  NO_WORKFLOW: {
    userMessage: "No workflow found. Please complete previous phases first.",
    retryable: false,
  },

  // Default
  DEFAULT: {
    userMessage: "An unexpected error occurred. Please try again.",
    retryable: true,
  },
};

/**
 * Higher-order function that wraps phase runner methods with:
 * - Automatic error catching and conversion to ErrorResponse
 * - Operation logging with error context
 * - Error recording in Supabase
 * - Timing and metrics
 */
export function wrapPhase<TInput, TOutput extends PhaseResult<any>>(
  phaseName: WorkflowPhase,
  runMethod: (input: TInput, context: PhaseContext) => Promise<TOutput>
) {
  return async function wrappedRun(
    this: any,
    input: TInput & { sessionId: string }
  ): Promise<TOutput> {
    const { sessionId } = input;
    const startTime = Date.now();

    // Create phase context
    const operationLogger = new OperationLogger(sessionId, phaseName);
    const sessionRepo = this.deps?.sessionRepo || new SessionRepo();

    const context: PhaseContext = {
      sessionId,
      phase: phaseName,
      operationLogger,
      sessionRepo,
    };

    // Start phase timing
    operationLogger.startPhase();

    try {
      loggers.orchestrator.info(
        `Starting ${phaseName} phase for session ${sessionId}`
      );

      // Call the actual phase implementation
      const result = await runMethod.call(this, input, context);

      // CRITICAL: Persist operations before returning to ensure they're available for next phase
      // This fixes the race condition where operations weren't being saved between phases
      if (result.success && result.operations && result.operations.length > 0) {
        loggers.orchestrator.debug(
          `Persisting ${result.operations.length} operations from ${phaseName} phase`
        );
        await sessionRepo.persistOperations(sessionId, result.operations);
        await sessionRepo.save(sessionId); // Force flush to ensure operations are saved
        loggers.orchestrator.debug(
          `Successfully persisted operations for ${phaseName} phase`
        );
      }

      // Log successful completion
      const duration = Date.now() - startTime;
      loggers.orchestrator.info(
        `${phaseName} phase completed successfully in ${duration}ms`
      );

      return result;
    } catch (error) {
      // Handle and transform errors
      const phaseError = normalizeError(error, phaseName);
      const errorResponse = createErrorResponse(phaseError);

      // Log error details
      loggers.orchestrator.error(`${phaseName} phase failed:`, {
        error: phaseError.message,
        stack: phaseError.stack,
        duration: Date.now() - startTime,
      });

      // Record error in operation log and Supabase
      await operationLogger.logError(phaseError, phaseName);
      await sessionRepo.recordError(sessionId, phaseError, phaseName);

      // Ensure we flush any pending operations before returning
      await operationLogger.flush();

      // Return error result in expected format
      return {
        success: false,
        phase: phaseName,
        error: errorResponse,
        ...getPhaseSpecificDefaults(phaseName),
      } as TOutput;
    }
  };
}

/**
 * Normalize various error types into PhaseError
 */
function normalizeError(error: unknown, phase: WorkflowPhase): PhaseError {
  if (error instanceof Error) {
    const phaseError = error as PhaseError;
    phaseError.phase = phase;
    return phaseError;
  }

  // Handle non-Error objects
  const phaseError = new Error(String(error)) as PhaseError;
  phaseError.phase = phase;
  return phaseError;
}

/**
 * Create standardized ErrorResponse from PhaseError
 */
function createErrorResponse(error: PhaseError): ErrorResponse["error"] {
  // Check for specific error patterns
  let errorMapping = ERROR_MAPPINGS.DEFAULT;

  // Check error message for patterns
  if (error.message.includes("ECONNREFUSED")) {
    errorMapping = ERROR_MAPPINGS.ECONNREFUSED;
  } else if (error.message.includes("ETIMEDOUT")) {
    errorMapping = ERROR_MAPPINGS.ETIMEDOUT;
  } else if (
    error.message.includes("429") ||
    error.message.includes("rate limit")
  ) {
    errorMapping = ERROR_MAPPINGS["429"];
  } else if (
    error.message.includes("500") ||
    error.message.includes("Internal Server Error")
  ) {
    errorMapping = ERROR_MAPPINGS["500"];
  } else if (ERROR_MAPPINGS[error.message]) {
    errorMapping = ERROR_MAPPINGS[error.message];
  }

  return {
    type: determineErrorType(error),
    code: extractErrorCode(error),
    message: error.message,
    userMessage: error.userMessage || errorMapping.userMessage,
    retryable:
      error.retryable !== undefined ? error.retryable : errorMapping.retryable,
  };
}

/**
 * Determine error type from error details
 */
function determineErrorType(error: PhaseError): ErrorResponse["error"]["type"] {
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("claude") || msg.includes("anthropic")) return "claude_api";
  if (
    msg.includes("validation") ||
    msg.includes("invalid") ||
    msg.includes("validate")
  )
    return "validation";
  if (
    msg.includes("mcp") ||
    msg.includes("tool") ||
    msg.includes("context7") ||
    msg.includes("node schema")
  )
    return "mcp_server";
  if (
    msg.includes("database") ||
    msg.includes("supabase") ||
    msg.includes("db")
  )
    return "database";
  return "client";
}

/**
 * Extract error code from error message or use default
 */
function extractErrorCode(error: PhaseError): string {
  // Look for common error code patterns
  const codeMatch = error.message.match(
    /\b([A-Z_]+_ERROR|[A-Z_]+_FAILED|NO_[A-Z_]+)\b/
  );
  if (codeMatch) {
    return codeMatch[1];
  }

  // Generate code from phase
  return `${error.phase.toUpperCase()}_ERROR`;
}

/**
 * Get phase-specific default values for error responses
 */
function getPhaseSpecificDefaults(phase: WorkflowPhase): Record<string, any> {
  switch (phase) {
    case "discovery":
      return {
        operations: [],
        discoveredNodes: [],
        selectedNodeIds: [],
      };
    case "configuration":
      return {
        operations: [],
        configured: [],
      };
    case "building":
      return {
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
      };
    case "validation":
      return {
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        validationReport: {},
      };
    case "documentation":
      return {
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        operations: [],
      };
    default:
      return {};
  }
}

/**
 * Utility to create a phase error with proper context
 */
export function createPhaseError(
  message: string,
  phase: WorkflowPhase,
  options?: {
    operation?: string;
    retryable?: boolean;
    userMessage?: string;
    cause?: Error;
  }
): PhaseError {
  const error = new Error(message) as PhaseError;
  error.phase = phase;

  if (options) {
    Object.assign(error, options);
    if (options.cause) {
      error.stack = `${error.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  return error;
}
