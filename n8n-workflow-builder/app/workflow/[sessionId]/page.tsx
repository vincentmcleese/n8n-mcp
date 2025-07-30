'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '../components/LoadingState';
import { ErrorDisplay } from '../components/ErrorDisplay';

interface WorkflowSessionPageProps {
  params: {
    sessionId: string;
  };
}

/**
 * Simplified workflow builder page
 * Automatically builds workflow on mount
 */
export default function WorkflowSessionPage({ params }: WorkflowSessionPageProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    buildWorkflow();
  }, []);

  const buildWorkflow = async () => {
    try {
      // Step 1: Check session exists
      const sessionResponse = await fetch(`/api/workflow/${params.sessionId}/state`);
      if (!sessionResponse.ok) {
        throw new Error('Session not found');
      }

      // Step 2: Discovery
      setLoadingMessage('Discovering relevant nodes...');
      const discoverResponse = await fetch(`/api/workflow/${params.sessionId}/discover`, {
        method: 'POST'
      });
      
      if (!discoverResponse.ok) {
        const errorData = await discoverResponse.json();
        throw new Error(errorData.message || 'Discovery failed');
      }

      // Step 3: Configuration
      setLoadingMessage('Configuring workflow nodes...');
      const configResponse = await fetch(`/api/workflow/${params.sessionId}/configure`, {
        method: 'POST'
      });
      
      if (!configResponse.ok) {
        const errorData = await configResponse.json();
        throw new Error(errorData.message || 'Configuration failed');
      }

      // Step 4: Validation
      setLoadingMessage('Validating workflow...');
      const validateResponse = await fetch(`/api/workflow/${params.sessionId}/validate`, {
        method: 'POST'
      });
      
      if (!validateResponse.ok) {
        const errorData = await validateResponse.json();
        throw new Error(errorData.message || 'Validation failed');
      }

      // Step 5: Building
      setLoadingMessage('Building workflow connections...');
      const buildResponse = await fetch(`/api/workflow/${params.sessionId}/build`, {
        method: 'POST'
      });
      
      if (!buildResponse.ok) {
        const errorData = await buildResponse.json();
        throw new Error(errorData.message || 'Building failed');
      }

      // Success - navigate to result
      router.push(`/workflow/${params.sessionId}/result`);
      
    } catch (error) {
      console.error('Workflow building error:', error);
      setError({
        message: error instanceof Error ? error.message : 'Failed to build workflow',
        retryable: true
      });
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    buildWorkflow();
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border p-8 max-w-md">
          <ErrorDisplay
            error={{
              type: 'workflow',
              code: 'BUILD_ERROR',
              message: error.message,
              userMessage: error.message,
              retryable: error.retryable
            }}
            onRetry={handleRetry}
            onDismiss={() => router.push('/')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border p-8">
        <LoadingState 
          phase="discovery"
          message={loadingMessage}
        />
      </div>
    </div>
  );
}