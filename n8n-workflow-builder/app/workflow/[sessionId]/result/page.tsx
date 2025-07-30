'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkflowResult } from '../../components/WorkflowResult';
import { LoadingState } from '../../components/LoadingState';
import { ErrorDisplay } from '../../components/ErrorDisplay';
import type { ExportWorkflowResponse, ErrorResponse } from '@/types/workflow';

interface WorkflowResultPageProps {
  params: {
    sessionId: string;
  };
}

/**
 * Dedicated result page for displaying completed workflows
 * Following Context7 React best practices with TypeScript and user experience focus
 */
export default function WorkflowResultPage({ params }: WorkflowResultPageProps) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<any>(null);
  const [tokenSavings, setTokenSavings] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorResponse['error'] | null>(null);

  /**
   * Fetch workflow export data
   */
  const fetchWorkflowResult = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workflow/${params.sessionId}/export`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError({
            type: 'session',
            code: 'SESSION_NOT_FOUND',
            message: 'Workflow session not found',
            userMessage: 'The workflow you\'re looking for doesn\'t exist or has expired.',
            retryable: false,
            suggestion: 'Try creating a new workflow from the home page.'
          });
          return;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error?.userMessage || 'Failed to load workflow');
      }

      const data: ExportWorkflowResponse = await response.json();
      
      setWorkflow(data.workflow);
      setMetadata(data.metadata);
      
      // Parse token savings if available
      if (data.metadata.tokensSaved) {
        try {
          const savings = typeof data.metadata.tokensSaved === 'string' 
            ? JSON.parse(data.metadata.tokensSaved)
            : data.metadata.tokensSaved;
          setTokenSavings(savings);
        } catch (parseError) {
          console.warn('Failed to parse token savings:', parseError);
        }
      }
      
    } catch (error) {
      console.error('Failed to fetch workflow result:', error);
      setError({
        type: 'network',
        code: 'FETCH_RESULT_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'Failed to load workflow result. Please try again.',
        retryable: true,
        suggestion: 'Check your connection and refresh the page.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle navigation back to builder
   */
  const handleBackToBuilder = () => {
    router.push(`/workflow/${params.sessionId}`);
  };

  /**
   * Handle navigation to home
   */
  const handleGoHome = () => {
    router.push('/');
  };

  /**
   * Handle error retry
   */
  const handleRetry = () => {
    fetchWorkflowResult();
  };

  /**
   * Handle error dismissal
   */
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Load workflow result on mount
  useEffect(() => {
    fetchWorkflowResult();
  }, [params.sessionId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-2xl mx-auto px-4">
          <LoadingState 
            phase="complete" 
            message="Loading your completed workflow..."
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8 max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="outline"
              onClick={handleGoHome}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
            <div className="h-6 w-px bg-gray-300" />
            <h1 className="text-2xl font-bold text-gray-900">
              Workflow Result
            </h1>
          </div>

          {/* Error display */}
          <ErrorDisplay
            error={error}
            onRetry={error.retryable ? handleRetry : undefined}
            onDismiss={handleErrorDismiss}
            showDetails={process.env.NODE_ENV === 'development'}
          />

          {/* Action buttons for error state */}
          {!error.retryable && (
            <div className="text-center mt-8">
              <Button onClick={handleGoHome} className="mr-4">
                <Home className="w-4 h-4 mr-2" />
                Create New Workflow
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8 max-w-4xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              No Workflow Found
            </h1>
            <p className="text-gray-600 mb-6">
              This workflow session doesn't have a completed workflow yet.
            </p>
            <div className="space-x-4">
              <Button onClick={handleBackToBuilder} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Builder
              </Button>
              <Button onClick={handleGoHome}>
                <Home className="w-4 h-4 mr-2" />
                Create New Workflow
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 max-w-4xl">
        {/* Header with navigation */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleBackToBuilder}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Builder
            </Button>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Your n8n Workflow
              </h1>
              <p className="text-gray-600 text-sm">
                Session: {params.sessionId}
              </p>
            </div>
          </div>
          
          <Button onClick={handleGoHome} variant="outline">
            <Home className="w-4 h-4 mr-2" />
            Create New Workflow
          </Button>
        </div>

        {/* Workflow result component */}
        <WorkflowResult
          workflow={workflow}
          sessionId={params.sessionId}
          tokenSavings={tokenSavings}
        />

        {/* Additional metadata */}
        {metadata && (
          <div className="mt-8 bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Session Information
            </h3>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="font-medium text-gray-700">Created:</dt>
                <dd className="text-gray-900">
                  {new Date(metadata.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-700">Operations:</dt>
                <dd className="text-gray-900">
                  {metadata.operationCount} delta operations
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-700">Efficiency:</dt>
                <dd className="text-gray-900">
                  {tokenSavings ? `${tokenSavings.percentage}% token reduction` : 'Optimized with delta architecture'}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Next steps */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">
            What's next?
          </h3>
          <ul className="text-sm text-blue-700 space-y-1 ml-4 list-disc">
            <li>Import your workflow into n8n using the JSON above</li>
            <li>Configure any required credentials and API keys</li>
            <li>Test your workflow with sample data</li>
            <li>Activate your workflow for production use</li>
          </ul>
          <div className="mt-4">
            <Button onClick={handleGoHome} className="mr-4">
              Create Another Workflow
            </Button>
            <a 
              href="https://docs.n8n.io/workflows/workflows/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Learn more about n8n workflows →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}