'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, ArrowRight, CheckCircle, Clock, Cpu, Sparkles } from 'lucide-react';
import { PromptInput } from './workflow/components/PromptInput';
import { LoadingState } from './workflow/components/LoadingState';
import { ErrorDisplay } from './workflow/components/ErrorDisplay';
import type { CreateSessionResponse, ErrorResponse } from '@/types/workflow';

/**
 * Landing page for the n8n Workflow Builder
 * Following Context7 React best practices with TypeScript and user experience focus
 */
export default function Home() {
  const router = useRouter();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<ErrorResponse['error'] | null>(null);

  /**
   * Handle workflow creation from landing page prompt
   */
  const handleCreateWorkflow = async (prompt: string, metadata?: { name?: string; description?: string }) => {
    setIsCreatingSession(true);
    setError(null);

    try {
      // Create new session
      const response = await fetch('/api/workflow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt,
          metadata: {
            ...metadata,
            source: 'landing_page',
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create workflow session');
      }

      const sessionData: CreateSessionResponse = await response.json();
      
      // Redirect to workflow builder
      router.push(`/workflow/${sessionData.sessionId}`);
      
    } catch (error) {
      console.error('Failed to create workflow:', error);
      setError({
        type: 'network',
        code: 'SESSION_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'Failed to start workflow creation. Please try again.',
        retryable: true,
        suggestion: 'Check your connection and try again, or try simplifying your prompt.'
      });
    } finally {
      setIsCreatingSession(false);
    }
  };

  /**
   * Handle error retry
   */
  const handleRetry = () => {
    setError(null);
  };

  /**
   * Handle error dismissal
   */
  const handleErrorDismiss = () => {
    setError(null);
  };

  if (isCreatingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <LoadingState 
            phase="discovery" 
            message="Creating your workflow session..."
            progress={50}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          {/* Logo and Title */}
          <div className="flex items-center justify-center mb-6">
            <div className="bg-blue-600 rounded-lg p-3 mr-4">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
              n8n Workflow Builder
            </h1>
          </div>
          
          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-gray-600 mb-4">
            Create powerful automation workflows with AI assistance
          </p>
          
          {/* Description */}
          <p className="text-lg text-gray-500 max-w-3xl mx-auto mb-12">
            Describe what you want to automate, and our AI will help you build the perfect n8n workflow 
            with intelligent node selection, configuration, and validation.
          </p>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-green-100 mb-4">
                <Sparkles className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                AI-Powered Discovery
              </h3>
              <p className="text-gray-600">
                Intelligent node suggestions based on your requirements
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-100 mb-4">
                <Cpu className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Smart Configuration
              </h3>
              <p className="text-gray-600">
                Automatic parameter setup and validation
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-100 mb-4">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                90% Token Reduction
              </h3>
              <p className="text-gray-600">
                Delta-based architecture for maximum efficiency
              </p>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8">
            <ErrorDisplay
              error={error}
              onRetry={error.retryable ? handleRetry : undefined}
              onDismiss={handleErrorDismiss}
            />
          </div>
        )}

        {/* Main CTA - Prompt Input */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                What would you like to automate?
              </h2>
              <p className="text-gray-600">
                Describe your workflow in plain English and we'll build it for you.
              </p>
            </div>
            
            <PromptInput
              onSubmit={handleCreateWorkflow}
              isLoading={isCreatingSession}
              placeholder="I want to create a workflow that monitors my GitHub repository for new issues and automatically creates Slack notifications with issue details..."
            />
          </div>
        </div>

        {/* Examples Section */}
        <div className="max-w-4xl mx-auto mt-16">
          <h3 className="text-xl font-semibold text-gray-900 text-center mb-8">
            Popular workflow examples:
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "Monitor RSS feeds and post updates to Slack",
              "Backup GitHub repositories to Google Drive",
              "Send email notifications for form submissions",
              "Sync customer data between CRM and database",
              "Process uploaded files and extract metadata",
              "Schedule social media posts across platforms"
            ].map((example, index) => (
              <button
                key={index}
                onClick={() => handleCreateWorkflow(example)}
                className="text-left p-4 bg-white border rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors group"
                disabled={isCreatingSession}
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 group-hover:text-blue-700">
                    {example}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Trust indicators */}
        <div className="max-w-2xl mx-auto mt-16 text-center">
          <div className="flex items-center justify-center space-x-8 text-sm text-gray-500">
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>No registration required</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>Export ready workflows</span>
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>AI-powered assistance</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p className="mb-4">
              Built with ❤️ for the n8n community
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm">
              <a 
                href="https://n8n.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Learn about n8n
              </a>
              <a 
                href="https://github.com/n8n-io/n8n" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                n8n on GitHub
              </a>
              <a 
                href="https://docs.n8n.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Documentation
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
