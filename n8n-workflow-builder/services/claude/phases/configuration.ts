/**
 * Configuration Phase Service
 * 
 * Handles the configuration phase of workflow generation, including:
 * - Node configuration generation
 * - Node requirements analysis
 * - Configuration fixing based on validation errors
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from './base';
import { TOKEN_LIMITS } from '../constants';
import { 
  configurationOperationsResponseSchema,
  nodeRequirementsResponseSchema,
  type z
} from '../validation/schemas';
import { ConfigurationPrompts } from '../prompts/configuration';
import type { 
  ConfigurationOperationsResponse,
  NodeRequirementsResponse,
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

export interface NodeRequirementsInput {
  node: any;
  userPrompt: string;
  nodeEssentials: any;
}

export interface NodeConfigFixInput {
  node: any;
  config: any;
  validationErrors: string[];
  nodeContext: {
    essentials?: any;
    authProperties?: any;
    taskTemplate?: any;
    documentation?: string;
  };
}

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
      // Generate the configuration prompt
      const promptParts = ConfigurationPrompts.getConfigurationPrompt(
        prompt,
        selectedNodes,
        configContext.nodeSchemas || {},
        configContext.nodeTemplates || {},
        configContext.nodeProperties || {},
        configContext.nodeDocumentation || {},
        configContext.enrichedContext || {},
        configContext.discoveredNodes || []
      );
      
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

  /**
   * Analyze what information is needed to configure a node
   */
  async analyzeNodeRequirements(
    input: NodeRequirementsInput
  ): Promise<PhaseResult<NodeRequirementsResponse>> {
    this.logger.debug(`Analyzing information requirements for ${input.node.type}`);
    
    // Generate the requirements analysis prompt
    const promptParts = ConfigurationPrompts.getNodeRequirementsPrompt(
      input.node,
      input.userPrompt,
      input.nodeEssentials
    );
    
    // Call Claude for requirements analysis
    const result = await this.callClaude<NodeRequirementsResponse>(
      promptParts,
      TOKEN_LIMITS.nodeRequirements,
      nodeRequirementsResponseSchema as any,
      'analyzeNodeRequirements'
    );
    
    if (result.success && result.data) {
      this.logSuccess('Node requirements analysis', {
        nodeType: input.node.type,
        needsAuth: result.data.needsAuth,
        propertiesNeeded: result.data.needsProperties?.length || 0,
      });
    }
    
    return result;
  }

  /**
   * Fix node configuration based on validation errors
   */
  async fixNodeConfig(
    input: NodeConfigFixInput
  ): Promise<PhaseResult<any>> {
    this.logger.debug(
      `Fixing configuration for ${input.node.type} with ${input.validationErrors.length} errors`
    );
    
    // Generate the fix prompt
    const promptParts = ConfigurationPrompts.getFixNodeConfigPrompt(
      input.node,
      input.config,
      input.validationErrors,
      input.nodeContext
    );
    
    // Call Claude to fix the configuration
    const result = await this.callClaude<any>(
      promptParts,
      TOKEN_LIMITS.nodeConfigFix,
      undefined, // No specific schema for fixed config
      'fixNodeConfig'
    );
    
    if (result.success && result.data) {
      this.logSuccess('Node configuration fixed', {
        nodeType: input.node.type,
        errorsFixed: input.validationErrors.length,
      });
    }
    
    return result;
  }

}