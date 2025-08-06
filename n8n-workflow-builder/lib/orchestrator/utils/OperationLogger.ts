// lib/orchestrator/utils/OperationLogger.ts

import { WorkflowOperation, WorkflowPhase } from "@/types/workflow";
import { orchestratorHooks } from "@/lib/workflow-orchestrator-hooks";
import { loggers } from "@/lib/utils/logger";

export interface OperationMetadata {
  timestamp: Date;
  phase: WorkflowPhase;
  tokensUsed?: number;
  duration?: number;
  error?: string;
}

export interface EnhancedOperation extends WorkflowOperation {
  metadata?: OperationMetadata;
}

/**
 * Centralized operation logger that handles:
 * - Operation persistence via orchestratorHooks
 * - Metadata enrichment (timing, tokens, phase)
 * - Batching for performance
 * - Error context preservation
 */
export class OperationLogger {
  private pendingOperations: Map<string, EnhancedOperation[]> = new Map();
  private phaseStartTimes: Map<string, number> = new Map();

  constructor(
    private readonly sessionId: string,
    private readonly phase: WorkflowPhase
  ) {}

  /**
   * Start timing a phase
   */
  startPhase(): void {
    this.phaseStartTimes.set(this.phase, Date.now());
    loggers.orchestrator.debug(`Started timing ${this.phase} phase`);
  }

  /**
   * Log a single operation with metadata
   */
  async logOperation(
    operation: WorkflowOperation,
    metadata?: Partial<OperationMetadata>
  ): Promise<void> {
    const enhancedOp: EnhancedOperation = {
      ...operation,
      metadata: {
        timestamp: new Date(),
        phase: this.phase,
        ...metadata,
      },
    };

    // Add to pending batch
    const pending = this.pendingOperations.get(this.sessionId) || [];
    pending.push(enhancedOp);
    this.pendingOperations.set(this.sessionId, pending);

    loggers.orchestrator.debug(
      `Logged operation: ${operation.type} for phase: ${this.phase}`
    );

    // Persist immediately for critical operations
    if (this.isCriticalOperation(operation)) {
      await this.flush();
    }
  }

  /**
   * Log multiple operations as a batch
   */
  async logBatch(
    operations: WorkflowOperation[],
    metadata?: Partial<OperationMetadata>
  ): Promise<void> {
    const enhancedOps = operations.map((op) => ({
      ...op,
      metadata: {
        timestamp: new Date(),
        phase: this.phase,
        ...metadata,
      },
    }));

    const pending = this.pendingOperations.get(this.sessionId) || [];
    pending.push(...enhancedOps);
    this.pendingOperations.set(this.sessionId, pending);

    loggers.orchestrator.debug(
      `Logged batch of ${operations.length} operations for phase: ${this.phase}`
    );
  }

  /**
   * Log phase completion with timing
   */
  async logPhaseCompletion(tokensUsed?: number): Promise<void> {
    const startTime = this.phaseStartTimes.get(this.phase);
    const duration = startTime ? Date.now() - startTime : undefined;

    const completionOp: WorkflowOperation = {
      type: "completePhase",
      phase: this.phase,
    };

    await this.logOperation(completionOp, {
      duration,
      tokensUsed,
    });

    loggers.orchestrator.info(
      `Phase ${this.phase} completed in ${duration}ms${
        tokensUsed ? ` using ${tokensUsed} tokens` : ""
      }`
    );

    // Always flush on phase completion
    await this.flush();
  }

  /**
   * Log an error with context
   */
  async logError(error: Error, operation?: string): Promise<void> {
    const errorOp: WorkflowOperation = {
      type: "error",
      phase: this.phase,
      error: {
        message: error.message,
        operation,
        stack: error.stack,
      },
    } as any; // Extended operation type

    await this.logOperation(errorOp, {
      error: error.message,
    });

    // Always flush errors immediately
    await this.flush();
  }

  /**
   * Flush pending operations to persistence
   */
  async flush(): Promise<void> {
    const pending = this.pendingOperations.get(this.sessionId);
    if (!pending || pending.length === 0) return;

    try {
      // Extract base operations for persistence
      const baseOperations = pending.map(({ metadata, ...op }) => op);
      await orchestratorHooks.persistOperations(this.sessionId, baseOperations);

      // Update token usage if any operations have token data
      const totalTokens = pending.reduce(
        (sum, op) => sum + (op.metadata?.tokensUsed || 0),
        0
      );
      if (totalTokens > 0) {
        await orchestratorHooks.updateTokenUsage(this.sessionId, totalTokens);
      }

      loggers.orchestrator.debug(
        `Flushed ${pending.length} operations for session ${this.sessionId}`
      );

      // Clear pending after successful flush
      this.pendingOperations.set(this.sessionId, []);
    } catch (error) {
      loggers.orchestrator.error("Failed to flush operations:", error);
      // Don't clear pending on error - will retry on next flush
    }
  }

  /**
   * Determine if an operation is critical and should be persisted immediately
   */
  private isCriticalOperation(operation: WorkflowOperation): boolean {
    const criticalTypes = [
      "completePhase",
      "error",
      "requestClarification",
      "clarificationResponse",
    ];
    return criticalTypes.includes(operation.type);
  }

  /**
   * Create a logger instance with token tracking callback
   */
  withTokenTracking(): {
    logger: OperationLogger;
    onTokenUsage: (tokens: number) => void;
  } {
    let accumulatedTokens = 0;

    const onTokenUsage = (tokens: number) => {
      accumulatedTokens += tokens;
      loggers.orchestrator.debug(
        `Token usage: ${tokens} (total: ${accumulatedTokens})`
      );
    };

    // Return the same logger instance with the callback
    return {
      logger: this,
      onTokenUsage,
    };
  }
}