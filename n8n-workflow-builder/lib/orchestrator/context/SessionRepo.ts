// lib/orchestrator/context/SessionRepo.ts

import { WorkflowSession, WorkflowPhase, WorkflowOperation } from "@/types/workflow";
import { orchestratorHooks } from "@/lib/workflow-orchestrator-hooks";
import { loggers } from "@/lib/utils/logger";

/**
 * Repository for workflow sessions
 * Wraps Supabase CRUD operations via orchestratorHooks
 */
export class SessionRepo {
  /**
   * Initialize a new session
   */
  async initialize(sessionId: string, prompt: string, userId?: string): Promise<void> {
    await orchestratorHooks.initializeSession(sessionId, prompt, userId);
  }

  /**
   * Load an existing session
   */
  async load(sessionId: string): Promise<WorkflowSession | null> {
    const session = await orchestratorHooks.loadSession(sessionId);
    if (session) {
      loggers.orchestrator.debug(
        `SessionRepo.load: Loaded session ${sessionId}, phase: ${session.state.phase}, configured count: ${Object.keys(session.state.configured || {}).length}`
      );
    } else {
      loggers.orchestrator.debug(`SessionRepo.load: No session found for ${sessionId}`);
    }
    return session;
  }

  /**
   * Save session state
   */
  async save(sessionId: string): Promise<void> {
    loggers.orchestrator.debug(`SessionRepo.save: Saving session ${sessionId}`);
    await orchestratorHooks.forceSave(sessionId);
    loggers.orchestrator.debug(`SessionRepo.save: Session ${sessionId} saved successfully`);
  }

  /**
   * Update session phase
   */
  async updatePhase(sessionId: string, phase: WorkflowPhase): Promise<void> {
    // This will be handled through operations
    const operations: WorkflowOperation[] = [
      { type: 'setPhase', phase }
    ];
    await orchestratorHooks.persistOperations(sessionId, operations);
  }

  /**
   * Persist operations
   */
  async persistOperations(sessionId: string, operations: WorkflowOperation[]): Promise<void> {
    await orchestratorHooks.persistOperations(sessionId, operations);
  }

  /**
   * Record error
   */
  async recordError(sessionId: string, error: unknown, phase: string): Promise<void> {
    await orchestratorHooks.recordError(sessionId, error, phase);
  }

  /**
   * Update token usage
   */
  async updateTokenUsage(sessionId: string, tokens: number): Promise<void> {
    await orchestratorHooks.updateTokenUsage(sessionId, tokens);
  }
}