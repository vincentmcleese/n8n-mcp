/**
 * Discovery Phase Service
 * 
 * Handles the discovery phase of workflow generation, including:
 * - Intent analysis
 * - Node discovery and selection
 * - Clarification handling
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from './base';
import { DiscoveryPrompts } from '../prompts/discovery';
import { TOKEN_LIMITS } from '../constants';
import { 
  intentAnalysisSchema,
  discoveryOperationsResponseSchema,
  type z
} from '../validation/schemas';
import type { 
  WorkflowOperation,
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse 
} from '@/types';

// ==========================================
// Type Definitions
// ==========================================

export interface DiscoveryInput {
  prompt: string;
  sessionId: string;
  mode?: 'fresh' | 'incremental';
  context?: DiscoveryContext;
}

export interface DiscoveryContext {
  mcpDiscoveredNodes?: any[];
  searchKeywords?: string[];
  analysisIntent?: string;
  existingNodes?: any[];
  existingSelectedIds?: string[];
  newlyDiscoveredNodes?: any[];
  clarificationResponse?: string;
}

export interface DiscoveryOutput {
  operations: WorkflowOperation[];
  reasoning: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IntentAnalysisInput {
  prompt: string;
}

export interface ClarificationInput {
  originalPrompt: string;
  questionId: string;
  question: string;
  response: string;
  existingState: {
    discovered: number;
    selected: number;
    nodes?: any[];
  };
}

// ==========================================
// Discovery Phase Service Implementation
// ==========================================

export class DiscoveryPhaseService extends BasePhaseService<DiscoveryInput, DiscoveryOutput> {
  get phaseName(): string {
    return 'discovery';
  }

  /**
   * Execute the discovery phase
   */
  async execute(
    input: DiscoveryInput,
    context: PhaseContext
  ): Promise<PhaseResult<DiscoveryOutput>> {
    const { prompt, mode = 'fresh', context: discoveryContext } = input;
    
    this.logger.debug(`Starting ${mode} discovery phase`);
    
    try {
      if (mode === 'incremental' && discoveryContext?.clarificationResponse) {
        // Handle incremental discovery for clarification
        return await this.handleIncrementalDiscovery(
          prompt,
          discoveryContext,
          context
        );
      } else {
        // Fresh discovery
        return await this.handleFreshDiscovery(
          prompt,
          discoveryContext || {},
          context
        );
      }
    } catch (error) {
      this.logError('discovery phase', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Analyze user intent to determine what to search for
   */
  async analyzeIntent(input: IntentAnalysisInput): Promise<PhaseResult<ClaudeAnalysisResponse>> {
    this.logger.debug('Analyzing workflow intent');
    
    // Handle empty or whitespace-only prompts
    if (!input.prompt || !input.prompt.trim()) {
      this.logger.debug('Empty prompt detected, returning minimal analysis');
      return {
        success: true,
        data: {
          intent: 'No workflow intent provided',
          requiredCapabilities: [],
          suggestedSearchTerms: [],
          nodeRecommendations: [],
          reasoning: ['Empty or invalid prompt provided'],
        },
      };
    }
    
    // Get the prompt
    const promptParts = DiscoveryPrompts.getIntentAnalysisPrompt(input.prompt);
    
    // Call Claude with the intent analysis prompt
    const result = await this.callClaude<ClaudeAnalysisResponse>(
      promptParts,
      TOKEN_LIMITS.intentAnalysis,
      intentAnalysisSchema as any,
      'analyzeIntent'
    );
    
    if (result.success && result.data) {
      this.logSuccess('Intent analysis', {
        searchTerms: result.data.suggestedSearchTerms,
        recommendations: result.data.nodeRecommendations?.length || 0,
      });
    }
    
    return result;
  }

  /**
   * Handle fresh discovery
   */
  private async handleFreshDiscovery(
    prompt: string,
    discoveryContext: DiscoveryContext,
    phaseContext: PhaseContext
  ): Promise<PhaseResult<DiscoveryOutput>> {
    this.logger.debug('Processing fresh discovery');
    
    // Build the discovery prompt
    const promptParts = DiscoveryPrompts.getDiscoveryPrompt({
      userIntent: prompt,
      sessionId: phaseContext.sessionId,
      mcpDiscoveredNodes: discoveryContext.mcpDiscoveredNodes || [],
      searchKeywords: discoveryContext.searchKeywords || [],
      isIncremental: false,
    });
    
    // Call Claude for discovery operations
    const result = await this.callClaude<DiscoveryOperationsResponse>(
      promptParts,
      TOKEN_LIMITS.discovery,
      discoveryOperationsResponseSchema as any,
      'discovery'
    );
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || new Error('Failed to generate discovery operations'),
        usage: result.usage,
      };
    }
    
    // Process and enhance operations
    const enhancedOperations = this.attachReasoningToOperations(
      result.data.operations || [],
      result.data.reasoning || []
    );
    
    this.logSuccess('Discovery phase', {
      operations: enhancedOperations.length,
      discoverOps: enhancedOperations.filter(op => op.type === 'discoverNode').length,
      selectOps: enhancedOperations.filter(op => op.type === 'selectNode').length,
      clarifications: enhancedOperations.filter(op => op.type === 'requestClarification').length,
    });
    
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
  }

  /**
   * Handle incremental discovery for clarification responses
   */
  private async handleIncrementalDiscovery(
    originalPrompt: string,
    discoveryContext: DiscoveryContext,
    phaseContext: PhaseContext
  ): Promise<PhaseResult<DiscoveryOutput>> {
    this.logger.debug('Processing incremental discovery for clarification');
    
    if (!discoveryContext.clarificationResponse) {
      return {
        success: false,
        error: new Error('No clarification response provided for incremental discovery'),
      };
    }
    
    // Build the incremental discovery prompt
    const promptParts = DiscoveryPrompts.getDiscoveryPrompt({
      userIntent: originalPrompt,
      sessionId: phaseContext.sessionId,
      isIncremental: true,
      existingNodes: discoveryContext.existingNodes || [],
      existingSelectedIds: discoveryContext.existingSelectedIds || [],
      newNodes: discoveryContext.newlyDiscoveredNodes || [],
      clarificationResponse: discoveryContext.clarificationResponse,
    });
    
    // Call Claude for additional operations
    const result = await this.callClaude<DiscoveryOperationsResponse>(
      promptParts,
      TOKEN_LIMITS.discovery,
      discoveryOperationsResponseSchema as any,
      'incrementalDiscovery'
    );
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || new Error('Failed to generate incremental discovery operations'),
        usage: result.usage,
      };
    }
    
    // Process and enhance operations
    const enhancedOperations = this.attachReasoningToOperations(
      result.data.operations || [],
      result.data.reasoning || []
    );
    
    const newDiscoverOps = enhancedOperations.filter(op => op.type === 'discoverNode').length;
    const newSelectOps = enhancedOperations.filter(op => op.type === 'selectNode').length;
    
    this.logSuccess('Incremental discovery', {
      newOperations: enhancedOperations.length,
      newDiscoverOps,
      newSelectOps,
    });
    
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
  }

  /**
   * Handle clarification response
   */
  async handleClarification(
    input: ClarificationInput
  ): Promise<PhaseResult<DiscoveryOutput>> {
    this.logger.debug(`Handling clarification response for question ${input.questionId}`);
    
    // Get the clarification handling prompt
    const promptParts = DiscoveryPrompts.getClarificationHandlingPrompt(
      input.originalPrompt,
      input.questionId,
      input.question,
      input.response,
      input.existingState
    );
    
    // Call Claude for additional operations based on clarification
    const result = await this.callClaude<DiscoveryOperationsResponse>(
      promptParts,
      TOKEN_LIMITS.discovery,
      discoveryOperationsResponseSchema as any,
      'clarificationHandling'
    );
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || new Error('Failed to process clarification response'),
        usage: result.usage,
      };
    }
    
    // Process and enhance operations
    const enhancedOperations = this.attachReasoningToOperations(
      result.data.operations || [],
      result.data.reasoning || []
    );
    
    this.logSuccess('Clarification handling', {
      operations: enhancedOperations.length,
      reasoning: result.data.reasoning?.length || 0,
    });
    
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
  }

  /**
   * Validate discovery output
   */
  validateOutput(output: DiscoveryOutput): boolean {
    // Check that we have operations
    if (!output.operations || output.operations.length === 0) {
      this.logWarning('validateOutput', 'No operations generated');
      return false;
    }
    
    // Check for at least one discover or clarification operation
    const hasValidOperations = output.operations.some(op => 
      op.type === 'discoverNode' || 
      op.type === 'selectNode' || 
      op.type === 'requestClarification'
    );
    
    if (!hasValidOperations) {
      this.logWarning('validateOutput', 'No valid discovery operations found');
      return false;
    }
    
    // Check that discovered nodes have corresponding select operations (unless clarification)
    const discoveredNodeIds = new Set(
      output.operations
        .filter(op => op.type === 'discoverNode')
        .map(op => (op as any).node?.id)
        .filter(Boolean)
    );
    
    const selectedNodeIds = new Set(
      output.operations
        .filter(op => op.type === 'selectNode')
        .map(op => (op as any).nodeId)
        .filter(Boolean)
    );
    
    // It's okay if not all discovered nodes are selected
    // But selected nodes should be discovered first
    for (const selectedId of selectedNodeIds) {
      if (!discoveredNodeIds.has(selectedId)) {
        this.logWarning('validateOutput', `Node ${selectedId} selected but not discovered`);
        // This is a warning, not a failure - Claude might have reasons
      }
    }
    
    return true;
  }
}