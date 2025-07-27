'use client';

import { useState, useEffect } from 'react';

export function useWorkflowSession(sessionId: string) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Implement session state fetching
    setLoading(false);
  }, [sessionId]);

  return { state, loading, error };
}