import { createServerClient } from '@/lib/config/supabase';
import type { 
  WorkflowSession, 
  WorkflowState, 
  WorkflowOperation
} from './types';
import { defaultWorkflowState } from './types';
import { nanoid } from 'nanoid';

export { defaultWorkflowState } from './types';

// Database client for workflow sessions
export class WorkflowDatabase {
  private supabase = createServerClient();
  
  /**
   * Generate a new session ID
   */
  generateSessionId(): string {
    return `sess_${nanoid(12)}`;
  }
  
  /**
   * Create a new workflow session
   */
  async createSession(userPrompt: string): Promise<WorkflowSession> {
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();
    
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .insert({
        session_id: sessionId,
        user_prompt: userPrompt,
        state: defaultWorkflowState,
        operations: [],
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession;
  }
  
  /**
   * Get a workflow session by session ID
   */
  async getSession(sessionId: string): Promise<WorkflowSession | null> {
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new Error(`Failed to get session: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession;
  }
  
  /**
   * Update workflow state
   */
  async updateState(sessionId: string, state: Partial<WorkflowState>): Promise<WorkflowSession> {
    // First get the current session
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Merge the state
    const newState = {
      ...session.state,
      ...state
    };
    
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .update({
        state: newState,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update state: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession;
  }
  
  /**
   * Add an operation to the history
   */
  async addOperation(
    sessionId: string, 
    operation: Omit<WorkflowOperation, 'index' | 'timestamp'>
  ): Promise<WorkflowSession> {
    // Get current session
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Create new operation with index and timestamp
    const newOperation: WorkflowOperation = {
      ...operation,
      index: session.operations.length + 1,
      timestamp: new Date().toISOString()
    };
    
    // Append to operations array
    const newOperations = [...session.operations, newOperation];
    
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .update({
        operations: newOperations,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to add operation: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession;
  }
  
  /**
   * Update both state and add an operation atomically
   */
  async updateStateWithOperation(
    sessionId: string,
    state: Partial<WorkflowState>,
    operation: Omit<WorkflowOperation, 'index' | 'timestamp'>
  ): Promise<WorkflowSession> {
    // Get current session
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Merge state
    const newState = {
      ...session.state,
      ...state
    };
    
    // Create new operation
    const newOperation: WorkflowOperation = {
      ...operation,
      index: session.operations.length + 1,
      timestamp: new Date().toISOString()
    };
    
    // Append to operations
    const newOperations = [...session.operations, newOperation];
    
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .update({
        state: newState,
        operations: newOperations,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update state with operation: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession;
  }
  
  /**
   * Mark a session as inactive
   */
  async deactivateSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('workflow_sessions')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);
    
    if (error) {
      throw new Error(`Failed to deactivate session: ${error.message}`);
    }
  }
  
  /**
   * Get all active sessions (for cleanup)
   */
  async getActiveSessions(): Promise<WorkflowSession[]> {
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to get active sessions: ${error.message}`);
    }
    
    return data as unknown as WorkflowSession[];
  }
  
  /**
   * Delete old inactive sessions (for cleanup)
   */
  async deleteOldSessions(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const { data, error } = await this.supabase
      .from('workflow_sessions')
      .delete()
      .eq('is_active', false)
      .lt('updated_at', cutoffDate.toISOString())
      .select('id');
    
    if (error) {
      throw new Error(`Failed to delete old sessions: ${error.message}`);
    }
    
    return data?.length || 0;
  }
  
  /**
   * Health check - verify database connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('workflow_sessions')
        .select('count')
        .limit(1);
      
      return !error;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const workflowDb = new WorkflowDatabase();