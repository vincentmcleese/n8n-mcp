import { createClient } from './supabase';
import { extendSessionTimeout, getWorkflowSession } from './session-utils';

/**
 * Attempts to recover an expired but active session
 * Returns true if recovery was successful
 */
export async function recoverSession(sessionId: string): Promise<boolean> {
  try {
    // First, check if the session exists
    const session = await getWorkflowSession(sessionId);
    if (!session) {
      return false;
    }

    const supabase = createClient();
    
    // Check if session is marked as active in the database
    const { data, error } = await supabase
      .from('workflow_sessions')
      .select('is_active, updated_at')
      .eq('session_id', sessionId)
      .single();

    if (error || !data || !data.is_active) {
      return false;
    }

    // Check if session is within recovery window (2 hours from last update)
    const lastUpdate = new Date(data.updated_at);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 2) {
      // Session is too old to recover
      return false;
    }

    // Extend the session timeout
    const extended = await extendSessionTimeout(sessionId);
    return extended;
  } catch (error) {
    console.error('Session recovery failed:', error);
    return false;
  }
}

/**
 * Checks if a session is still active and valid
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('workflow_sessions')
    .select('is_active, updated_at')
    .eq('session_id', sessionId)
    .single();

  if (error || !data || !data.is_active) {
    return false;
  }

  // Check if session has expired (1 hour timeout)
  const lastUpdate = new Date(data.updated_at);
  const now = new Date();
  const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

  return minutesSinceUpdate < 60;
}

/**
 * Attempts to restore session state in the client store
 */
export async function restoreSessionState(sessionId: string) {
  const session = await getWorkflowSession(sessionId);
  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    phase: session.state.phase,
    stats: {
      discovered: session.state.discovered.length,
      selected: session.state.selected.length,
      configured: Object.keys(session.state.configured).length,
      validated: Object.keys(session.state.validated).length,
    },
    pendingClarifications: session.state.pendingClarifications,
  };
}