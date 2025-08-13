/**
 * Discovery Phase Service
 *
 * Handles the discovery phase of workflow generation, including:
 * - Intent analysis
 * - Node discovery and selection
 * - Clarification handling
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from "./base";
import { DiscoveryPrompts } from "../prompts/discovery";
import { TOKEN_LIMITS } from "../constants";
import {
  intentAnalysisSchema,
  discoveryOperationsResponseSchema,
} from "../validation/schemas";
import type {
  WorkflowOperation,
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse,
} from "@/types";
import { DISCOVERY_TOOLS } from "@/lib/mcp-tools/definitions";

// ==========================================
// Type Definitions
// ==========================================

export interface DiscoveryInput {
  prompt: string;
  sessionId: string;
  mode?: "fresh" | "incremental";
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

export class DiscoveryPhaseService extends BasePhaseService<
  DiscoveryInput,
  DiscoveryOutput
> {
  get phaseName(): string {
    return "discovery";
  }

  async execute(
    input: DiscoveryInput,
    context: PhaseContext
  ): Promise<PhaseResult<DiscoveryOutput>> {
    // High-level execute stub to satisfy abstract contract
    // The orchestrator uses dedicated methods for specific actions.
    const intent = await this.analyzeIntent({ prompt: input.prompt });
    if (!intent.success || !intent.data) {
      return {
        success: false,
        error: intent.error,
      } as PhaseResult<DiscoveryOutput>;
    }
    return {
      success: true,
      data: { operations: [], reasoning: intent.reasoning || [] },
    } as PhaseResult<DiscoveryOutput>;
  }

  /**
   * Select nodes from gap search results
   */
  async selectFromGapResults(input: {
    prompt: string;
    sessionId: string;
    intentAnalysis: ClaudeAnalysisResponse;
    gapResults: any;
    formattedResults: string; // Pre-formatted by GapSearchService
  }): Promise<PhaseResult<DiscoveryOperationsResponse>> {
    this.logger.debug("Selecting nodes from gap search results");

    // Create selection prompt - EXACT same structure as before
    const selectionPrompt = `Based on the user's request: "${input.prompt}"

We've already fetched ${input.intentAnalysis.matched_tasks.length} pre-configured task templates.

Now select the BEST node for each capability gap from these search results:

${input.formattedResults}

For each capability, select ONE node that best matches the requirement.
Generate discoverNode and selectNode operations for your selections.

Selection criteria:
1. Exact functionality match
2. Popularity and reliability
3. Configuration simplicity
4. Integration with existing task nodes

Return operations in the standard format.`;

    // Use the same prompt structure as other discovery prompts
    const promptParts = {
      system: `You are a workflow automation expert. Select the best nodes from search results to fulfill capability gaps.

Return a JSON object with an "operations" array containing discoverNode and selectNode operations.

CRITICAL FIELD DEFINITIONS:
- Operation "type": Always "discoverNode" or "selectNode" (the operation being performed)
- Node "type": The exact nodeType from search results (e.g., "nodes-base.if", "nodes-base.slack")
  - Always follows pattern: "nodes-base.nodeName" or "@n8n/n8n-nodes-langchain.nodeName"
  - NEVER use the category (like "transform", "trigger", "output")
- Node "id": Always use "gap_node_placeholder" (will be assigned in build phase)

Example format:
{
  "operations": [
    {
      "type": "discoverNode",
      "node": {
        "id": "gap_node_placeholder",
        "type": "nodes-base.if",
        "displayName": "If",
        "purpose": "Route items based on conditions"
      }
    },
    {
      "type": "selectNode", 
      "nodeId": "gap_node_placeholder"
    }
  ],
  "reasoning": ["Why these nodes were selected"]
}`,
      user: selectionPrompt,
      prefill: '{"operations":[',
    };

    // Get available tools for discovery phase
    const tools = Object.values(DISCOVERY_TOOLS);

    // Call Claude for selection with tools available
    const result = await this.callClaude<DiscoveryOperationsResponse>(
      promptParts,
      TOKEN_LIMITS.discovery,
      discoveryOperationsResponseSchema as any,
      "selectFromGapResults",
      tools // Pass tools for Claude to use if needed
    );

    if (result.success && result.data) {
      // Log the actual operations Claude is returning
      this.logger.debug(
        "Claude gap selection operations:",
        JSON.stringify(result.data.operations, null, 2)
      );

      // Specifically log any IF node selections
      result.data.operations?.forEach((op: any) => {
        if (op.type === "discoverNode" && op.node) {
          if (
            op.node.type?.toLowerCase().includes("if") ||
            op.node.type === "transform" ||
            op.node.displayName?.toLowerCase().includes("if")
          ) {
            this.logger.info("Claude selected node details:", {
              nodeId: op.node.id,
              nodeType: op.node.type,
              displayName: op.node.displayName,
              purpose: op.node.purpose,
            });
          }
        }
      });

      this.logSuccess("Gap node selection", {
        operationsCount: result.data.operations?.length || 0,
      });
    }

    return result;
  }

  /**
   * Analyze user intent to determine what to search for
   */
  async analyzeIntent(
    input: IntentAnalysisInput
  ): Promise<PhaseResult<ClaudeAnalysisResponse>> {
    this.logger.debug("Analyzing workflow intent");

    // Handle empty or whitespace-only prompts
    if (!input.prompt || !input.prompt.trim()) {
      this.logger.debug("Empty prompt detected, returning minimal analysis");
      return {
        success: true,
        data: {
          intent: "No workflow intent provided",
          logic_flow: [],
          matched_tasks: [],
          unmatched_capabilities: [],
          search_suggestions: [],
          workflow_pattern: "unknown",
          complexity: "unknown",
          clarification_needed: false,
          reasoning: ["Empty or invalid prompt provided"],
        } as any,
      };
    }

    // Get the prompt
    const promptParts = DiscoveryPrompts.getIntentAnalysisPrompt(input.prompt);

    // Get available tools for discovery phase
    const tools = Object.values(DISCOVERY_TOOLS);

    // Call Claude with the intent analysis prompt and tools
    const result = await this.callClaude<ClaudeAnalysisResponse>(
      promptParts,
      TOKEN_LIMITS.intentAnalysis,
      intentAnalysisSchema as any,
      "analyzeIntent",
      tools // Pass tools for Claude to use if needed
    );

    if (result.success && result.data) {
      // Log the actual data structure for new schema
      this.logSuccess("Intent analysis", {
        matchedTasks: result.data.matched_tasks?.length || 0,
        unmatchedCapabilities: result.data.unmatched_capabilities?.length || 0,
        searchSuggestions: result.data.search_suggestions?.length || 0,
        clarificationNeeded: result.data.clarification_needed || false,
      });

      // Log task selection reasoning if provided
      if (
        result.data.task_selection_reasoning &&
        result.data.task_selection_reasoning.length > 0
      ) {
        this.logger.info("[discovery] Task selection reasoning:");
        result.data.task_selection_reasoning.forEach(({ task, reason }) => {
          this.logger.info(`[discovery]   📦 ${task}: ${reason}`);
        });
      }
    } else {
      // Log detailed error information
      this.logger.error("Intent analysis failed", {
        success: result.success,
        error: result.error?.message,
        usage: result.usage,
      });
    }

    return result;
  }

  /**
   * Validate discovery output
   */
  validateOutput(output: DiscoveryOutput): boolean {
    // Check that we have operations
    if (!output.operations || output.operations.length === 0) {
      this.logWarning("validateOutput", "No operations generated");
      return false;
    }

    // Check for at least one discover or clarification operation
    const hasValidOperations = output.operations.some(
      (op) =>
        op.type === "discoverNode" ||
        op.type === "selectNode" ||
        op.type === "requestClarification"
    );

    if (!hasValidOperations) {
      this.logWarning("validateOutput", "No valid discovery operations found");
      return false;
    }

    // Check that discovered nodes have corresponding select operations (unless clarification)
    const discoveredNodeIds = new Set(
      output.operations
        .filter((op) => op.type === "discoverNode")
        .map((op) => (op as any).node?.id)
        .filter(Boolean)
    );

    const selectedNodeIds = new Set(
      output.operations
        .filter((op) => op.type === "selectNode")
        .map((op) => (op as any).nodeId)
        .filter(Boolean)
    );

    // It's okay if not all discovered nodes are selected
    // But selected nodes should be discovered first
    for (const selectedId of selectedNodeIds) {
      if (!discoveredNodeIds.has(selectedId)) {
        this.logWarning(
          "validateOutput",
          `Node ${selectedId} selected but not discovered`
        );
        // This is a warning, not a failure - Claude might have reasons
      }
    }

    return true;
  }
}
