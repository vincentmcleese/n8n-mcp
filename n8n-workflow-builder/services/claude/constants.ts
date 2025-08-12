/**
 * Claude Service Constants
 * 
 * Centralized configuration for all Claude-related constants including
 * prefills, model settings, token limits, and retry configuration.
 */

// ==========================================
// JSON Prefills for Consistent Output
// ==========================================

/**
 * Prefill strings that start Claude's response to ensure valid JSON output.
 * These are prepended to Claude's response to guide it towards proper JSON formatting.
 */
export const PREFILLS = {
  // Discovery phase
  DISCOVERY: '{"operations":[',
  
  // Configuration phase
  CONFIGURATION: '{"operations":[',
  
  // Building phase - starts with workflow name
  BUILDING: '{"name":"',
  
  // Validation phase - for validation fixes array  
  VALIDATION_FIXES: '{"fixes":[',
  
  // Documentation phase - for sticky note operations
  DOCUMENTATION: '{"operations":[',
  
  // Analysis methods
  INTENT_ANALYSIS: '{"intent":"',
  NODE_REQUIREMENTS: '{"needsAuth":',
  NODE_CONFIG: "{",
} as const;

// ==========================================
// Model Configuration
// ==========================================

/**
 * Claude model names for different environments
 */
export const MODELS = {
  default: "claude-sonnet-4-20250514",
  test: "claude-sonnet-4-20250514",
  fast: "claude-sonnet-4-20250514",
  powerful: "claude-opus-4-20250514", // For complex tasks if needed
} as const;

/**
 * Get the appropriate model based on environment and requirements
 */
export function getModel(options?: { 
  test?: boolean; 
  fast?: boolean; 
  powerful?: boolean 
}): string {
  if (process.env.NODE_ENV === "test" || options?.test) {
    return MODELS.test;
  }
  if (options?.powerful) {
    return MODELS.powerful;
  }
  if (options?.fast) {
    return MODELS.fast;
  }
  return MODELS.default;
}

// ==========================================
// Token Limits and Generation Settings
// ==========================================

/**
 * Maximum tokens for each phase/operation type
 */
export const TOKEN_LIMITS = {
  // Phase-specific limits
  discovery: 8000,
  configuration: 8000, // Increased from 4000 to handle complex node configurations like Switch with multiple rules
  building: 8000,
  validation: 8000,
  documentation: 1000,
  
  // Analysis operations
  intentAnalysis: 4000, // Increased from 1000 to handle complex prompts
  nodeRequirements: 500,
  nodeConfigFix: 1000,
  validationFixes: 8000, // Increased from 2000 to handle multiple node fixes with complete configurations
} as const;

/**
 * Temperature settings for different operation types
 */
export const TEMPERATURE = {
  // Use 0 for maximum consistency and determinism
  default: 0,
  
  // Slightly higher for creative tasks if needed
  creative: 0.1,
} as const;

// ==========================================
// Retry and Error Handling Configuration
// ==========================================

/**
 * Retry configuration for API calls
 */
export const RETRY_CONFIG = {
  // Maximum number of retry attempts
  maxAttempts: 3,
  
  // Initial delay in milliseconds
  initialDelay: 1000,
  
  // Maximum delay in milliseconds
  maxDelay: 10000,
  
  // Backoff multiplier
  backoffMultiplier: 2,
  
  // Retry on these HTTP status codes
  retryableStatuses: [429, 500, 502, 503, 504],
  
  // Retry on these error codes
  retryableErrorCodes: [
    'rate_limit_error',
    'server_error',
    'overloaded_error',
  ],
} as const;

// ==========================================
// Validation and Parsing Configuration
// ==========================================

/**
 * JSON parsing configuration
 */
export const PARSING_CONFIG = {
  // Maximum content length to log on error
  errorPreviewLength: 500,
  
  // Maximum length to show around error position
  errorContextLength: 100,
  
  // Whether to attempt automatic brace/bracket recovery
  attemptRecovery: true,
  
  // Maximum depth for nested JSON structures
  maxDepth: 10,
} as const;

// ==========================================
// Logging Configuration
// ==========================================

/**
 * Logging levels and verbosity settings
 */
export const LOGGING = {
  // Log token usage
  logTokenUsage: true,
  
  // Log full responses in verbose mode
  logFullResponses: process.env.CLAUDE_VERBOSE === 'true',
  
  // Log prompts in debug mode
  logPrompts: process.env.CLAUDE_DEBUG === 'true',
  
  // Maximum response length to log
  maxResponseLogLength: 1000,
} as const;

// ==========================================
// Phase Configuration
// ==========================================

/**
 * Phase-specific configuration and metadata
 */
export const PHASE_CONFIG = {
  discovery: {
    name: 'Discovery',
    description: 'Discover and select nodes for the workflow',
    requiresPreviousPhase: false,
    canSkip: false,
  },
  configuration: {
    name: 'Configuration',
    description: 'Configure parameters for selected nodes',
    requiresPreviousPhase: true,
    canSkip: false,
  },
  building: {
    name: 'Building',
    description: 'Build workflow structure and connections',
    requiresPreviousPhase: true,
    canSkip: false,
  },
  validation: {
    name: 'Validation',
    description: 'Validate and fix the workflow',
    requiresPreviousPhase: true,
    canSkip: true, // Can skip if workflow is already valid
  },
  documentation: {
    name: 'Documentation',
    description: 'Add documentation and sticky notes',
    requiresPreviousPhase: true,
    canSkip: true, // Optional phase
  },
} as const;

// ==========================================
// API Configuration
// ==========================================

/**
 * API endpoint and authentication configuration
 */
export const API_CONFIG = {
  // Base URL for Anthropic API (can be overridden for proxies)
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  
  // API version
  apiVersion: '2023-06-01',
  
  // Timeout in milliseconds
  timeout: 60000,
  
  // Headers
  defaultHeaders: {
    'anthropic-version': '2023-06-01',
  },
} as const;

// ==========================================
// Export Type Definitions
// ==========================================

export type PrefillType = keyof typeof PREFILLS;
export type ModelType = keyof typeof MODELS;
export type PhaseType = keyof typeof PHASE_CONFIG;
export type TokenLimitType = keyof typeof TOKEN_LIMITS;