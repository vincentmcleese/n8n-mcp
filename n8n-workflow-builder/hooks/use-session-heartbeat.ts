import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { useWorkflowStore } from '@/lib/session-state';

/**
 * Session heartbeat hook
 * Keeps the session alive by updating the timestamp every 5 minutes
 * Integrates with the Zustand store for state management
 */
export function useSessionHeartbeat(sessionId: string | null) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { setError } = useWorkflowStore();

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const heartbeat = async () => {
      try {
        const supabase = createClient();
        
        const { error } = await supabase
          .from('workflow_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('session_id', sessionId)
          .eq('is_active', true);

        if (error) {
          console.error('Heartbeat error:', error);
          setError('Failed to maintain session connection');
        }
      } catch (error) {
        console.error('Heartbeat exception:', error);
        setError('Session connection lost');
      }
    };

    // Initial heartbeat
    heartbeat();

    // Set up interval (5 minutes)
    intervalRef.current = setInterval(heartbeat, 5 * 60 * 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, setError]);
}

/**
 * Enhanced session heartbeat with recovery
 * Includes automatic recovery attempts and state synchronization
 */
export function useEnhancedSessionHeartbeat(sessionId: string | null) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const { setError, updateFromServer } = useWorkflowStore();

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const heartbeatWithRecovery = async () => {
      try {
        const supabase = createClient();
        
        // Update timestamp and get current state
        const { data, error } = await supabase
          .from('workflow_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('session_id', sessionId)
          .eq('is_active', true)
          .select('state')
          .single();

        if (error) {
          throw error;
        }

        if (data?.state) {
          // Sync state from server
          const serverState = data.state;
          updateFromServer({
            phase: serverState.phase,
            discovered: serverState.discovered.length,
            configured: Object.keys(serverState.configured).length,
            validated: Object.keys(serverState.validated).length,
            pendingClarification: serverState.pendingClarifications?.[0],
          });
        }

        // Reset retry count on success
        retryCountRef.current = 0;
        setError(null);
        
      } catch (error) {
        console.error('Heartbeat error:', error);
        retryCountRef.current++;

        if (retryCountRef.current >= 3) {
          setError('Session connection lost. Please refresh the page.');
        } else {
          setError(`Connection unstable (retry ${retryCountRef.current}/3)`);
        }
      }
    };

    // Initial heartbeat
    heartbeatWithRecovery();

    // Set up interval (5 minutes)
    intervalRef.current = setInterval(heartbeatWithRecovery, 5 * 60 * 1000);

    // Also heartbeat on visibility change (when tab becomes active)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        heartbeatWithRecovery();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, setError, updateFromServer]);
}

/**
 * Hook to manually trigger a heartbeat
 * Useful for user actions that should extend the session
 */
export function useManualHeartbeat() {
  const { sessionId, setError } = useWorkflowStore(state => ({
    sessionId: state.sessionId,
    setError: state.setError,
  }));

  const triggerHeartbeat = async () => {
    if (!sessionId) {
      return { success: false, error: 'No active session' };
    }

    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from('workflow_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('is_active', true);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update session';
      setError(message);
      return { success: false, error: message };
    }
  };

  return { triggerHeartbeat };
}