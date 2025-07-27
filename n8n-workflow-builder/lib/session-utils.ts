import { nanoid } from 'nanoid';
import { createClient } from './supabase';
import type { 
  WorkflowSession, 
  WorkflowOperation,
  WorkflowPhase 
} from '@/types/workflow';

/**
 * Generates a unique session ID with timestamp and random component
 * Format: wf_{timestamp}_{random}
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = nanoid(10);
  return `wf_${timestamp}_${random}`;
}

/**
 * Parses a session ID to extract its components
 */
export function parseSessionId(sessionId: string) {
  const parts = sessionId.split('_');
  if (parts.length !== 3 || parts[0] !== 'wf') {
    throw new Error('Invalid session ID format');
  }
  
  return {
    prefix: parts[0],
    timestamp: parseInt(parts[1]),
    random: parts[2],
    createdAt: new Date(parseInt(parts[1])),
  };
}

/**
 * Creates a new workflow session in the database
 */
export async function createWorkflowSession(
  prompt: string, 
  metadata?: {
    name?: string;
    description?: string;
  }
) {
  const supabase = createClient();
  const sessionId = generateSessionId();
  const now = new Date().toISOString();
  
  // Initialize empty state following PRD structure
  const initialState = {
    phase: 'discovery' as WorkflowPhase,
    userPrompt: prompt,
    discovered: [],
    selected: [],
    configured: {},
    validated: {},
    workflow: {
      nodes: [],
      connections: [],
      settings: {
        name: metadata?.name || 'Untitled Workflow',
        executionOrder: 'v1',
        saveDataSuccessExecution: true,
      },
    },
    operationHistory: [],
    pendingClarifications: [],
    clarificationHistory: [],
  };

  const { data, error } = await supabase
    .from('workflow_sessions')
    .insert({
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      state: initialState,
      operations: [],
      user_prompt: prompt,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return {
    sessionId,
    createdAt: now,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
  };
}

/**
 * Retrieves a workflow session from the database
 */
export async function getWorkflowSession(sessionId: string): Promise<WorkflowSession | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('workflow_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    sessionId: data.session_id,
    createdAt: new Date(data.created_at),
    state: data.state,
  };
}

/**
 * Updates a workflow session with new operations
 * This is the core of the delta-based architecture
 */
export async function applyOperations(
  sessionId: string,
  operations: WorkflowOperation[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  
  try {
    // First, get the current session
    const { data: session, error: fetchError } = await supabase
      .from('workflow_sessions')
      .select('state, operations')
      .eq('session_id', sessionId)
      .single();

    if (fetchError || !session) {
      return { success: false, error: 'Session not found' };
    }

    // Apply operations to the state
    let newState = { ...session.state };
    const newOperations = [...(session.operations || []), ...operations];

    // Process each operation (simplified - full implementation would handle all operation types)
    for (const op of operations) {
      switch (op.type) {
        case 'setPhase':
          newState.phase = op.phase;
          break;
        case 'discoverNode':
          newState.discovered.push(op.node);
          break;
        case 'selectNode':
          if (!newState.selected.includes(op.nodeId)) {
            newState.selected.push(op.nodeId);
          }
          break;
        // Add more operation handlers as needed
      }
    }

    // Update the session with new state and operations
    const { error: updateError } = await supabase
      .from('workflow_sessions')
      .update({
        state: newState,
        operations: newOperations,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Marks a session as inactive (soft delete)
 */
export async function deactivateSession(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('workflow_sessions')
    .update({ 
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId);

  return !error;
}

/**
 * Extends the session timeout by updating the updated_at timestamp
 */
export async function extendSessionTimeout(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('workflow_sessions')
    .update({ 
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId);

  return !error;
}

/**
 * Gets session statistics for monitoring
 */
export async function getSessionStats(sessionId: string) {
  const session = await getWorkflowSession(sessionId);
  if (!session) return null;

  const state = session.state;
  return {
    phase: state.phase,
    stats: {
      discovered: state.discovered.length,
      selected: state.selected.length,
      configured: Object.keys(state.configured).length,
      validated: Object.keys(state.validated).length,
      operations: state.operationHistory.length,
    },
  };
}