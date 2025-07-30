'use client';

import { AlertCircle, Brain, Server, XCircle, X, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Error object structure from API responses
 */
interface ErrorData {
  /** Error type classification */
  type: 'validation' | 'claude_api' | 'mcp_server' | 'network' | 'session' | 'unknown';
  /** User-friendly error message */
  userMessage: string;
  /** Technical error message for debugging */
  technicalMessage?: string;
  /** Helpful suggestion for resolution */
  suggestion?: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Error code for tracking */
  code?: string;
  /** Additional context data */
  context?: Record<string, any>;
}

/**
 * Props for the ErrorDisplay component
 */
interface ErrorDisplayProps {
  /** The error object to display */
  error: ErrorData;
  /** Callback function when user clicks retry */
  onRetry?: () => void;
  /** Callback function when user dismisses the error */
  onDismiss?: () => void;
  /** Show detailed technical information */
  showDetails?: boolean;
}

/**
 * ErrorDisplay component for showing errors with appropriate styling and actions
 * Following Context7 React best practices with TypeScript and accessibility focus
 */
export function ErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss, 
  showDetails = false 
}: ErrorDisplayProps) {
  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'validation':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'claude_api':
        return <Brain className="w-5 h-5 text-blue-500" />;
      case 'mcp_server':
        return <Server className="w-5 h-5 text-orange-500" />;
      case 'network':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'session':
        return <AlertCircle className="w-5 h-5 text-purple-500" />;
      default:
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getErrorColor = (type: string) => {
    switch (type) {
      case 'validation':
        return 'border-yellow-500 bg-yellow-50';
      case 'claude_api':
        return 'border-blue-500 bg-blue-50';
      case 'mcp_server':
        return 'border-orange-500 bg-orange-50';
      case 'network':
        return 'border-red-500 bg-red-50';
      case 'session':
        return 'border-purple-500 bg-purple-50';
      default:
        return error.retryable ? 'border-yellow-500 bg-yellow-50' : 'border-red-500 bg-red-50';
    }
  };

  const getErrorTitle = (type: string) => {
    switch (type) {
      case 'validation':
        return 'Validation Error';
      case 'claude_api':
        return 'Claude AI Error';
      case 'mcp_server':
        return 'MCP Server Error';
      case 'network':
        return 'Network Error';
      case 'session':
        return 'Session Error';
      default:
        return 'Error';
    }
  };

  const getHelpUrl = (type: string) => {
    switch (type) {
      case 'claude_api':
        return 'https://docs.anthropic.com/claude/docs';
      case 'mcp_server':
        return 'https://github.com/modelcontextprotocol/';
      case 'network':
        return '#troubleshooting-network';
      case 'session':
        return '#troubleshooting-sessions';
      default:
        return '#troubleshooting';
    }
  };

  return (
    <Alert 
      className={`mb-4 ${getErrorColor(error.type)}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        {/* Error icon */}
        <div className="flex-shrink-0 mt-0.5">
          {getErrorIcon(error.type)}
        </div>

        {/* Error content */}
        <div className="flex-1 min-w-0">
          <AlertTitle className="text-base font-semibold mb-1">
            {getErrorTitle(error.type)}
            {error.code && (
              <span className="ml-2 text-xs font-mono text-gray-500">
                [{error.code}]
              </span>
            )}
          </AlertTitle>

          <AlertDescription className="space-y-2">
            {/* User message */}
            <p className="text-sm text-gray-700">
              {error.userMessage}
            </p>

            {/* Suggestion */}
            {error.suggestion && (
              <p className="text-sm text-gray-600 italic">
                💡 {error.suggestion}
              </p>
            )}

            {/* Technical details (when enabled) */}
            {showDetails && error.technicalMessage && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Technical Details
                </summary>
                <pre className="mt-1 text-xs text-gray-600 bg-gray-100 p-2 rounded border font-mono whitespace-pre-wrap">
                  {error.technicalMessage}
                  {error.context && (
                    <>
                      {'\n\nContext:\n'}
                      {JSON.stringify(error.context, null, 2)}
                    </>
                  )}
                </pre>
              </details>
            )}
          </AlertDescription>
        </div>

        {/* Action buttons */}
        <div className="flex items-start gap-2 flex-shrink-0">
          {/* Help link */}
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700 p-1"
            onClick={() => window.open(getHelpUrl(error.type), '_blank', 'noopener,noreferrer')}
            aria-label="Get help with this error"
            title="Get help"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>

          {/* Retry button */}
          {error.retryable && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="text-xs"
              aria-label="Retry the failed operation"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}

          {/* Dismiss button */}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-gray-500 hover:text-gray-700 p-1"
              aria-label="Dismiss this error"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Screen reader announcements */}
      <div className="sr-only">
        Error occurred: {error.userMessage}
        {error.suggestion && ` Suggestion: ${error.suggestion}`}
        {error.retryable ? ' This operation can be retried.' : ' This operation cannot be retried.'}
      </div>
    </Alert>
  );
}