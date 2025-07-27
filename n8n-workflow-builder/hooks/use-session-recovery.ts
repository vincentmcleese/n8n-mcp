import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { recoverSession, isSessionActive, restoreSessionState } from '@/lib/session-recovery';
import { useWorkflowStore } from '@/lib/session-state';

/**
 * Hook for session recovery functionality
 * Provides methods to check session status and attempt recovery
 */
export function useSessionRecovery() {
  const router = useRouter();
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  
  const { 
    setSessionId, 
    updateFromServer, 
    reset 
  } = useWorkflowStore();

  /**
   * Check if a session is still active
   */
  const checkSessionStatus = useCallback(async (sessionId: string) => {
    try {
      const active = await isSessionActive(sessionId);
      return active;
    } catch (error) {
      console.error('Failed to check session status:', error);
      return false;
    }
  }, []);

  /**
   * Attempt to recover an expired session
   */
  const attemptRecovery = useCallback(async (sessionId: string) => {
    setIsRecovering(true);
    setRecoveryError(null);

    try {
      // First, try to recover the session
      const recovered = await recoverSession(sessionId);
      
      if (!recovered) {
        throw new Error('Session recovery failed');
      }

      // If recovery successful, restore the state
      const restoredState = await restoreSessionState(sessionId);
      
      if (!restoredState) {
        throw new Error('Failed to restore session state');
      }

      // Update the store with recovered state
      setSessionId(sessionId);
      updateFromServer({
        phase: restoredState.phase,
        ...restoredState.stats,
        pendingClarification: restoredState.pendingClarifications?.[0],
      });

      setIsRecovering(false);
      return true;
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recovery failed';
      setRecoveryError(message);
      setIsRecovering(false);
      return false;
    }
  }, [setSessionId, updateFromServer]);

  /**
   * Handle session expiration
   */
  const handleSessionExpired = useCallback(() => {
    reset();
    router.push('/');
  }, [reset, router]);

  /**
   * Initialize session recovery on page load
   */
  const initializeRecovery = useCallback(async (sessionId: string) => {
    // First check if session is active
    const active = await checkSessionStatus(sessionId);
    
    if (active) {
      // Session is still active, just restore state
      const restoredState = await restoreSessionState(sessionId);
      if (restoredState) {
        setSessionId(sessionId);
        updateFromServer({
          phase: restoredState.phase,
          ...restoredState.stats,
          pendingClarification: restoredState.pendingClarifications?.[0],
        });
        return true;
      }
    } else {
      // Try to recover expired session
      const recovered = await attemptRecovery(sessionId);
      if (!recovered) {
        handleSessionExpired();
        return false;
      }
      return true;
    }
    
    return false;
  }, [checkSessionStatus, attemptRecovery, handleSessionExpired, setSessionId, updateFromServer]);

  return {
    isRecovering,
    recoveryError,
    checkSessionStatus,
    attemptRecovery,
    handleSessionExpired,
    initializeRecovery,
  };
}

/**
 * Hook for auto-recovery on mount
 * Automatically attempts to recover session when component mounts
 */
export function useAutoSessionRecovery(sessionId: string | null) {
  const { initializeRecovery } = useSessionRecovery();
  const [initialized, setInitialized] = useState(false);

  // Run recovery on mount
  useState(() => {
    if (sessionId && !initialized) {
      initializeRecovery(sessionId).then(() => {
        setInitialized(true);
      });
    }
  });

  return initialized;
}