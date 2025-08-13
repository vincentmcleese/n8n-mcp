'use client';

import React, { useState, useEffect } from 'react';
import { NodeIcon } from '@/components/ui/node-icon';
import { preloadCommonNodeIcons, preloadNodeIcons } from '@/lib/icon-preloader';
import { Button } from '@/components/ui/button';

// Sample nodes with their icons for testing
// Note: Some of these only exist as .dark variants (e.g., github.dark.svg)
const sampleNodes = [
  { name: 'slack', displayName: 'Slack', category: 'communication' },
  { name: 'github', displayName: 'GitHub', category: 'developer' }, // Dark variant
  { name: 'salesforce', displayName: 'Salesforce', category: 'crm' },
  { name: 'notion', displayName: 'Notion', category: 'projectManagement' },
  { name: 'openAi', displayName: 'OpenAI', category: 'ai' }, // Dark variant
  { name: 'stripe', displayName: 'Stripe', category: 'ecommerce' },
  { name: 'mailchimp', displayName: 'Mailchimp', category: 'marketing' },
  { name: 'spotify', displayName: 'Spotify', category: 'social' },
];

export default function NodeIconsDemo() {
  const [selectedSize, setSelectedSize] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl'>('md');
  const [customColor, setCustomColor] = useState<string>('#000000');
  const [isLoading, setIsLoading] = useState(false);
  const [errorIcon, setErrorIcon] = useState<string>('');

  // Preload common icons on mount
  useEffect(() => {
    preloadCommonNodeIcons();
  }, []);

  // Simulate loading state
  const handleLoadingDemo = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  // Test error handling
  const handleErrorDemo = () => {
    setErrorIcon('non-existent-icon');
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Node Icon Component Demo</h1>

      {/* Controls */}
      <div className="mb-8 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Controls</h2>
        
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Size</label>
            <select 
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value as any)}
              className="px-3 py-2 border rounded"
            >
              <option value="xs">Extra Small (16px)</option>
              <option value="sm">Small (20px)</option>
              <option value="md">Medium (24px)</option>
              <option value="lg">Large (32px)</option>
              <option value="xl">Extra Large (48px)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <input 
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="px-3 py-2 border rounded"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleLoadingDemo}>Simulate Loading</Button>
          <Button onClick={handleErrorDemo} variant="destructive">Test Error State</Button>
          <Button onClick={() => setErrorIcon('')} variant="outline">Clear Error</Button>
        </div>
      </div>

      {/* Icon Grid */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Sample Node Icons</h2>
        <div className="grid grid-cols-4 gap-6">
          {sampleNodes.map((node) => (
            <div key={node.name} className="flex flex-col items-center p-4 border rounded-lg hover:bg-gray-50">
              <NodeIcon
                name={isLoading ? 'loading' : node.name}
                size={selectedSize}
                color={customColor}
                title={`${node.displayName} Integration`}
                className="mb-2"
              />
              <span className="text-sm font-medium">{node.displayName}</span>
              <span className="text-xs text-gray-500">{node.category}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Different Sizes */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Size Variations</h2>
        <div className="flex items-center gap-4">
          <NodeIcon name="n8n" size="xs" title="Extra Small" />
          <NodeIcon name="n8n" size="sm" title="Small" />
          <NodeIcon name="n8n" size="md" title="Medium" />
          <NodeIcon name="n8n" size="lg" title="Large" />
          <NodeIcon name="n8n" size="xl" title="Extra Large" />
          <NodeIcon name="n8n" size={64} title="Custom 64px" />
        </div>
      </div>

      {/* Color Variations */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Color Variations</h2>
        <div className="flex items-center gap-4">
          <NodeIcon name="slack" size="lg" color="#4A154B" title="Slack Purple" />
          <NodeIcon name="github" size="lg" color="#24292e" title="GitHub Black" />
          <NodeIcon name="spotify" size="lg" color="#1DB954" title="Spotify Green" />
          <NodeIcon name="stripe" size="lg" color="#635BFF" title="Stripe Blue" />
          <NodeIcon name="salesforce" size="lg" color="#00A1E0" title="Salesforce Blue" />
        </div>
      </div>

      {/* Dark Variant Handling */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Dark Variant Icons</h2>
        <p className="text-sm text-gray-600 mb-4">These icons only exist as .dark variants and automatically get a dark background</p>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <NodeIcon 
              name="github" 
              size="lg" 
              title="GitHub (auto dark bg)"
              onVariantDetected={(isDark) => console.log('GitHub is dark:', isDark)}
            />
            <p className="text-xs mt-1">With background</p>
          </div>
          <div className="text-center">
            <NodeIcon 
              name="github" 
              size="lg" 
              showBackground={false}
              title="GitHub (no bg)"
            />
            <p className="text-xs mt-1">No background</p>
          </div>
          <div className="text-center">
            <NodeIcon 
              name="openAi" 
              size="lg"
              backgroundClassName="p-2 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg"
              title="OpenAI (custom bg)"
            />
            <p className="text-xs mt-1">Custom background</p>
          </div>
          <div className="text-center">
            <NodeIcon 
              name="deepL" 
              size="lg"
              title="DeepL"
            />
            <p className="text-xs mt-1">DeepL</p>
          </div>
        </div>
      </div>

      {/* Error State */}
      {errorIcon && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Error Handling</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <NodeIcon 
                name={errorIcon} 
                size="lg"
              />
              <span className="text-sm text-gray-600">Default fallback (n8n icon)</span>
            </div>
            <div className="flex items-center gap-4">
              <NodeIcon 
                name={errorIcon} 
                size="lg"
                fallback={
                  <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center text-red-500">
                    !
                  </div>
                }
              />
              <span className="text-sm text-gray-600">Custom fallback component</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading Simulation */}
      {isLoading && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Loading State</h2>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 animate-pulse bg-gray-200 rounded" />
            <span className="text-sm text-gray-600">Icons loading...</span>
          </div>
        </div>
      )}

      {/* Usage Examples */}
      <div className="mt-8 p-4 bg-gray-900 text-white rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Usage Examples</h2>
        <pre className="text-sm overflow-x-auto">
{`// Basic usage
<NodeIcon name="slack" />

// With size and color
<NodeIcon name="github" size="lg" color="#333" />

// With accessibility
<NodeIcon 
  name="salesforce"
  title="Salesforce CRM"
  size="xl"
/>

// Default fallback (automatically uses n8n icon)
<NodeIcon 
  name={apiResponse.icon}
  onError={(e) => console.log('Using n8n fallback')}
/>

// With custom fallback component
<NodeIcon 
  name={apiResponse.icon}
  fallback={<CustomFallbackIcon />}
  onError={(e) => console.log('Icon not found')}
/>

// Decorative icon (no accessibility)
<NodeIcon 
  name="spotify"
  decorative
  className="animate-pulse"
/>`}
        </pre>
      </div>
    </div>
  );
}