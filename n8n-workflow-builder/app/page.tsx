'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2 } from 'lucide-react';

/**
 * Landing page for the n8n Workflow Builder
 * MVP: Simple prompt submission form
 */
export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError('Please describe your workflow');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/workflow/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to create workflow');
      }

      const data = await response.json();
      
      // Redirect to workflow status page
      router.push(`/workflow/${data.sessionId}`);
    } catch (err) {
      setError('Failed to create workflow. Please try again.');
      setLoading(false);
    }
  };

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
        </div>

        {/* Main Content Area - Prompt Form */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border p-8">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label htmlFor="prompt" className="block text-lg font-medium text-gray-700 mb-3">
                  Describe your workflow
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Example: Create a webhook that receives data and sends it to Slack"
                  className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating workflow...
                  </>
                ) : (
                  'Create Workflow'
                )}
              </button>
            </form>
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