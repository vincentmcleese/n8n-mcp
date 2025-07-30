'use client';

import { useState } from 'react';
import { Download, Copy, ExternalLink, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Props for the WorkflowResult component
 */
interface WorkflowResultProps {
  /** The generated workflow JSON object */
  workflow: any;
  /** Session ID for context */
  sessionId: string;
  /** Optional token savings information */
  tokenSavings?: {
    traditional: number;
    delta: number;
    saved: number;
    percentage: number;
  };
}

/**
 * WorkflowResult component for displaying the final workflow JSON
 * Following Context7 React best practices with TypeScript and user experience focus
 */
export function WorkflowResult({ workflow, sessionId, tokenSavings }: WorkflowResultProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const workflowJson = JSON.stringify(workflow, null, 2);
  const workflowName = workflow.name || `workflow-${sessionId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(workflowJson);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy workflow:', error);
    }
  };

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      const blob = new Blob([workflowJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workflowName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download workflow:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenInN8n = () => {
    // Create a URL that can be used to import the workflow into n8n
    const encodedWorkflow = encodeURIComponent(workflowJson);
    const n8nUrl = `https://n8n.io/workflows/new?workflow=${encodedWorkflow}`;
    window.open(n8nUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Success header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Workflow Complete!
        </h2>
        <p className="text-gray-600">
          Your n8n workflow has been successfully generated and is ready to use.
        </p>
      </div>

      {/* Token savings display */}
      {tokenSavings && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">
            Delta Architecture Benefits
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-600 font-medium">Traditional:</span>
              <span className="ml-1 text-gray-700">{tokenSavings.traditional} tokens</span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">Delta:</span>
              <span className="ml-1 text-gray-700">{tokenSavings.delta} tokens</span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">Saved:</span>
              <span className="ml-1 text-gray-700">{tokenSavings.saved} tokens</span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">Reduction:</span>
              <span className="ml-1 text-green-600 font-semibold">{tokenSavings.percentage}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Workflow metadata */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Workflow Details
        </h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="font-medium text-gray-700">Name:</dt>
            <dd className="text-gray-900">{workflowName}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700">Session ID:</dt>
            <dd className="text-gray-900 font-mono text-xs">{sessionId}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700">Nodes:</dt>
            <dd className="text-gray-900">
              {workflow.nodes ? workflow.nodes.length : 'Unknown'} nodes
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700">Generated:</dt>
            <dd className="text-gray-900">{new Date().toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Button
          onClick={handleCopy}
          variant="outline"
          className="min-w-[120px]"
          disabled={isCopied}
        >
          {isCopied ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy JSON
            </>
          )}
        </Button>

        <Button
          onClick={handleDownload}
          variant="outline"
          className="min-w-[120px]"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download
            </>
          )}
        </Button>

        <Button
          onClick={handleOpenInN8n}
          className="min-w-[120px]"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in n8n
        </Button>
      </div>

      {/* JSON preview */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">
          Workflow JSON
        </h3>
        <div className="relative">
          <pre
            className="bg-gray-900 text-gray-100 text-sm p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap"
            aria-label="Workflow JSON code"
          >
            <code>{workflowJson}</code>
          </pre>
          
          {/* Copy button overlay */}
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-200"
            aria-label="Copy JSON to clipboard"
          >
            {isCopied ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Usage instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">
          How to use your workflow:
        </h4>
        <ol className="text-sm text-blue-700 space-y-1 ml-4 list-decimal">
          <li>Copy the JSON above or download the file</li>
          <li>Open n8n in your browser or desktop application</li>
          <li>Click "Import from JSON" or use Ctrl+I</li>
          <li>Paste the JSON or upload the downloaded file</li>
          <li>Configure any required credentials and settings</li>
          <li>Test and activate your workflow</li>
        </ol>
      </div>

      {/* Accessibility */}
      <div className="sr-only" aria-live="polite">
        Workflow generation completed. {workflow.nodes?.length || 0} nodes created.
        {tokenSavings && ` Token usage reduced by ${tokenSavings.percentage}%.`}
      </div>
    </div>
  );
}