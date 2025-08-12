/**
 * Configuration Phase Service (OPTIMIZED)
 * 
 * Handles the configuration phase using node essentials for 95% token reduction:
 * - Node configuration generation with essentials
 * - Category-based rules application
 * - Simplified single-pass configuration
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from './base';
import { TOKEN_LIMITS } from '../constants';
import { 
  configurationOperationsResponseSchema
} from '../validation/schemas';
import type { 
  ConfigurationOperationsResponse,
  WorkflowOperation
} from '@/types';
import { CONFIGURATION_TOOLS } from '@/lib/mcp-tools/definitions';
import { ConfigurationPrompts } from '../prompts/configuration';

// ==========================================
// Type Definitions
// ==========================================

export interface ConfigurationInput {
  prompt: string;
  selectedNodes: string[];
  context: ConfigurationContext;
}

export interface ConfigurationContext {
  discoveredNodes?: any[];
  nodeSchemas?: Record<string, any>;
  nodeTemplates?: Record<string, any>;
  nodeProperties?: Record<string, any>;
  nodeDocumentation?: Record<string, any>;
  enrichedContext?: Record<string, any>;
}

export interface ConfigurationOutput {
  operations: WorkflowOperation[];
  reasoning: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Removed NodeRequirementsInput and NodeConfigFixInput - no longer needed

// ==========================================
// Configuration Phase Service Implementation
// ==========================================

export class ConfigurationPhaseService extends BasePhaseService<ConfigurationInput, ConfigurationOutput> {
  get phaseName(): string {
    return 'configuration';
  }

  /**
   * Execute the configuration phase
   */
  async execute(
    input: ConfigurationInput,
    context: PhaseContext
  ): Promise<PhaseResult<ConfigurationOutput>> {
    const { prompt, selectedNodes, context: configContext } = input;
    
    // Log at debug level to avoid confusion when running in parallel
    this.logger.debug(`Starting configuration for ${selectedNodes.length} node${selectedNodes.length !== 1 ? 's' : ''}`);
    
    try {
      // Always use the prompt passed in (from ConfigurationPromptBuilder)
      const promptParts = {
        system: "You are an n8n workflow configuration expert. Configure nodes based on the user's requirements.",
        user: prompt,
        prefill: '{"operations":['
      };
      this.logger.debug('   Using optimized essentials-based configuration');
      
      // Get available tools for configuration phase
      const tools = Object.values(CONFIGURATION_TOOLS);
      
      // Call Claude for configuration operations with tools available
      const result = await this.callClaude<ConfigurationOperationsResponse>(
        promptParts,
        TOKEN_LIMITS.configuration,
        configurationOperationsResponseSchema as any,
        'generateConfiguration',
        tools // Pass tools for Claude to use if needed
      );
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error('Failed to generate configuration'),
          usage: result.usage,
        };
      }
      
      // Process and enhance operations
      const enhancedOperations = this.attachReasoningToOperations(
        result.data.operations || [],
        result.data.reasoning || []
      );
      
      // Log completion at INFO level
      const configuredCount = enhancedOperations.filter(op => op.type === 'configureNode').length;
      this.logger.info(`   ✓ Generated ${configuredCount} node configuration${configuredCount !== 1 ? 's' : ''}`);
      
      // Log the actual operations for debugging
      this.logger.debug('Configuration operations generated:', enhancedOperations);
      
      return {
        success: true,
        data: {
          operations: enhancedOperations,
          reasoning: result.data.reasoning || [],
          usage: result.usage,
        },
        usage: result.usage,
        reasoning: result.data.reasoning,
      };
    } catch (error) {
      this.logError('configuration phase', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // Removed analyzeNodeRequirements - not needed with essentials
  // Removed fixNodeConfig - single-pass configuration is accurate enough

  /**
   * Generate configuration fixes based on validation errors
   * Prioritizes the validation's own fix suggestions and autofix objects
   */
  async generateConfigurationFixes(
    input: {
      nodeId: string;
      nodeType: string;
      currentConfig: any;
      validationResult: any; // Full validation result with errors, fixes, autofix
    }
  ): Promise<PhaseResult<{
    fixedConfig: any;
    reasoning: string[];
  }>> {
    const { nodeId, nodeType, currentConfig, validationResult } = input;
    
    this.logger.verbose(`Generating configuration fixes for ${nodeType} (${nodeId})`);
    
    // Handle both errors and missingRequiredFields formats
    const errors = validationResult.errors || [];
    const missingFields = validationResult.missingRequiredFields || [];
    
    // Combine all issues
    const allIssues = [
      ...errors,
      ...missingFields.map((f: string) => `Missing required field: ${f}`)
    ];
    
    if (allIssues.length === 0) {
      return {
        success: true,
        data: {
          fixedConfig: currentConfig,
          reasoning: ['No validation errors to fix'],
        },
      };
    }
    
    try {
      // Generate the fixes prompt with full validation context
      const promptParts = ConfigurationPrompts.getConfigurationFixesPrompt(
        nodeId,
        nodeType,
        currentConfig,
        validationResult
      );
      
      // Call Claude for fixes - no schema validation needed, we want flexibility
      const result = await this.callClaude<{
        fixedConfig: any;
        reasoning: string[];
      }>(
        promptParts,
        TOKEN_LIMITS.configuration, // Reuse configuration token limit
        undefined, // No schema validation - we need flexibility in the response
        'generateConfigurationFixes'
      );
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error('Failed to generate configuration fixes'),
          usage: result.usage,
        };
      }
      
      this.logSuccess('Configuration fixes generated', {
        nodeType,
        errorCount: allIssues.length,
        hasAutofix: !!validationResult.autofix,
        fixSuggestions: validationResult.errors?.filter((e: any) => e.fix).length || 0,
      });
      
      return {
        success: true,
        data: result.data,
        usage: result.usage,
      };
    } catch (error) {
      this.logError('generateConfigurationFixes', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

}