/**
 * Claude Service Facade
 * 
 * Main entry point for the Claude service module.
 * Provides backward compatibility while exposing new modular components.
 */

// ==========================================
// Backward Compatibility Export
// ==========================================

// ==========================================
// New Modular Exports
// ==========================================

// Constants
export * from './constants';
export { 
  PREFILLS,
  MODELS,
  TOKEN_LIMITS,
  TEMPERATURE,
  RETRY_CONFIG,
  PARSING_CONFIG,
  LOGGING,
  PHASE_CONFIG,
  API_CONFIG,
  getModel,
} from './constants';

// Client
export { 
  AnthropicClient,
  ProviderError,
  type CompletionParams,
  type CompletionResult,
  type ClientConfig,
} from './client';

// Parsing utilities
export {
  parseWithPrefill,
  parseJson,
  recoverJson,
  balanceBraces,
  looksLikeJson,
  extractJsonFromMixedContent,
  JsonParser,
  type ParseResult,
  type ParseError,
  type ParseOptions,
} from './parsing/json-prefill';

export {
  Recovery,
  removeJsonComments,
  fixUnquotedKeys,
  fixSingleQuotes,
  removeTrailingGarbage,
  fixIncompleteStrings,
  fixNesting,
  comprehensiveRecover,
} from './parsing/recovery';

// Prompts
export {
  CommonPrompts,
  type PromptParts,
  type PromptContext,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  ERROR_HANDLING_RULES,
  NODE_NAMING_RULES,
  MCP_TOOL_CONTEXT,
} from './prompts/common';

export { DiscoveryPrompts } from './prompts/discovery';
export { ConfigurationPrompts } from './prompts/configuration';
export { ValidationPrompts } from './prompts/validation';
export { BuildingPrompts } from './prompts/building';
export { DocumentationPrompts } from './prompts/documentation';

// Validation schemas
export {
  Schemas,
  validateResponse,
  getPhaseSchema,
  // Individual schemas for direct use
  intentAnalysisSchema,
  discoveryOperationsResponseSchema,
  configurationOperationsResponseSchema,
  workflowBuildResponseSchema,
  validationFixesResponseSchema,
  validatedWorkflowResponseSchema,
  documentationOperationsResponseSchema,
} from './validation/schemas';

// ==========================================
// Phase Services (New in Phase 2)
// ==========================================

export { BasePhaseService } from './phases/base';
export type { PhaseServiceConfig, PhaseContext, PhaseResult } from './phases/base';

export { DiscoveryPhaseService } from './phases/discovery';
export type { 
  DiscoveryInput, 
  DiscoveryOutput, 
  DiscoveryContext,
  IntentAnalysisInput,
  ClarificationInput 
} from './phases/discovery';

export { ConfigurationPhaseService } from './phases/configuration';
export type { 
  ConfigurationInput, 
  ConfigurationOutput, 
  ConfigurationContext
} from './phases/configuration';

export { BuildingPhaseService } from './phases/building';
export type { 
  BuildingInput, 
  BuildingOutput,
  ConfiguredNode
} from './phases/building';

export { ValidationPhaseService } from './phases/validation';
export type { 
  ValidationInput, 
  ValidationOutput,
  ValidationFixesInput
} from './phases/validation';

export { DocumentationPhaseService } from './phases/documentation';
export type { 
  DocumentationInput, 
  DocumentationOutput,
  NodeMetadata
} from './phases/documentation';

// ==========================================
// Factory Functions
// ==========================================

import { AnthropicClient } from './client';
import type { ClientConfig } from './client';
import { DiscoveryPhaseService } from './phases/discovery';
import { ConfigurationPhaseService } from './phases/configuration';
import { BuildingPhaseService } from './phases/building';
import { ValidationPhaseService } from './phases/validation';
import { DocumentationPhaseService } from './phases/documentation';

/**
 * Create a new Anthropic client instance
 * This is the preferred way to create clients in the new architecture
 */
export function createAnthropicClient(config?: ClientConfig): AnthropicClient {
  return new AnthropicClient(config);
}

/**
 * Create a client with default configuration
 */
export function createDefaultClient(): AnthropicClient {
  return new AnthropicClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Create all phase services with shared configuration
 * This is the recommended way to create phase services
 */
export function createPhaseServices(config?: {
  client?: AnthropicClient;
  onTokenUsage?: (tokens: number) => void;
}) {
  const client = config?.client || createDefaultClient();
  const baseConfig = {
    client,
    onTokenUsage: config?.onTokenUsage,
  };
  
  return {
    discovery: new DiscoveryPhaseService(baseConfig),
    configuration: new ConfigurationPhaseService(baseConfig),
    building: new BuildingPhaseService(baseConfig),
    validation: new ValidationPhaseService(baseConfig),
    documentation: new DocumentationPhaseService(baseConfig),
  };
}

/**
 * Create a single phase service
 */
export function createPhaseService<T extends 'discovery' | 'configuration' | 'building' | 'validation' | 'documentation'>(
  phase: T,
  config?: {
    client?: AnthropicClient;
    onTokenUsage?: (tokens: number) => void;
  }
) {
  const client = config?.client || createDefaultClient();
  const baseConfig = {
    client,
    onTokenUsage: config?.onTokenUsage,
  };
  
  switch (phase) {
    case 'discovery':
      return new DiscoveryPhaseService(baseConfig);
    case 'configuration':
      return new ConfigurationPhaseService(baseConfig);
    case 'building':
      return new BuildingPhaseService(baseConfig);
    case 'validation':
      return new ValidationPhaseService(baseConfig);
    case 'documentation':
      return new DocumentationPhaseService(baseConfig);
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

// ==========================================
// Version Information
// ==========================================

export const CLAUDE_SERVICE_VERSION = '2.0.0-phase2';

/**
 * Check if the new modular architecture is being used
 */
export function isUsingModularArchitecture(): boolean {
  // This can be used by consumers to check if they should migrate
  // to the new modular imports
  return true;
}

// ==========================================
// Migration Helpers
// ==========================================

/**
 * Helper to migrate from old ClaudeService to new modular approach
 * Now complete with Phase 2 implementation
 */
export function migrateToModular(oldService?: any): {
  client: AnthropicClient;
  prompts: any;
  parser: any;
  phases: ReturnType<typeof createPhaseServices>;
} {
  const client = createDefaultClient();
  const phases = createPhaseServices({ client });
  
  return {
    client,
    prompts: {
      discovery: DiscoveryPrompts,
      configuration: ConfigurationPrompts,
      validation: ValidationPrompts,
      building: BuildingPrompts,
      documentation: DocumentationPrompts,
    },
    parser: JsonParser,
    phases,
  };
}