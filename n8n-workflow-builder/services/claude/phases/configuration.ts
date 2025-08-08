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
import { ConfigurationPrompts } from '../prompts/configuration';
import type { 
  ConfigurationOperationsResponse,
  WorkflowOperation
} from '@/types';

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
    
    this.logger.debug(`Starting configuration generation for ${selectedNodes.length} nodes`);
    
    try {
      // Check if we have a custom prompt (from ConfigurationPromptBuilder)
      let promptParts: any;
      if (configContext.enrichedContext?.customPrompt) {
        // Use the custom prompt directly as a PromptParts object
        promptParts = {
          system: "You are an n8n workflow configuration expert. Configure nodes based on the user's requirements.",
          user: prompt,
          prefill: '{"operations":['
        };
        this.logger.debug('Using custom configuration prompt from ConfigurationPromptBuilder');
      } else {
        // Generate the OPTIMIZED configuration prompt using essentials
        promptParts = ConfigurationPrompts.getConfigurationPrompt(
          prompt,
          selectedNodes,
          configContext.nodeSchemas || {}, // This now contains essentials (5KB)
          {}, // No templates needed - essentials are sufficient
          {}, // No property searches - essentials have everything
          {}, // No documentation needed - essentials include examples
          { optimized: true, essentialsOnly: true },
          configContext.discoveredNodes || []
        );
      }
      
      // Call Claude for configuration operations
      const result = await this.callClaude<ConfigurationOperationsResponse>(
        promptParts,
        TOKEN_LIMITS.configuration,
        configurationOperationsResponseSchema as any,
        'generateConfiguration'
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
      
      this.logSuccess('Configuration phase', {
        operations: enhancedOperations.length,
        nodesConfigured: enhancedOperations.filter(op => op.type === 'configureNode').length,
      });
      
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

}