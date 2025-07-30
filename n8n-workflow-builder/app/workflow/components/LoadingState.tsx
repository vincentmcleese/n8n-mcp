'use client';

import { Loader2, Search, Settings, CheckCircle, Wrench, Trophy } from 'lucide-react';
import type { WorkflowPhase } from '@/types/workflow';

/**
 * Props for the LoadingState component
 */
interface LoadingStateProps {
  /** Current workflow phase */
  phase: WorkflowPhase;
  /** Custom loading message */
  message?: string;
  /** Progress percentage (0-100) */
  progress?: number;
}

/**
 * Phase-specific loading configurations
 */
const PHASE_CONFIG = {
  discovery: {
    icon: Search,
    defaultMessage: 'Discovering relevant n8n nodes...',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    steps: ['Analyzing requirements', 'Searching node library', 'Finding best matches']
  },
  configuration: {
    icon: Settings,
    defaultMessage: 'Configuring selected nodes...',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    steps: ['Loading node schemas', 'Setting parameters', 'Validating configurations']
  },
  validation: {
    icon: CheckCircle,
    defaultMessage: 'Validating workflow structure...',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    steps: ['Checking connections', 'Validating data flow', 'Testing compatibility']
  },
  building: {
    icon: Wrench,
    defaultMessage: 'Building final workflow...',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    steps: ['Connecting nodes', 'Optimizing structure', 'Generating workflow JSON']
  },
  complete: {
    icon: Trophy,
    defaultMessage: 'Workflow completed!',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    steps: ['Finalizing export', 'Calculating savings', 'Preparing results']
  }
};

/**
 * LoadingState component for phase-specific loading indicators
 * Following Context7 React best practices with accessibility and visual feedback
 */
export function LoadingState({ phase, message, progress }: LoadingStateProps) {
  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const displayMessage = message || config.defaultMessage;

  return (
    <div className={`flex flex-col items-center justify-center p-8 rounded-lg ${config.bgColor}`}>
      {/* Main loading indicator */}
      <div className="relative mb-6">
        <div className={`w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center`}>
          <Icon className={`w-8 h-8 ${config.color}`} />
        </div>
        <div className="absolute -top-1 -right-1">
          <Loader2 className={`w-6 h-6 ${config.color} animate-spin`} />
        </div>
      </div>

      {/* Loading message */}
      <h3 className="text-lg font-semibold text-gray-800 mb-2 text-center">
        {displayMessage}
      </h3>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="w-full max-w-xs mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${config.color.replace('text-', 'bg-')}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Phase steps */}
      <div className="space-y-2 text-center">
        {config.steps.map((step, index) => (
          <div 
            key={step}
            className={`text-sm transition-opacity duration-500 ${
              progress !== undefined 
                ? progress > (index * 33) ? 'text-gray-700 opacity-100' : 'text-gray-400 opacity-50'
                : 'text-gray-600'
            }`}
          >
            {step}
          </div>
        ))}
      </div>

      {/* Accessibility */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Loading {phase} phase: {displayMessage}
        {progress !== undefined && ` ${Math.round(progress)}% complete`}
      </div>
    </div>
  );
}