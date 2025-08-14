/**
 * Workflow Orchestrator Hooks for Supabase State Persistence
 *
 * Provides integration points to persist state at key moments
 * without modifying the core orchestrator logic
 */

import { sessionManager } from "./services/session-manager";
import { loggers } from "./utils/logger";
import type { WorkflowOperation } from "../types/workflow";

export class WorkflowOrchestratorHooks {
  private readonly logger = loggers.orchestrator;
  private useSupabase: boolean = false;

  constructor() {
    // Check if we should use Supabase based on environment
    this.useSupabase = process.env.USE_SUPABASE_STATE === "true";

    if (this.useSupabase) {
      this.logger.info("Supabase state persistence enabled");
    } else {
      this.logger.info("Using in-memory state (Supabase disabled)");
    }
  }

  /**
   * Initialize session (create in Supabase if enabled)
   */
  async initializeSession(sessionId: string, prompt: string, userId?: string): Promise<void> {
    if (!this.useSupabase) return;

    try {
      // First check if session already exists
      const existingSession = await sessionManager.loadSession(sessionId);
      if (existingSession) {
        this.logger.debug(
          `Session ${sessionId} already exists, skipping creation`
        );
        return;
      }

      await sessionManager.createSession(sessionId, prompt, userId);
      this.logger.debug(`Initialized Supabase session: ${sessionId} for user: ${userId || 'anonymous'}`);
    } catch (error: any) {
      // Check if it's a duplicate key error
      if (error?.message?.includes("duplicate key")) {
        this.logger.debug(
          `Session ${sessionId} already exists (duplicate key), continuing...`
        );
        return;
      }
      this.logger.error("Failed to initialize Supabase session:", error);
      // Don't throw - allow fallback to in-memory
    }
  }

  /**
   * Queue operations for batch persistence
   */
  async persistOperations(
    sessionId: string,
    operations: WorkflowOperation[]
  ): Promise<void> {
    if (!this.useSupabase || operations.length === 0) return;

    try {
      // Queue each operation for batching
      for (const operation of operations) {
        await sessionManager.queueOperation(sessionId, operation);
      }

      this.logger.debug(
        `Queued ${operations.length} operations for persistence`
      );
    } catch (error) {
      this.logger.error("Failed to queue operations:", error);
      // Don't throw - continue with in-memory state
    }
  }

  /**
   * Force save any pending operations (e.g., at phase completion)
   */
  async forceSave(sessionId: string): Promise<void> {
    if (!this.useSupabase) return;

    try {
      await sessionManager.flush(sessionId);
      this.logger.debug(`Force saved session: ${sessionId}`);
    } catch (error) {
      this.logger.error("Failed to force save:", error);
    }
  }

  /**
   * Load session from Supabase if it exists
   */
  async loadSession(sessionId: string): Promise<any | null> {
    if (!this.useSupabase) return null;

    try {
      const session = await sessionManager.loadSession(sessionId);
      if (session) {
        this.logger.debug(`Loaded session from Supabase: ${sessionId}`);
        return session;
      }
    } catch (error) {
      this.logger.error("Failed to load session from Supabase:", error);
    }

    return null;
  }

  /**
   * Update Claude token usage
   */
  async updateTokenUsage(
    sessionId: string,
    tokensUsed: number,
    phase?: string,
    method?: string
  ): Promise<void> {
    if (!this.useSupabase) {
      // Still track in memory for reporting
      try {
        const session = await sessionManager.loadSession(sessionId);
        if (session?.state) {
          // Initialize tokenUsage if not exists
          if (!session.state.tokenUsage) {
            session.state.tokenUsage = {
              byPhase: {},
              byCalls: [],
              total: 0,
            };
          }

          // Update phase totals
          if (phase) {
            session.state.tokenUsage.byPhase[phase] =
              (session.state.tokenUsage.byPhase[phase] || 0) + tokensUsed;
          }

          // Add call detail
          if (phase && method) {
            session.state.tokenUsage.byCalls.push({
              phase,
              method,
              tokens: tokensUsed,
              timestamp: new Date().toISOString(),
            });
          }

          // Update total
          session.state.tokenUsage.total += tokensUsed;
        }
      } catch (error) {
        this.logger.error("Failed to update in-memory token usage:", error);
      }
      return;
    }

    try {
      // Get current session state
      const session = await sessionManager.loadSession(sessionId);
      if (!session?.state) return;

      // Initialize tokenUsage if not exists
      if (!session.state.tokenUsage) {
        session.state.tokenUsage = {
          byPhase: {},
          byCalls: [],
          total: 0,
        };
      }

      // Update phase totals
      if (phase) {
        session.state.tokenUsage.byPhase[phase] =
          (session.state.tokenUsage.byPhase[phase] || 0) + tokensUsed;
      }

      // Add call detail
      if (phase && method) {
        session.state.tokenUsage.byCalls.push({
          phase,
          method,
          tokens: tokensUsed,
          timestamp: new Date().toISOString(),
        });
      }

      // Update total
      session.state.tokenUsage.total += tokensUsed;

      // Save updated state
      await sessionManager.updateMetadata(sessionId, {
        claudeTokensUsed: session.state.tokenUsage.total,
      });
    } catch (error) {
      this.logger.error("Failed to update token usage:", error);
    }
  }

  /**
   * Record error state
   */
  async recordError(
    sessionId: string,
    error: any,
    phase: string
  ): Promise<void> {
    if (!this.useSupabase) return;

    try {
      await sessionManager.updateMetadata(sessionId, {
        lastError: {
          message: error.message || String(error),
          phase,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (updateError) {
      this.logger.error("Failed to record error state:", updateError);
    }
  }

  /**
   * Archive completed session
   */
  async archiveSession(sessionId: string): Promise<void> {
    if (!this.useSupabase) return;

    try {
      // Ensure all operations are saved before archiving
      await sessionManager.flush(sessionId);
      await sessionManager.archiveSession(sessionId);
      await sessionManager.cleanupSession(sessionId);
      this.logger.debug(`Archived and cleaned up session: ${sessionId}`);
    } catch (error) {
      this.logger.error("Failed to archive session:", error);
    }
  }

  /**
   * Check if we should use Supabase
   */
  isEnabled(): boolean {
    return this.useSupabase;
  }

  /**
   * Enable/disable Supabase state (for testing)
   */
  setEnabled(enabled: boolean): void {
    this.useSupabase = enabled;
    this.logger.info(
      enabled ? "Supabase state enabled" : "Supabase state disabled"
    );
  }
}

// Export singleton instance
export const orchestratorHooks = new WorkflowOrchestratorHooks();
