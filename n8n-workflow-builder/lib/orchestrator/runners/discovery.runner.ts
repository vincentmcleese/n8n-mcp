// lib/orchestrator/runners/discovery.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  DiscoveryInput,
  DiscoveryOutput,
  ClarificationInput,
  DiscoveryRunnerDeps,
} from "@/lib/orchestrator/contracts/discovery.types";
import { DiscoveredNode, WorkflowOperation } from "@/types/workflow";
import { NodeSearchResult } from "@/lib/orchestrator/context/NodeContextService";
import { wrapPhase, PhaseContext } from "@/lib/orchestrator/utils/wrapPhase";
import { OperationLogger } from "@/lib/orchestrator/utils/OperationLogger";

/**
 * Runner for the discovery phase
 * Handles node discovery, selection, and clarification
 */
export class DiscoveryRunner implements PhaseRunner<DiscoveryInput, DiscoveryOutput> {
  constructor(private deps: DiscoveryRunnerDeps) {}

  /**
   * Run the discovery phase - wrapped with error handling and operation logging
   */
  run = wrapPhase<DiscoveryInput, DiscoveryOutput>(
    "discovery",
    async (input: DiscoveryInput, context: PhaseContext): Promise<DiscoveryOutput> => {
      const { sessionId, prompt } = input;
      const { operationLogger } = context;
      
      this.deps.loggers.orchestrator.debug(
        "Starting simplified discovery phase - trusting AI agent decisions"
      );

      // Initialize Supabase session if enabled
      await this.deps.sessionRepo.initialize(sessionId, prompt);
      
      // Try to load existing session from Supabase
      const existingSession = await this.deps.sessionRepo.load(sessionId);
      if (existingSession) {
        this.deps.loggers.orchestrator.info(
          `Recovered existing session ${sessionId} from phase: ${existingSession.state.phase}`
        );
        
        // If session exists and is past discovery, return existing discovery results
        if (existingSession.state.phase !== 'discovery' && existingSession.state.discovered.length > 0) {
          return {
            success: true,
            operations: [],
            phase: existingSession.state.phase,
            discoveredNodes: existingSession.state.discovered,
            selectedNodeIds: existingSession.state.selected,
            reasoning: [`Recovered from existing session in ${existingSession.state.phase} phase`]
          };
        }
      }

      // Step 1: Have Claude analyze the prompt and suggest what to search for
      // Set up token tracking for Claude service
      const { logger: _logger, onTokenUsage } = operationLogger.withTokenTracking();
      if (this.deps.claudeService.setOnUsageCallback) {
        this.deps.claudeService.setOnUsageCallback(onTokenUsage);
      }
      
      const analysisResult = await this.deps.claudeService.analyzeIntent({ prompt });
      if (!analysisResult.success || !analysisResult.data) {
        throw new Error('Failed to analyze workflow intent');
      }
      const analysisResponse = analysisResult.data;
      
      this.deps.loggers.orchestrator.debug(
        "Claude suggests searching for:",
        analysisResponse.suggestedSearchTerms
      );
      this.deps.loggers.orchestrator.debug(
        "Node recommendations:",
        analysisResponse.nodeRecommendations.map((r) => r.type)
      );

      // Step 2: Simple search - just search for what Claude suggests
      const searchResults = await this.searchNodes(analysisResponse.suggestedSearchTerms);

      this.deps.loggers.orchestrator.debug(
        `Found ${searchResults.length} nodes from search`
      );

      // Step 3: Get node details for ALL search results
      const nodeDetails = await this.getNodeDetails(searchResults);

      // Step 4: Have Claude select and design the workflow with discovered nodes
      this.deps.loggers.orchestrator.debug(
        `Sending ${nodeDetails.length} nodes to Claude for workflow design`
      );

      const claudeResult = await this.deps.claudeService.execute(
        {
          prompt,
          sessionId,
          mode: 'fresh',
          context: {
            mcpDiscoveredNodes: nodeDetails,
            analysisIntent: analysisResponse.intent,
            searchKeywords: analysisResponse.suggestedSearchTerms,
          }
        },
        { sessionId }
      );
      
      if (!claudeResult.success || !claudeResult.data) {
        throw new Error('Failed to generate discovery operations');
      }
      const claudeResponse = claudeResult.data;

      // Process operations
      const { discoveredNodes, selectedNodeIds, pendingClarification } = 
        this.processDiscoveryOperations(claudeResponse.operations, nodeDetails);

      // Log operations via OperationLogger instead of direct persistence
      if (claudeResponse.operations && claudeResponse.operations.length > 0) {
        await operationLogger.logBatch(claudeResponse.operations);
      }

      // Log phase completion
      await operationLogger.logPhaseCompletion(
        (analysisResult.usage?.totalTokens || 0) + (claudeResult.usage?.totalTokens || 0)
      );
      
      // Log summary at INFO level
      this.deps.loggers.orchestrator.info(
        `Discovery completed: ${discoveredNodes.length} nodes discovered, ${selectedNodeIds.length} selected`
      );
      if (discoveredNodes.length > 0 && discoveredNodes.length <= 5) {
        const nodeTypes = discoveredNodes.map(n => n.type).join(', ');
        this.deps.loggers.orchestrator.info(`   Discovered nodes: ${nodeTypes}`);
      }
      if (pendingClarification) {
        this.deps.loggers.orchestrator.info(`   ❓ Clarification needed: ${pendingClarification.question.substring(0, 100)}...`);
      }

      return {
        success: true,
        operations: claudeResponse.operations,
        phase: "discovery",
        discoveredNodes,
        selectedNodeIds,
        pendingClarification,
        reasoning: claudeResponse.reasoning,
      };
    }
  );

  /**
   * Handle clarification response with incremental discovery
   */
  async handleClarification(input: ClarificationInput): Promise<DiscoveryOutput> {
    const { sessionId, questionId, response } = input;
    
    this.deps.loggers.orchestrator.debug(
      `Processing answer for question: ${questionId}`
    );
    this.deps.loggers.orchestrator.debug(`User response: "${response}"`);

    // Try to load from Supabase first
    const supabaseSession = await this.deps.sessionRepo.load(sessionId);
    if (!supabaseSession) {
      return {
        success: false,
        operations: [],
        phase: "discovery",
        discoveredNodes: [],
        selectedNodeIds: [],
        error: {
          type: "validation",
          code: "SESSION_NOT_FOUND",
          message: `Session ${sessionId} not found`,
          userMessage: "Session not found. Please start a new workflow.",
          retryable: false,
        },
      };
    }

    const existingDiscoveredNodes = supabaseSession.state.discovered;
    const existingSelectedNodeIds = supabaseSession.state.selected;
    const clarificationHistory = supabaseSession.state.clarificationHistory || [];
    const originalPrompt = supabaseSession.state.userPrompt || "";

    // Create clarification response operation
    const clarificationOp: WorkflowOperation = {
      type: "clarificationResponse",
      questionId,
      response,
    };

    this.deps.loggers.orchestrator.debug(
      `Only searching for additional nodes based on: "${response}"`
    );

    // Step 1: Extract new search terms from clarification response
    const clarificationAnalysisResult = await this.deps.claudeService.analyzeIntent({
      prompt: `Based on this clarification: "${response}", what additional nodes should we search for? Context: ${originalPrompt}`
    });
    if (!clarificationAnalysisResult.success || !clarificationAnalysisResult.data) {
      throw new Error('Failed to analyze clarification');
    }
    const clarificationAnalysis = clarificationAnalysisResult.data;

    this.deps.loggers.orchestrator.debug(
      `Claude suggests searching for additional terms: ${clarificationAnalysis.suggestedSearchTerms.join(", ")}`
    );

    // Step 2: Search ONLY for new nodes based on clarification
    const newSearchResults = await this.searchNewNodes(
      clarificationAnalysis.suggestedSearchTerms,
      existingDiscoveredNodes
    );

    this.deps.loggers.orchestrator.debug(
      `Total new nodes found: ${newSearchResults.length}`
    );

    // Step 3: Process clarification with existing context
    const claudeResult = await this.deps.claudeService.execute(
      {
        prompt: originalPrompt,
        sessionId,
        mode: 'incremental',
        context: {
          clarificationResponse: response,
          existingNodes: existingDiscoveredNodes,
          existingSelectedIds: existingSelectedNodeIds,
          newlyDiscoveredNodes: newSearchResults,
        }
      },
      { sessionId }
    );
    
    if (!claudeResult.success || !claudeResult.data) {
      throw new Error('Failed to process clarification');
    }
    const claudeResponse = claudeResult.data;

    // Process operations - merge with existing state
    const { newDiscoveredNodes, newSelectedNodeIds, newPendingClarification } = 
      this.processIncrementalOperations(
        claudeResponse.operations,
        existingDiscoveredNodes,
        existingSelectedNodeIds
      );

    this.deps.loggers.orchestrator.debug(`Incremental update complete:`);
    this.deps.loggers.orchestrator.debug(
      `  - New nodes discovered: ${newDiscoveredNodes.length}`
    );
    this.deps.loggers.orchestrator.debug(
      `  - Additional nodes selected: ${newSelectedNodeIds.length}`
    );
    this.deps.loggers.orchestrator.debug(
      `  - Total nodes now: ${existingDiscoveredNodes.length + newDiscoveredNodes.length}`
    );

    // Always preserve existing state even if Claude asks for more clarification
    return {
      success: true,
      operations: [clarificationOp, ...claudeResponse.operations],
      phase: "discovery",
      discoveredNodes: [...existingDiscoveredNodes, ...newDiscoveredNodes],
      selectedNodeIds: [...existingSelectedNodeIds, ...newSelectedNodeIds],
      pendingClarification: newPendingClarification,
      reasoning: claudeResponse.reasoning,
    };
  }

  /**
   * Search for nodes based on search terms
   */
  private async searchNodes(searchTerms: string[]): Promise<NodeSearchResult[]> {
    const searchResults: NodeSearchResult[] = [];

    // Handle empty search terms
    if (searchTerms.length === 0) {
      this.deps.loggers.orchestrator.debug(
        "No search terms suggested - likely invalid prompt"
      );
      return searchResults;
    }

    // Search for each term Claude suggested
    for (const searchTerm of searchTerms) {
      try {
        const results = await this.deps.nodeContextService.searchNodes(searchTerm, 3);
        
        // Add nodes that aren't already in our list
        results.forEach((node) => {
          if (!searchResults.some((n) => n.nodeType === node.nodeType)) {
            searchResults.push(node);
          }
        });
      } catch (error) {
        this.deps.loggers.orchestrator.error(`Error searching nodes:`, error);
      }
    }

    return searchResults;
  }

  /**
   * Get detailed information for nodes
   */
  private async getNodeDetails(searchResults: NodeSearchResult[]): Promise<any[]> {
    const nodeDetails: any[] = [];
    const nodesToDetail = searchResults; // Send ALL nodes to Claude, no filtering!

    this.deps.loggers.orchestrator.debug(
      `Getting details for all ${nodesToDetail.length} discovered nodes (trusting Claude to filter)`
    );

    for (const node of nodesToDetail) {
      try {
        const nodeInfo = await this.deps.nodeContextService.getNodeInfo(node.nodeType);

        if (nodeInfo) {
          nodeDetails.push({
            type: node.nodeType,
            displayName: nodeInfo.displayName || node.displayName,
            description: nodeInfo.description || node.description,
            category: nodeInfo.defaults?.group?.[0] || node.category || "other",
          });
        } else {
          // Still include basic info if we couldn't get details
          nodeDetails.push({
            type: node.nodeType,
            displayName: node.displayName,
            description: node.description,
            category: node.category || "other",
          });
        }
      } catch (error) {
        this.deps.loggers.orchestrator.error(
          `Error getting info for ${node.nodeType}:`,
          error
        );
        // Still include basic info
        nodeDetails.push({
          type: node.nodeType,
          displayName: node.displayName,
          description: node.description,
          category: node.category || "other",
        });
      }
    }

    return nodeDetails;
  }

  /**
   * Process discovery operations to extract nodes and selections
   */
  private processDiscoveryOperations(
    operations: WorkflowOperation[],
    nodeDetails: any[]
  ): {
    discoveredNodes: DiscoveredNode[];
    selectedNodeIds: string[];
    pendingClarification?: { questionId: string; question: string };
  } {
    const discoveredNodes: DiscoveredNode[] = [];
    const selectedNodeIds: string[] = [];
    const clarificationQuestions: Array<{ questionId: string; question: string }> = [];

    for (const operation of operations) {
      switch (operation.type) {
        case "discoverNode":
          // Enrich the node with displayName from nodeDetails
          const nodeDetail = nodeDetails.find((n) => n.type === operation.node.type);
          const enrichedNode = {
            ...operation.node,
            displayName: nodeDetail?.displayName || operation.node.displayName || operation.node.type,
          };
          discoveredNodes.push(enrichedNode);
          break;
          
        case "selectNode":
          selectedNodeIds.push(operation.nodeId);
          break;
          
        case "requestClarification":
          clarificationQuestions.push({
            questionId: operation.questionId,
            question: operation.question,
          });
          break;
      }
    }

    // If we have clarification questions, combine them into a single question
    let pendingClarification = undefined;
    if (clarificationQuestions.length > 0) {
      const combinedQuestion =
        clarificationQuestions.length === 1
          ? clarificationQuestions[0].question
          : `I need clarification on a few things:\n\n${clarificationQuestions
              .map((q, i) => `${i + 1}. ${q.question}`)
              .join("\n\n")}`;

      pendingClarification = {
        questionId: clarificationQuestions.map((q) => q.questionId).join(","),
        question: combinedQuestion,
      };

      this.deps.loggers.orchestrator.debug(
        `Combined ${clarificationQuestions.length} clarification questions`
      );
    }

    return { discoveredNodes, selectedNodeIds, pendingClarification };
  }

  /**
   * Search for new nodes not already discovered
   */
  private async searchNewNodes(
    searchTerms: string[],
    existingNodes: DiscoveredNode[]
  ): Promise<any[]> {
    const newSearchResults: any[] = [];

    for (const searchTerm of searchTerms) {
      // Skip if we already have nodes of this type
      const alreadyHaveType = existingNodes.some(
        (node) =>
          node.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (node.displayName && node.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      if (alreadyHaveType) {
        this.deps.loggers.orchestrator.debug(
          `Skipping search for "${searchTerm}" - already have nodes of this type`
        );
        continue;
      }

      try {
        const results = await this.deps.nodeContextService.searchNodes(searchTerm, 3);
        
        // Filter out nodes we already have
        const newNodes = results.filter(
          (node: any) => !existingNodes.some((existing) => existing.type === node.nodeType)
        );

        this.deps.loggers.orchestrator.debug(
          `Found ${newNodes.length} new nodes for "${searchTerm}"`
        );
        newSearchResults.push(...newNodes);
      } catch (error) {
        this.deps.loggers.orchestrator.error(`Error searching for "${searchTerm}":`, error);
      }
    }

    return newSearchResults;
  }

  /**
   * Process incremental operations for clarification
   */
  private processIncrementalOperations(
    operations: WorkflowOperation[],
    existingDiscoveredNodes: DiscoveredNode[],
    existingSelectedNodeIds: string[]
  ): {
    newDiscoveredNodes: DiscoveredNode[];
    newSelectedNodeIds: string[];
    newPendingClarification?: { questionId: string; question: string };
  } {
    const newDiscoveredNodes: DiscoveredNode[] = [];
    const newSelectedNodeIds: string[] = [];
    const followUpClarifications: Array<{ questionId: string; question: string }> = [];

    for (const operation of operations) {
      if (operation.type === "discoverNode") {
        // Only add if not already discovered
        if (!existingDiscoveredNodes.some((n) => n.id === operation.node.id)) {
          // Ensure the node has a displayName
          const enrichedNode = {
            ...operation.node,
            displayName: operation.node.displayName || operation.node.type,
          };
          newDiscoveredNodes.push(enrichedNode);
          this.deps.loggers.orchestrator.debug(
            `Added new node: ${operation.node.type} (${operation.node.id})`
          );
        }
      } else if (operation.type === "selectNode") {
        // Only add if not already selected
        if (!existingSelectedNodeIds.includes(operation.nodeId)) {
          newSelectedNodeIds.push(operation.nodeId);
          this.deps.loggers.orchestrator.debug(`Selected additional node: ${operation.nodeId}`);
        }
      } else if (operation.type === "requestClarification") {
        // Collect follow-up clarification requests
        followUpClarifications.push({
          questionId: operation.questionId,
          question: operation.question,
        });
      }
    }

    // If we have follow-up clarifications, combine them
    let newPendingClarification = undefined;
    if (followUpClarifications.length > 0) {
      const combinedQuestion =
        followUpClarifications.length === 1
          ? followUpClarifications[0].question
          : `I need clarification on a few more things:\n\n${followUpClarifications
              .map((q, i) => `${i + 1}. ${q.question}`)
              .join("\n\n")}`;

      newPendingClarification = {
        questionId: followUpClarifications.map((q) => q.questionId).join(","),
        question: combinedQuestion,
      };

      this.deps.loggers.orchestrator.debug(
        `${followUpClarifications.length} follow-up clarification(s) needed`
      );
    }

    return { newDiscoveredNodes, newSelectedNodeIds, newPendingClarification };
  }
}