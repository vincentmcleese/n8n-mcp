/**
 * Session Manager for Supabase State Persistence
 *
 * Handles all session state operations with Supabase backend
 * Provides atomic operations, error recovery, and state compression
 */

import { createServerClient } from "../config/supabase";
import { loggers } from "../utils/logger";
import { PhaseManager } from "../phase-manager";
import type {
  WorkflowOperation,
  WorkflowSession,
  WorkflowPhase,
  DiscoveredNode,
  NodeConfiguration,
  ValidationResult,
  ClarificationRequest,
  ClarificationResponse,
} from "../../types/workflow";

/**
 * Session state structure in Supabase
 */
interface SupabaseSessionState {
  phase: WorkflowPhase;
  userPrompt: string;
  discovered: DiscoveredNode[];
  selected: string[];
  configured: Record<string, NodeConfiguration>;
  validated: Record<string, ValidationResult>;
  workflow: {
    nodes: any[];
    connections: any;
    settings: any;
  };
  seo?: import("../../types/seo").WorkflowSEOMetadata;
  buildPhases?: Array<{
    type: string;
    description: string;
    nodeIds: string[];
  }>;
  // Optional configuration analysis snapshot
  configAnalysis?: import("../../types/workflow").WorkflowConfigAnalysis;
  operationHistory: WorkflowOperation[];
  pendingClarifications: ClarificationRequest[];
  clarificationHistory: ClarificationResponse[];
  metadata?: {
    claudeTokensUsed?: number;
    operationCount?: number;
    lastError?: any;
  };
}

export class SessionManager {
  private readonly logger = loggers.orchestrator;
  private readonly supabase = createServerClient();

  // Batching configuration
  private pendingOperations = new Map<string, WorkflowOperation[]>();
  private lastSaveTime = new Map<string, number>();
  private readonly BATCH_SIZE = 10;
  private readonly SAVE_INTERVAL = 30000; // 30 seconds
  private saveTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Create a new session in Supabase (with upsert support)
   */
  async createSession(
    sessionId: string,
    initialPrompt: string,
    userId?: string
  ): Promise<WorkflowSession> {
    try {
      const initialState: SupabaseSessionState = {
        phase: "discovery",
        userPrompt: initialPrompt,
        discovered: [],
        selected: [],
        configured: {},
        validated: {},
        workflow: {
          nodes: [],
          connections: {},
          settings: {},
        },
        buildPhases: [], // Initialize empty array for build phases
        operationHistory: [],
        pendingClarifications: [],
        clarificationHistory: [],
        metadata: {
          operationCount: 0,
          claudeTokensUsed: 0,
        },
      };

      // Use upsert to handle duplicate key gracefully
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .upsert(
          {
            session_id: sessionId,
            user_prompt: initialPrompt,
            state: initialState,
            user_id: userId, // Add user_id for workflow ownership
          },
          {
            onConflict: "session_id",
            ignoreDuplicates: false, // Update if exists
          }
        )
        .select()
        .single();

      if (error) {
        this.logger.error("Failed to create/update session:", error);
        throw new Error(`Failed to create session: ${error.message}`);
      }

      this.logger.debug(`Created/updated session ${sessionId} in Supabase`);
      return this.convertToWorkflowSession(sessionId, data);
    } catch (error) {
      this.logger.error("Error creating session:", error);
      throw error;
    }
  }

  /**
   * Load an existing session from Supabase
   */
  async loadSession(sessionId: string): Promise<WorkflowSession | null> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No session found
          return null;
        }
        throw new Error(`Failed to load session: ${error.message}`);
      }

      this.logger.debug(`Loaded session ${sessionId} from Supabase`);
      return this.convertToWorkflowSession(sessionId, data);
    } catch (error) {
      this.logger.error("Error loading session:", error);
      throw error;
    }
  }

  /**
   * Queue operations for batch saving (hybrid approach)
   */
  async queueOperation(
    sessionId: string,
    operation: WorkflowOperation
  ): Promise<void> {
    // Initialize if needed
    if (!this.pendingOperations.has(sessionId)) {
      this.pendingOperations.set(sessionId, []);
      this.lastSaveTime.set(sessionId, Date.now());
    }

    // Add timestamp to operation for chronological narrative
    const enhancedOperation = {
      ...operation,
      timestamp: new Date().toISOString(),
    };

    // Add to queue
    const pending = this.pendingOperations.get(sessionId)!;
    pending.push(enhancedOperation);

    // Check if we should save
    const shouldSave =
      this.isPhaseTransition(operation) ||
      this.isCriticalOperation(operation) ||
      pending.length >= this.BATCH_SIZE ||
      this.isTimeToSave(sessionId);

    if (shouldSave) {
      await this.flush(sessionId);
    } else {
      // Set up auto-save timer
      this.scheduleAutoSave(sessionId);
    }
  }

  /**
   * Force save all pending operations
   */
  async flush(sessionId: string): Promise<void> {
    const pending = this.pendingOperations.get(sessionId);
    if (!pending || pending.length === 0) return;

    // Clear any existing timer
    this.clearAutoSave(sessionId);

    try {
      // Save the batch
      await this.updateSession(sessionId, pending);

      // Clear pending and update last save time
      this.pendingOperations.set(sessionId, []);
      this.lastSaveTime.set(sessionId, Date.now());

      this.logger.debug(
        `Flushed ${pending.length} operations for session ${sessionId}`
      );
    } catch (error) {
      this.logger.error("Error flushing operations:", error);
      // Keep operations in queue for retry
      throw error;
    }
  }

  /**
   * Public helper to immediately apply and persist a list of operations
   * Used by API routes that need synchronous state updates (e.g., SEO)
   */
  async applyOperations(
    sessionId: string,
    operations: WorkflowOperation[]
  ): Promise<void> {
    // Bypass batching: apply and persist now
    await this.updateSession(sessionId, operations);
  }

  /**
   * Update session with new operations (delta-based)
   * Now used internally by flush()
   */
  private async updateSession(
    sessionId: string,
    operations: WorkflowOperation[]
  ): Promise<void> {
    try {
      // Load current state
      const { data: current, error: loadError } = await this.supabase
        .from("workflow_sessions")
        .select("state")
        .eq("session_id", sessionId)
        .single();

      if (loadError) {
        throw new Error(
          `Failed to load session for update: ${loadError.message}`
        );
      }

      // Apply operations to state
      const updatedState = this.applyOperationsToState(
        current.state as SupabaseSessionState,
        operations
      );

      // Save updated state
      const { error: updateError } = await this.supabase
        .from("workflow_sessions")
        .update({
          state: updatedState,
          operations: updatedState.operationHistory, // Mirror operations for chronological narrative
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);

      if (updateError) {
        throw new Error(`Failed to update session: ${updateError.message}`);
      }

      this.logger.debug(
        `Updated session ${sessionId} with ${operations.length} operations`
      );
    } catch (error) {
      this.logger.error("Error updating session:", error);
      throw error;
    }
  }

  /**
   * Save complete session state (full replacement)
   */
  async saveSession(session: WorkflowSession): Promise<void> {
    try {
      const state: SupabaseSessionState = {
        phase: session.state.phase,
        userPrompt: session.state.userPrompt,
        discovered: session.state.discovered,
        selected: session.state.selected,
        configured: this.mapToRecord(session.state.configured),
        validated: this.mapToRecord(session.state.validated),
        workflow: session.state.workflow,
        operationHistory: session.state.operationHistory,
        pendingClarifications: session.state.pendingClarifications,
        clarificationHistory: session.state.clarificationHistory,
        metadata: {
          operationCount: session.state.operationHistory.length,
        },
      };

      const { error } = await this.supabase.from("workflow_sessions").upsert({
        session_id: session.sessionId,
        state,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw new Error(`Failed to save session: ${error.message}`);
      }

      this.logger.debug(`Saved complete session ${session.sessionId}`);
    } catch (error) {
      this.logger.error("Error saving session:", error);
      throw error;
    }
  }

  /**
   * Get session operation history
   */
  async getSessionHistory(sessionId: string): Promise<WorkflowOperation[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .select("state")
        .eq("session_id", sessionId)
        .single();

      if (error) {
        throw new Error(`Failed to get session history: ${error.message}`);
      }

      const state = data.state as SupabaseSessionState;
      return state.operationHistory || [];
    } catch (error) {
      this.logger.error("Error getting session history:", error);
      throw error;
    }
  }

  /**
   * Update session metadata (tokens used, error states, etc)
   */
  async updateMetadata(
    sessionId: string,
    metadata: Partial<SupabaseSessionState["metadata"]>
  ): Promise<void> {
    try {
      const { data: current, error: loadError } = await this.supabase
        .from("workflow_sessions")
        .select("state")
        .eq("session_id", sessionId)
        .single();

      if (loadError) {
        throw new Error(`Failed to load session: ${loadError.message}`);
      }

      const state = current.state as SupabaseSessionState;
      state.metadata = { ...state.metadata, ...metadata };

      const { error: updateError } = await this.supabase
        .from("workflow_sessions")
        .update({
          state,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);

      if (updateError) {
        throw new Error(`Failed to update metadata: ${updateError.message}`);
      }
    } catch (error) {
      this.logger.error("Error updating metadata:", error);
      throw error;
    }
  }

  /**
   * Archive a completed session
   */
  async archiveSession(sessionId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("workflow_sessions")
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);

      if (error) {
        throw new Error(`Failed to archive session: ${error.message}`);
      }

      this.logger.debug(`Archived session ${sessionId}`);
    } catch (error) {
      this.logger.error("Error archiving session:", error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions (older than 24 hours)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() - 24);

      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .delete()
        .lt("updated_at", expiryDate.toISOString())
        .eq("archived", false)
        .select("session_id");

      if (error) {
        throw new Error(`Failed to cleanup sessions: ${error.message}`);
      }

      const count = data?.length || 0;
      this.logger.debug(`Cleaned up ${count} expired sessions`);
      return count;
    } catch (error) {
      this.logger.error("Error cleaning up sessions:", error);
      throw error;
    }
  }

  /**
   * Clean up session resources (timers, pending operations)
   */
  async cleanupSession(sessionId: string): Promise<void> {
    // Flush any pending operations
    await this.flush(sessionId);

    // Clear resources
    this.clearAutoSave(sessionId);
    this.pendingOperations.delete(sessionId);
    this.lastSaveTime.delete(sessionId);
  }

  /**
   * Check if operation is a phase transition
   */
  private isPhaseTransition(operation: WorkflowOperation): boolean {
    return operation.type === "setPhase" || operation.type === "completePhase";
  }

  /**
   * Check if operation is critical (should save immediately)
   */
  private isCriticalOperation(operation: WorkflowOperation): boolean {
    return (
      operation.type === "requestClarification" ||
      operation.type === "clarificationResponse" ||
      operation.type === "addToWorkflow" ||
      operation.type === "configureNode" ||
      operation.type === "addConnection"
    );
  }

  /**
   * Check if node configuration is complete
   */
  private isNodeFullyConfigured(operation: any): boolean {
    // Save when a node has all required fields configured
    const config = operation.config;
    return (
      config &&
      Object.keys(config).length > 2 &&
      (config.resource || config.operation || config.httpMethod)
    );
  }

  /**
   * Check if enough time has passed for auto-save
   */
  private isTimeToSave(sessionId: string): boolean {
    const lastSave = this.lastSaveTime.get(sessionId) || 0;
    return Date.now() - lastSave > this.SAVE_INTERVAL;
  }

  /**
   * Schedule auto-save timer
   */
  private scheduleAutoSave(sessionId: string): void {
    // Clear existing timer
    this.clearAutoSave(sessionId);

    // Set new timer
    const timer = setTimeout(async () => {
      this.logger.debug(`Auto-saving session ${sessionId}`);
      try {
        await this.flush(sessionId);
      } catch (error) {
        this.logger.error("Auto-save failed:", error);
      }
    }, this.SAVE_INTERVAL);

    this.saveTimers.set(sessionId, timer);
  }

  /**
   * Clear auto-save timer
   */
  private clearAutoSave(sessionId: string): void {
    const timer = this.saveTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(sessionId);
    }
  }

  /**
   * Apply operations to state (delta architecture)
   */
  private applyOperationsToState(
    state: SupabaseSessionState,
    operations: WorkflowOperation[]
  ): SupabaseSessionState {
    const updatedState = { ...state };

    for (const op of operations) {
      // Add to history
      updatedState.operationHistory.push(op);

      // Apply operation based on type
      switch (op.type) {
        case "discoverNode":
          updatedState.discovered.push(op.node);
          break;

        case "selectNode":
          if (!updatedState.selected.includes(op.nodeId)) {
            updatedState.selected.push(op.nodeId);
          }
          break;

        case "deselectNode":
          updatedState.selected = updatedState.selected.filter(
            (id) => id !== op.nodeId
          );
          break;

        case "configureNode":
          updatedState.configured[op.nodeId] = {
            nodeId: op.nodeId,
            nodeType: op.nodeType || "", // Use nodeType from operation, fallback to empty
            parameters: op.config,
          };
          break;

        case "validateNode":
          updatedState.validated[op.nodeId] = op.result;
          break;

        case "setPhase":
          updatedState.phase = op.phase;
          break;

        case "completePhase":
          // Use PhaseManager to get the next phase
          const phaseManager = new PhaseManager();
          const nextPhase = phaseManager.getNextPhase(updatedState.phase);
          if (nextPhase) {
            updatedState.phase = nextPhase;
          }
          break;

        case "requestClarification":
          updatedState.pendingClarifications.push({
            questionId: op.questionId,
            question: op.question,
            context: op.context,
            timestamp: new Date(),
          });
          break;

        case "clarificationResponse":
          // Move from pending to history
          const clarification = updatedState.pendingClarifications.find(
            (c) => c.questionId === op.questionId
          );
          if (clarification) {
            updatedState.clarificationHistory.push({
              questionId: op.questionId,
              question: clarification.question,
              response: op.response,
              timestamp: new Date(),
            });
            updatedState.pendingClarifications =
              updatedState.pendingClarifications.filter(
                (c) => c.questionId !== op.questionId
              );
          }
          break;

        case "setUserPrompt":
          // Preserve initial prompt if not already stored
          if (!updatedState.metadata) updatedState.metadata = {} as any;
          if (
            !(updatedState as any).metadata.initialPrompt &&
            updatedState.userPrompt
          ) {
            (updatedState as any).metadata.initialPrompt =
              updatedState.userPrompt;
          }
          updatedState.userPrompt = op.prompt;
          break;

        case "setWorkflow":
          updatedState.workflow = op.workflow;
          break;

        case "setBuildPhases":
          updatedState.buildPhases = op.phases;
          this.logger.info(
            `📊 SESSION: Saving ${
              op.phases?.length || 0
            } build phases to session state`
          );
          this.logger.debug(
            `📊 SESSION: Build phases content:`,
            JSON.stringify(op.phases, null, 2)
          );
          break;

        case "setSEOMetadata":
          updatedState.seo = op.seo;
          this.logger.info(
            `🔍 SESSION: Saving SEO metadata with slug: ${op.seo.slug}`
          );
          break;

        case "setConfigAnalysis":
          updatedState.configAnalysis = op.analysis;
          this.logger.info(
            `📋 SESSION: Saving configuration analysis - ${op.analysis.configuredNodes}/${op.analysis.totalNodes} nodes configured`
          );
          break;

        // Add more operation types as needed
      }
    }

    // Update metadata
    updatedState.metadata = {
      ...updatedState.metadata,
      operationCount: updatedState.operationHistory.length,
    };

    return updatedState;
  }

  /**
   * Convert Supabase data to WorkflowSession
   */
  private convertToWorkflowSession(
    sessionId: string,
    data: any
  ): WorkflowSession {
    const state = data.state as SupabaseSessionState;

    return {
      sessionId,
      createdAt: new Date(data.created_at),
      state: {
        phase: state.phase,
        userPrompt: state.userPrompt,
        discovered: state.discovered,
        selected: state.selected,
        configured: this.recordToMap(state.configured),
        validated: this.recordToMap(state.validated),
        workflow: state.workflow,
        seo: state.seo,
        buildPhases: state.buildPhases, // Include build phases from session state
        configAnalysis: (state as any).configAnalysis,
        operationHistory: state.operationHistory,
        pendingClarifications: state.pendingClarifications,
        clarificationHistory: state.clarificationHistory,
      },
    };
  }

  /**
   * Convert Map to Record for JSON storage
   */
  private mapToRecord<T>(map: Map<string, T>): Record<string, T> {
    const record: Record<string, T> = {};
    map.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  /**
   * Convert Record to Map from JSON storage
   */
  private recordToMap<T>(record: Record<string, T>): Map<string, T> {
    const map = new Map<string, T>();
    Object.entries(record).forEach(([key, value]) => {
      map.set(key, value);
    });
    return map;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
