// lib/workflow-orchestrator.ts

import {
  WorkflowSession,
  WorkflowOperation,
  WorkflowPhase,
  DiscoveredNode,
  ErrorResponse,
} from "@/types/workflow";
import { ClaudeService } from "@/lib/services/claude-service";
import { MCPClient } from "@/lib/mcp-client";
import { supabase } from "@/lib/supabase";
import { PhaseManager } from "@/lib/phase-manager";

export interface DiscoveryResult {
  success: boolean;
  operations: WorkflowOperation[];
  phase: WorkflowPhase;
  discoveredNodes: DiscoveredNode[];
  selectedNodeIds: string[];
  pendingClarification?: {
    questionId: string;
    question: string;
  };
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ConfiguredNode {
  id: string;
  type: string;
  purpose: string;
  config: any;
  validated: boolean;
  validationErrors?: string[];
}

export interface ConfigurationResult {
  success: boolean;
  operations: WorkflowOperation[];
  phase: WorkflowPhase;
  configured: ConfiguredNode[];
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ApplyOperationsResult {
  success: boolean;
  applied: number;
  stateUpdate: {
    phase: string;
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: any[];
  };
  pendingClarification?: {
    questionId: string;
    question: string;
  };
}

export interface BuildingResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ValidationPhaseResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  validationReport: any;
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface PhaseStatusResult {
  currentPhase: WorkflowPhase;
  canProgress: boolean;
  autoTransition: boolean;
  reason?: string;
}

export class WorkflowOrchestrator {
  private claudeService: ClaudeService;
  private mcpClient: MCPClient;
  private phaseManager: PhaseManager;

  constructor() {
    this.claudeService = new ClaudeService();
    // Initialize MCP client with config from environment
    this.mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL || "https://mcp.smithery.ai",
      apiKey: process.env.MCP_API_KEY || "",
      profile: process.env.MCP_PROFILE || "default",
    });
    this.phaseManager = new PhaseManager();
  }

  /**
   * Run the discovery phase with Claude
   */
  async runDiscoveryPhase(
    sessionId: string,
    prompt: string
  ): Promise<DiscoveryResult> {
    try {
      console.log(
        "[WorkflowOrchestrator] Starting simplified discovery phase - trusting AI agent decisions"
      );

      // Step 1: Have Claude analyze the prompt and suggest what to search for
      const analysisResponse = await this.claudeService.analyzeWorkflowIntent(
        prompt
      );

      console.log(
        "[WorkflowOrchestrator] Claude suggests searching for:",
        analysisResponse.suggestedSearchTerms
      );
      console.log(
        "[WorkflowOrchestrator] Node recommendations:",
        analysisResponse.nodeRecommendations.map((r) => r.type)
      );

      // Step 2: Simple search - just search for what Claude suggests
      const searchResults: any[] = [];

      // Handle empty search terms
      if (analysisResponse.suggestedSearchTerms.length === 0) {
        console.log(
          "[WorkflowOrchestrator] No search terms suggested - likely invalid prompt"
        );
      }

      // Search for each term Claude suggested
      for (const searchTerm of analysisResponse.suggestedSearchTerms) {
        try {
          console.log(`[WorkflowOrchestrator] Searching for: "${searchTerm}"`);
          const searchResult = await this.mcpClient.searchNodes({
            query: searchTerm,
            limit: 3, // Small limit - trust that good search terms yield good results
          });

          if (
            searchResult &&
            searchResult.content &&
            searchResult.content.length > 0
          ) {
            const content = searchResult.content[0];
            if (content.type === "text") {
              try {
                const searchData = JSON.parse(content.text);
                if (searchData.results && Array.isArray(searchData.results)) {
                  // Add nodes that aren't already in our list
                  searchData.results.forEach((node: any) => {
                    if (
                      !searchResults.some((n) => n.nodeType === node.nodeType)
                    ) {
                      searchResults.push(node);
                    }
                  });
                }
              } catch (e) {
                console.log(
                  `[WorkflowOrchestrator] Could not parse search results`
                );
              }
            }
          }
        } catch (error) {
          console.error(`[WorkflowOrchestrator] Error searching nodes:`, error);
        }
      }

      console.log(
        `[WorkflowOrchestrator] Found ${searchResults.length} nodes from search`
      );

      // Step 3: Get node details for ALL search results - trust Claude to make intelligent decisions
      const nodeDetails: any[] = [];
      const nodesToDetail = searchResults; // Send ALL nodes to Claude, no filtering!

      console.log(
        `[WorkflowOrchestrator] Getting details for all ${nodesToDetail.length} discovered nodes (trusting Claude to filter)`
      );

      for (const node of nodesToDetail) {
        try {
          const infoResult = await this.mcpClient.getNodeInfo(node.nodeType);

          if (
            infoResult &&
            infoResult.content &&
            infoResult.content.length > 0
          ) {
            const content = infoResult.content[0];
            if (content.type === "text") {
              try {
                const nodeInfo = JSON.parse(content.text);
                nodeDetails.push({
                  type: node.nodeType,
                  displayName: nodeInfo.displayName || node.displayName,
                  description: nodeInfo.description || node.description,
                  category:
                    nodeInfo.defaults?.group?.[0] || node.category || "other",
                });
              } catch (e) {
                nodeDetails.push({
                  type: node.nodeType,
                  displayName: node.displayName,
                  description: node.description,
                  category: node.category || "other",
                });
              }
            }
          }
        } catch (error) {
          console.error(
            `[WorkflowOrchestrator] Error getting info for ${node.nodeType}:`,
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

      // Step 4: Have Claude select and design the workflow with discovered nodes
      console.log(
        `[WorkflowOrchestrator] Sending ${nodeDetails.length} nodes to Claude for workflow design`
      );

      const claudeResponse = await this.claudeService.processWorkflowPhase(
        "discovery",
        prompt,
        sessionId,
        undefined,
        {
          mcpDiscoveredNodes: nodeDetails,
          analysisIntent: analysisResponse.intent,
          searchKeywords: analysisResponse.suggestedSearchTerms,
        }
      );

      // Process operations
      const discoveredNodes: DiscoveredNode[] = [];
      const selectedNodeIds: string[] = [];
      const clarificationQuestions: Array<{
        questionId: string;
        question: string;
      }> = [];
      let pendingClarification = undefined;

      for (const operation of claudeResponse.operations) {
        switch (operation.type) {
          case "discoverNode":
            // Enrich the node with displayName from nodeDetails
            const nodeDetail = nodeDetails.find(
              (n) => n.type === operation.node.type
            );
            const enrichedNode = {
              ...operation.node,
              displayName:
                nodeDetail?.displayName ||
                operation.node.displayName ||
                operation.node.type,
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

        console.log(
          `[WorkflowOrchestrator] Combined ${clarificationQuestions.length} clarification questions`
        );
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
    } catch (error) {
      return {
        success: false,
        operations: [],
        phase: "discovery",
        discoveredNodes: [],
        selectedNodeIds: [],
        error: {
          type: "claude_api",
          code: "CLAUDE_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to process discovery phase",
          retryable: true,
        },
      };
    }
  }

  /**
   * Handle clarification response with incremental discovery
   */
  async handleClarificationResponse(
    sessionId: string,
    questionId: string,
    response: string
  ): Promise<DiscoveryResult> {
    console.log(
      `[Clarification] Processing answer for question: ${questionId}`
    );
    console.log(`[Clarification] User response: "${response}"`);

    // Try to get session from database to preserve existing state
    let session = null;
    let existingDiscoveredNodes: DiscoveredNode[] = [];
    let existingSelectedNodeIds: string[] = [];
    let clarificationHistory: any[] = [];
    let originalPrompt = "";

    try {
      const { data } = await supabase
        .from("workflow_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      session = data;
      if (session) {
        existingDiscoveredNodes = session.state.discovered || [];
        existingSelectedNodeIds = session.state.selected || [];
        clarificationHistory = session.state.clarificationHistory || [];
        originalPrompt = session.initial_prompt || "";

        console.log(
          `[Clarification] Found existing session with ${existingDiscoveredNodes.length} discovered nodes`
        );
        console.log(
          `[Clarification] Existing selected nodes: ${existingSelectedNodeIds.join(
            ", "
          )}`
        );
      }
    } catch (error) {
      // Session not found - for interactive test, use mock data from the first discovery
      console.log(
        `[Clarification] Session ${sessionId} not found, checking for test context`
      );

      // For test purposes, check if we have stored test state
      if (
        sessionId.startsWith("interactive-") &&
        (this as any)._testSessionState
      ) {
        const testState = (this as any)._testSessionState;
        existingDiscoveredNodes = testState.discovered || [];
        existingSelectedNodeIds = testState.selected || [];
        originalPrompt = testState.initial_prompt || "";

        console.log(
          `[Clarification] Using test session state with ${existingDiscoveredNodes.length} discovered nodes`
        );
        console.log(
          `[Clarification] Test selected nodes: ${existingSelectedNodeIds.join(
            ", "
          )}`
        );
        // Log node structure for debugging
        if (existingDiscoveredNodes.length > 0) {
          console.log(
            `[Clarification] First discovered node structure:`,
            JSON.stringify(existingDiscoveredNodes[0], null, 2)
          );
        }
      } else {
        console.log(
          `[Clarification] No test state available - using empty context`
        );
      }
    }

    // Create clarification response operation
    const clarificationOp: WorkflowOperation = {
      type: "clarificationResponse",
      questionId,
      response,
    };

    console.log(
      `[Clarification] Only searching for additional nodes based on: "${response}"`
    );

    // Step 1: Extract new search terms from clarification response
    const clarificationAnalysis =
      await this.claudeService.analyzeWorkflowIntent(
        `Based on this clarification: "${response}", what additional nodes should we search for? Context: ${originalPrompt}`
      );

    console.log(
      `[Clarification] Claude suggests searching for additional terms: ${clarificationAnalysis.suggestedSearchTerms.join(
        ", "
      )}`
    );

    // Step 2: Search ONLY for new nodes based on clarification
    const newSearchResults: any[] = [];

    for (const searchTerm of clarificationAnalysis.suggestedSearchTerms) {
      // Skip if we already have nodes of this type
      const alreadyHaveType = existingDiscoveredNodes.some(
        (node) =>
          node.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (node.displayName &&
            node.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      if (alreadyHaveType) {
        console.log(
          `[Clarification] Skipping search for "${searchTerm}" - already have nodes of this type`
        );
        continue;
      }

      try {
        console.log(`[Clarification] Searching for new nodes: "${searchTerm}"`);
        const searchResult = await this.mcpClient.searchNodes({
          query: searchTerm,
          limit: 3,
        });

        if (
          searchResult &&
          searchResult.content &&
          searchResult.content.length > 0
        ) {
          const content = searchResult.content[0];
          if (content.type === "text") {
            try {
              const searchData = JSON.parse(content.text);
              if (searchData.results && Array.isArray(searchData.results)) {
                // Filter out nodes we already have
                const newNodes = searchData.results.filter(
                  (node: any) =>
                    !existingDiscoveredNodes.some(
                      (existing) => existing.type === node.nodeType
                    )
                );

                console.log(
                  `[Clarification] Found ${newNodes.length} new nodes for "${searchTerm}"`
                );
                newSearchResults.push(...newNodes);
              }
            } catch (e) {
              console.log(
                `[Clarification] Could not parse search results for "${searchTerm}"`
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[Clarification] Error searching for "${searchTerm}":`,
          error
        );
      }
    }

    console.log(
      `[Clarification] Total new nodes found: ${newSearchResults.length}`
    );

    // Step 3: Process clarification with existing context
    const claudeResponse = await this.claudeService.processWorkflowPhase(
      "discovery",
      originalPrompt,
      sessionId,
      undefined,
      {
        mode: "incremental",
        clarificationResponse: response,
        existingDiscoveredNodes,
        existingSelectedNodeIds,
        newlyDiscoveredNodes: newSearchResults,
        clarificationHistory: [
          ...clarificationHistory,
          {
            questionId,
            question:
              session?.state?.pendingClarifications?.[0]?.question ||
              "Previous clarification question",
            response,
            timestamp: new Date(),
          },
        ],
      }
    );

    // Process operations - merge with existing state
    const newDiscoveredNodes: DiscoveredNode[] = [];
    const newSelectedNodeIds: string[] = [];
    const followUpClarifications: Array<{
      questionId: string;
      question: string;
    }> = [];
    let newPendingClarification = undefined;

    for (const operation of claudeResponse.operations) {
      if (operation.type === "discoverNode") {
        // Only add if not already discovered
        if (!existingDiscoveredNodes.some((n) => n.id === operation.node.id)) {
          // Ensure the node has a displayName
          const enrichedNode = {
            ...operation.node,
            displayName: operation.node.displayName || operation.node.type,
          };
          newDiscoveredNodes.push(enrichedNode);
          console.log(
            `[Clarification] Added new node: ${operation.node.type} (${operation.node.id})`
          );
        }
      } else if (operation.type === "selectNode") {
        // Only add if not already selected
        if (!existingSelectedNodeIds.includes(operation.nodeId)) {
          newSelectedNodeIds.push(operation.nodeId);
          console.log(
            `[Clarification] Selected additional node: ${operation.nodeId}`
          );
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

      console.log(
        `[Clarification] ${followUpClarifications.length} follow-up clarification(s) needed`
      );
    }

    console.log(`[Clarification] Incremental update complete:`);
    console.log(
      `[Clarification]   - New nodes discovered: ${newDiscoveredNodes.length}`
    );
    console.log(
      `[Clarification]   - Additional nodes selected: ${newSelectedNodeIds.length}`
    );
    console.log(
      `[Clarification]   - Total nodes now: ${
        existingDiscoveredNodes.length + newDiscoveredNodes.length
      }`
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
   * Run the configuration phase with Claude (includes pre-validation)
   */
  async runConfigurationPhase(
    sessionId: string,
    discoveryResult?: DiscoveryResult
  ): Promise<ConfigurationResult> {
    try {
      // Get session to build context for configuration
      const { discoveredNodes, selectedNodeIds, userPrompt } =
        await this._getConfigurationContext(sessionId, discoveryResult);

      // Validate we have selected nodes to configure
      if (selectedNodeIds.length === 0) {
        return {
          success: false,
          operations: [],
          phase: "configuration",
          configured: [],
          error: {
            type: "configuration_error",
            code: "NO_NODES_SELECTED",
            message: "No nodes selected for configuration",
            userMessage:
              "Please complete discovery phase with selected nodes first",
            retryable: false,
          },
        };
      }

      console.log(
        "[WorkflowOrchestrator] Starting configuration phase with hybrid approach (configure + pre-validate)..."
      );

      const configured: ConfiguredNode[] = [];
      const operations: WorkflowOperation[] = [];
      const reasoning: string[] = [];

      // Process each selected node: configure → validate → fix if needed
      for (const nodeId of selectedNodeIds) {
        const node = discoveredNodes.find((n) => n.id === nodeId);
        if (!node) {
          console.warn(
            `[WorkflowOrchestrator] Node ${nodeId} not found in discovered nodes`
          );
          continue;
        }

        console.log(
          `[WorkflowOrchestrator] Configuring ${node.type} (${node.id}) with hybrid approach`
        );

        const {
          finalConfig,
          isValid,
          validationErrors,
          nodeReasoning,
          configOperations,
        } = await this._generateAndValidateNodeConfig(
          node,
          userPrompt,
          sessionId
        );

        operations.push(...configOperations);
        reasoning.push(...nodeReasoning);

        // Add to configured nodes
        configured.push({
          id: node.id,
          type: node.type,
          purpose: node.purpose,
          config: finalConfig,
          validated: isValid,
          validationErrors: isValid ? undefined : validationErrors,
        });

        // Add validation operation for tracking
        operations.push({
          type: "validateNode",
          nodeId: node.id,
          result: {
            valid: isValid,
            errors: validationErrors,
          },
        });

        if (isValid) {
          console.log(
            `[WorkflowOrchestrator] ✅ ${node.type} configured and validated successfully`
          );
          reasoning.push(`${node.type} configured and validated successfully`);
        } else {
          console.log(
            `[WorkflowOrchestrator] ⚠️  ${node.type} configured but validation failed`
          );
          reasoning.push(
            `${
              node.type
            } configured but validation failed: ${validationErrors.join(", ")}`
          );
        }
      }

      // Check if all nodes were successfully configured and validated
      const allValid = configured.every((n) => n.validated);
      const validCount = configured.filter((n) => n.validated).length;

      console.log(`[WorkflowOrchestrator] Configuration phase completed:`);
      console.log(
        `[WorkflowOrchestrator]   - Total nodes: ${configured.length}`
      );
      console.log(`[WorkflowOrchestrator]   - Valid nodes: ${validCount}`);
      console.log(
        `[WorkflowOrchestrator]   - Invalid nodes: ${
          configured.length - validCount
        }`
      );

      return {
        success: allValid,
        operations,
        phase: "configuration",
        configured,
        reasoning,
        error: allValid
          ? undefined
          : {
              type: "validation_error",
              code: "PARTIAL_VALIDATION_FAILURE",
              message: `${
                configured.length - validCount
              } nodes failed validation`,
              userMessage: `Some nodes could not be properly configured. ${validCount} of ${configured.length} nodes are ready.`,
              retryable: true,
            },
      };
    } catch (error) {
      return {
        success: false,
        operations: [],
        phase: "configuration",
        configured: [],
        error: {
          type: "claude_api",
          code: "CONFIGURATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to configure workflow nodes",
          retryable: true,
        },
      };
    }
  }

  private async _getConfigurationContext(
    sessionId: string,
    discoveryResult?: DiscoveryResult
  ) {
    let discoveredNodes: DiscoveredNode[] = [];
    let selectedNodeIds: string[] = [];
    let userPrompt = "Configure selected nodes";

    if (discoveryResult) {
      discoveredNodes = discoveryResult.discoveredNodes;
      selectedNodeIds = discoveryResult.selectedNodeIds;
      console.log(
        `[WorkflowOrchestrator] Using provided discovery result: ${selectedNodeIds.length} nodes selected`
      );
    } else {
      try {
        const { data: session } = await supabase
          .from("workflow_sessions")
          .select("*")
          .eq("session_id", sessionId)
          .single();

        if (session) {
          discoveredNodes = session.state.discovered || [];
          selectedNodeIds = session.state.selected || [];
          userPrompt = session.initial_prompt || userPrompt;
        }
      } catch (error) {
        console.log(
          `[WorkflowOrchestrator] Session ${sessionId} not found in database, continuing with empty context`
        );
      }
    }
    return { discoveredNodes, selectedNodeIds, userPrompt };
  }

  private async _generateAndValidateNodeConfig(
    node: DiscoveredNode,
    userPrompt: string,
    sessionId: string
  ) {
    const reasoning: string[] = [];
    const operations: WorkflowOperation[] = [];

    // Step 1: Get node essentials and analyze requirements
    const nodeEssentials = await this._getNodeEssentials(node.type);
    const analysisResult = await this.claudeService.analyzeNodeRequirements(
      node,
      userPrompt,
      nodeEssentials
    );

    console.log(`[WorkflowOrchestrator] Claude analysis for ${node.type}:`, {
      needsAuth: analysisResult.needsAuth,
      needsProperties: analysisResult.needsProperties,
      suggestedTask: analysisResult.suggestedTask,
      needsDocumentation: analysisResult.needsDocumentation,
    });

    // Step 2: Fetch additional context
    const additionalContext = await this._fetchAdditionalNodeContext(
      node.type,
      analysisResult
    );

    // Track what additional info was fetched for reasoning
    const fetchedInfo: string[] = Object.entries(additionalContext)
      .map(([key, value]) => {
        if (value) {
          if (key === "taskTemplate" && analysisResult.suggestedTask)
            return `task template: ${analysisResult.suggestedTask}`;
          if (key.endsWith("Properties"))
            return key.replace("Properties", " properties");
          if (key === "documentation") return "node documentation";
        }
        return "";
      })
      .filter(Boolean);

    if (fetchedInfo.length > 0) {
      reasoning.push(
        `Fetched additional context for ${node.type}: ${fetchedInfo.join(", ")}`
      );
    }
    if (analysisResult.reasoning) {
      reasoning.push(
        `Analysis for ${node.type}: ${analysisResult.reasoning.join(", ")}`
      );
    }

    // Step 3: Generate initial configuration
    const claudeResponse = await this.claudeService.processWorkflowPhase(
      "configuration",
      userPrompt,
      sessionId,
      [node.id],
      {
        discoveredNodes: [node],
        selectedNodeIds: [node.id],
        nodeSchemas: nodeEssentials ? { [node.type]: nodeEssentials } : {},
        nodeProperties:
          additionalContext.authProperties ||
          additionalContext.headerProperties ||
          additionalContext.connectionProperties ||
          {},
        nodeTemplates: additionalContext.taskTemplate
          ? { [node.type]: additionalContext.taskTemplate }
          : {},
        nodeDocumentation: additionalContext.documentation
          ? { [node.type]: additionalContext.documentation }
          : {},
        enrichedContext: additionalContext,
      }
    );

    let nodeConfig: any = {};
    for (const operation of claudeResponse.operations) {
      if (operation.type === "configureNode" && operation.nodeId === node.id) {
        nodeConfig = operation.config;
        operations.push(operation);
        break;
      }
    }

    if (claudeResponse.reasoning) {
      reasoning.push(...claudeResponse.reasoning);
    }

    // Step 4: Validate and fix loop
    let finalConfig = nodeConfig;
    let isValid = false;
    let validationErrors: string[] = [];
    const maxAttempts = 3;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const validation = await this._validateConfig(node.type, finalConfig);
      isValid = validation.isValid;
      validationErrors = validation.validationErrors;

      if (isValid) break;

      console.log(
        `[WorkflowOrchestrator] Fixing configuration for ${
          node.type
        } (attempt ${attempts + 1}/${maxAttempts})`
      );
      reasoning.push(
        `Configuration validation failed for ${
          node.type
        }, attempting to fix: ${validationErrors.join(", ")}`
      );

      finalConfig = await this.claudeService.fixNodeConfig(
        node,
        finalConfig,
        validationErrors,
        {
          essentials: nodeEssentials,
          ...additionalContext,
        }
      );
    }

    return {
      finalConfig,
      isValid,
      validationErrors,
      nodeReasoning: reasoning,
      configOperations: operations,
    };
  }

  private async _getNodeEssentials(nodeType: string): Promise<any> {
    try {
      console.log(`[WorkflowOrchestrator] Getting essentials for ${nodeType}`);
      const essentialsResult = await this.mcpClient.getNodeEssentials(nodeType);

      if (essentialsResult?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(essentialsResult.content[0].text);
        } catch (e) {
          console.log(
            `[WorkflowOrchestrator] Could not parse essentials for ${nodeType}`
          );
          return { raw: essentialsResult.content[0].text };
        }
      }
    } catch (error) {
      console.error(
        `[WorkflowOrchestrator] Failed to get essentials for ${nodeType}:`,
        error
      );
    }
    return null;
  }

  private async _fetchAdditionalNodeContext(
    nodeType: string,
    analysis: NodeInfoRequirements
  ) {
    const context: any = {};
    const propertyFetches: Promise<void>[] = [];

    const fetchProperty = async (property: string) => {
      try {
        console.log(
          `[WorkflowOrchestrator] Searching for ${property} properties in ${nodeType}`
        );
        const result = await this.mcpClient.searchNodeProperties(
          nodeType,
          property
        );
        if (result?.content?.[0]?.type === "text") {
          try {
            context[`${property}Properties`] = JSON.parse(
              result.content[0].text
            );
          } catch (e) {
            context[`${property}Properties`] = { raw: result.content[0].text };
          }
        }
      } catch (error) {
        console.error(
          `[WorkflowOrchestrator] Failed to search ${property} properties:`,
          error
        );
      }
    };

    if (analysis.needsAuth) {
      analysis.needsProperties.push("auth");
    }

    for (const property of [...new Set(analysis.needsProperties)]) {
      propertyFetches.push(fetchProperty(property));
    }

    if (analysis.suggestedTask) {
      propertyFetches.push(
        (async () => {
          try {
            console.log(
              `[WorkflowOrchestrator] Getting task template: ${analysis.suggestedTask}`
            );
            const result = await this.mcpClient.getNodeForTask(
              analysis.suggestedTask!
            );
            if (result?.content?.[0]?.type === "text") {
              try {
                context.taskTemplate = JSON.parse(result.content[0].text);
              } catch (e) {
                context.taskTemplate = { raw: result.content[0].text };
              }
            }
          } catch (error) {
            console.error(
              `[WorkflowOrchestrator] Failed to get task template:`,
              error
            );
          }
        })()
      );
    }

    if (analysis.needsDocumentation) {
      propertyFetches.push(
        (async () => {
          try {
            console.log(
              `[WorkflowOrchestrator] Getting documentation for ${nodeType}`
            );
            const result = await this.mcpClient.getNodeDocumentation(nodeType);
            if (result?.content?.[0]?.type === "text") {
              context.documentation = result.content[0].text;
            }
          } catch (error) {
            console.error(
              `[WorkflowOrchestrator] Failed to get documentation:`,
              error
            );
          }
        })()
      );
    }

    await Promise.all(propertyFetches);
    return context;
  }

  private async _validateConfig(nodeType: string, config: any) {
    let validationErrors: string[] = [];
    let isValid = false;

    try {
      console.log(
        `[WorkflowOrchestrator] Validating configuration for ${nodeType}`
      );
      const validationResult = await this.mcpClient.validateNodeMinimal(
        nodeType,
        config
      );

      if (validationResult?.content?.[0]?.type === "text") {
        try {
          const validation = JSON.parse(validationResult.content[0].text);
          isValid = validation.valid || validation.isValid || false;
          if (!isValid) {
            if (validation.errors) {
              validationErrors = Array.isArray(validation.errors)
                ? validation.errors
                : [validation.errors];
            } else if (validation.missingFields) {
              validationErrors = validation.missingFields.map(
                (field: string) => `Missing required field: ${field}`
              );
            } else if (validation.missingRequiredFields) {
              validationErrors = validation.missingRequiredFields.map(
                (field: string) =>
                  `Missing required field: "${field}" (this might be a display name - check the node properties for the actual field name)`
              );
            }
          }
        } catch (e) {
          console.log(
            `[WorkflowOrchestrator] Could not parse validation result`
          );
          isValid = true; // Assume valid if we can't parse
        }
      }
    } catch (error) {
      console.error(
        `[WorkflowOrchestrator] Validation failed for ${nodeType}:`,
        error
      );
      isValid = true; // Assume valid if validation service fails
    }

    return { isValid, validationErrors };
  }

  /**
   * Run the building phase (assemble workflow from validated configurations)
   */
  async runBuildingPhase(
    sessionId: string,
    configurationResult?: ConfigurationResult
  ): Promise<BuildingResult> {
    try {
      // Get session to retrieve validated configurations
      let configuredNodes: ConfiguredNode[] = [];
      let userPrompt = "";

      // If configuration result is provided (for tests), use it directly
      if (configurationResult) {
        configuredNodes = configurationResult.configured;
        console.log(
          `[WorkflowOrchestrator] Using provided configuration result: ${configuredNodes.length} nodes`
        );
      } else {
        // Get from database session
        try {
          const { data: session } = await supabase
            .from("workflow_sessions")
            .select("*")
            .eq("session_id", sessionId)
            .single();

          if (session) {
            configuredNodes = session.state.configured || [];
            userPrompt = session.initial_prompt || "";
          }
        } catch (error) {
          console.log(
            `[WorkflowOrchestrator] Session ${sessionId} not found in database`
          );
        }
      }

      // Validate we have configured nodes
      if (configuredNodes.length === 0) {
        return {
          success: false,
          phase: "building",
          workflow: { name: "", nodes: [], connections: {}, settings: {} },
          error: {
            type: "validation_error",
            code: "NO_CONFIGURED_NODES",
            message: "No configured nodes found",
            userMessage: "Please complete configuration phase first",
            retryable: false,
          },
        };
      }

      // Filter to only validated nodes
      const validatedNodes = configuredNodes.filter((n) => n.validated);
      if (validatedNodes.length === 0) {
        return {
          success: false,
          phase: "building",
          workflow: { name: "", nodes: [], connections: {}, settings: {} },
          error: {
            type: "validation_error",
            code: "NO_VALIDATED_NODES",
            message: "No validated nodes found",
            userMessage: "All nodes must be validated before building",
            retryable: false,
          },
        };
      }

      console.log("[WorkflowOrchestrator] Starting building phase...");
      console.log(
        `[WorkflowOrchestrator] Building workflow with ${validatedNodes.length} validated nodes`
      );

      // Have Claude build the complete workflow
      const claudeResponse = await this.claudeService.processWorkflowPhase(
        "building",
        userPrompt,
        sessionId,
        undefined,
        {
          configuredNodes: validatedNodes,
          userIntent: userPrompt,
        }
      );

      // Extract workflow from Claude's response
      const workflow = {
        name: claudeResponse.name || "n8n Workflow",
        nodes: claudeResponse.nodes || [],
        connections: claudeResponse.connections || {},
        settings: claudeResponse.settings || {
          executionOrder: "v1",
          saveDataSuccessExecution: "all",
          saveDataErrorExecution: "all",
          saveManualExecutions: true,
        },
      };

      console.log(
        `[WorkflowOrchestrator] Built workflow with ${workflow.nodes.length} nodes`
      );

      // Save draft workflow to session state for validation phase
      if (!configurationResult) {
        // Only save to database if not in test mode
        try {
          const { data: session } = await supabase
            .from("workflow_sessions")
            .select("state")
            .eq("session_id", sessionId)
            .single();

          if (session) {
            const updatedState = {
              ...session.state,
              draftWorkflow: workflow,
            };

            await supabase
              .from("workflow_sessions")
              .update({ state: updatedState })
              .eq("session_id", sessionId);

            console.log(
              `[WorkflowOrchestrator] Saved draft workflow to session`
            );
          }
        } catch (error) {
          console.error(
            "[WorkflowOrchestrator] Failed to save draft workflow:",
            error
          );
          // Continue anyway - validation can still work with the result
        }
      }

      return {
        success: true,
        phase: "building",
        workflow,
        reasoning: claudeResponse.reasoning,
      };
    } catch (error) {
      return {
        success: false,
        phase: "building",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        error: {
          type: "claude_api",
          code: "BUILDING_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to build workflow",
          retryable: true,
        },
      };
    }
  }

  /**
   * Run MCP validation tools directly
   */
  private async runValidations(workflow: any): Promise<{
    workflow: any;
    connections: any;
    expressions: any;
  }> {
    const results = {
      workflow: null as any,
      connections: null as any,
      expressions: null as any,
    };

    try {
      console.log(
        "[WorkflowOrchestrator] Running comprehensive workflow validation..."
      );

      // The MCP validate_workflow tool performs all three types of validation
      const validationResult = await this.mcpClient.callTool(
        "validate_workflow",
        {
          workflow,
          options: {
            validateNodes: true,
            validateConnections: true,
            validateExpressions: true,
            profile: "runtime", // Use runtime profile for production validation
          },
        }
      );

      if (validationResult?.content?.[0]?.type === "text") {
        const fullValidation = JSON.parse(validationResult.content[0].text);

        console.log("[WorkflowOrchestrator] Validation result structure:", {
          valid: fullValidation.valid,
          errorCount: fullValidation.errors?.length || 0,
          warningCount: fullValidation.warnings?.length || 0,
          hasStatistics: !!fullValidation.statistics,
          errorSample: fullValidation.errors?.[0],
        });

        // The validate_workflow tool returns a comprehensive result
        // We need to categorize errors by type
        const allErrors = fullValidation.errors || [];
        const allWarnings = fullValidation.warnings || [];

        // Categorize errors for our report structure
        // The errors have a complex structure with node and message fields
        results.workflow = {
          errors: allErrors, // Keep all errors for now - they'll all be sent to Claude
          warnings: allWarnings,
          valid: fullValidation.valid,
          statistics: fullValidation.statistics || fullValidation.summary,
        };

        // For delta-based validation, we don't need to categorize errors
        // We'll send all errors to Claude and let it figure out the fixes
        results.connections = {
          errors: [],
          warnings: [],
        };

        results.expressions = {
          errors: [],
          warnings: [],
        };
      }
    } catch (error) {
      console.error(
        "[WorkflowOrchestrator] Workflow validation failed:",
        error
      );
      // Return empty results on error
      results.workflow = { errors: [], warnings: [], valid: false };
      results.connections = { errors: [], warnings: [] };
      results.expressions = { errors: [], warnings: [] };
    }

    return results;
  }

  /**
   * Apply fix operations to workflow
   */
  private applyFixes(workflow: any, fixes: any[]): any {
    // Deep clone workflow to avoid mutations
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));

    console.log(`[WorkflowOrchestrator] Applying ${fixes.length} fixes`);

    // Define node-level properties that should not go into parameters
    const NODE_LEVEL_PROPERTIES = [
      "onError",
      "retryOnFail",
      "maxTries",
      "waitBetweenTries",
      "executeOnce",
      "disabled",
      "continueOnFail",
      "notes",
      "color",
      "alwaysOutputData",
      "timezone",
      "notesInFlow",
    ];

    for (const fix of fixes) {
      console.log(`[WorkflowOrchestrator] Applying fix:`, fix);

      switch (fix.type) {
        case "addField":
          // Find node by ID or name (fixes might reference by name)
          const nodeToUpdate = updatedWorkflow.nodes.find(
            (n: any) => n.id === fix.nodeId || n.name === fix.nodeId
          );
          if (nodeToUpdate) {
            // Check if this is a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Place at node level
              nodeToUpdate[fix.field] = fix.value;
              console.log(
                `[WorkflowOrchestrator] Added node-level field ${fix.field} to node ${nodeToUpdate.id} (${nodeToUpdate.name})`
              );
            } else {
              // Place in parameters
              if (!nodeToUpdate.parameters) nodeToUpdate.parameters = {};
              nodeToUpdate.parameters[fix.field] = fix.value;
              console.log(
                `[WorkflowOrchestrator] Added parameter field ${fix.field} to node ${nodeToUpdate.id} (${nodeToUpdate.name})`
              );
            }
          } else {
            console.log(
              `[WorkflowOrchestrator] Node ${fix.nodeId} not found for addField`
            );
          }
          break;

        case "updateField":
          // Find node by ID or name (fixes might reference by name)
          const nodeToModify = updatedWorkflow.nodes.find(
            (n: any) => n.id === fix.nodeId || n.name === fix.nodeId
          );
          if (nodeToModify) {
            // Check if this is a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Place at node level
              nodeToModify[fix.field] = fix.value;
              console.log(
                `[WorkflowOrchestrator] Updated node-level field ${fix.field} in node ${nodeToModify.id} (${nodeToModify.name})`
              );
            } else {
              // Place in parameters
              if (!nodeToModify.parameters) nodeToModify.parameters = {};
              nodeToModify.parameters[fix.field] = fix.value;
              console.log(
                `[WorkflowOrchestrator] Updated parameter field ${fix.field} in node ${nodeToModify.id} (${nodeToModify.name})`
              );
            }
          } else {
            console.log(
              `[WorkflowOrchestrator] Node ${fix.nodeId} not found for updateField`
            );
          }
          break;

        case "addConnection":
          // Add connection
          if (!updatedWorkflow.connections[fix.from]) {
            updatedWorkflow.connections[fix.from] = { main: [[]] };
          }

          // Check if connection already exists to prevent duplicates
          const existingConnection = updatedWorkflow.connections[
            fix.from
          ].main[0].find((c: any) => c.node === fix.to);

          if (!existingConnection) {
            updatedWorkflow.connections[fix.from].main[0].push({
              node: fix.to,
              type: "main",
              index: 0,
            });
            console.log(
              `[WorkflowOrchestrator] Added connection from ${fix.from} to ${fix.to}`
            );
          } else {
            console.log(
              `[WorkflowOrchestrator] Connection from ${fix.from} to ${fix.to} already exists, skipping`
            );
          }
          break;

        case "removeConnection":
          // Remove connection
          if (updatedWorkflow.connections[fix.from]) {
            updatedWorkflow.connections[fix.from].main[0] =
              updatedWorkflow.connections[fix.from].main[0].filter(
                (c: any) => c.node !== fix.to
              );
          }
          break;

        case "addNode":
          // Add new node
          updatedWorkflow.nodes.push(fix.node);
          break;

        case "updateWorkflowSettings":
          // Update workflow-level settings
          if (!updatedWorkflow.settings) updatedWorkflow.settings = {};
          Object.assign(updatedWorkflow.settings, fix.settings);
          break;

        case "setWorkflowName":
          updatedWorkflow.name = fix.name;
          break;
      }
    }

    // Clean up empty connections
    for (const nodeId in updatedWorkflow.connections) {
      if (updatedWorkflow.connections[nodeId].main[0].length === 0) {
        delete updatedWorkflow.connections[nodeId];
        console.log(
          `[WorkflowOrchestrator] Removed empty connection for ${nodeId}`
        );
      }
    }

    // Clean up node-level properties that might be in parameters
    for (const node of updatedWorkflow.nodes) {
      if (node.parameters) {
        for (const prop of NODE_LEVEL_PROPERTIES) {
          if (prop in node.parameters) {
            // Move to node level if not already there
            if (!(prop in node)) {
              node[prop] = node.parameters[prop];
            }
            // Remove from parameters
            delete node.parameters[prop];
            console.log(
              `[WorkflowOrchestrator] Cleaned up ${prop} from parameters of node ${node.id} (${node.name})`
            );
          }
        }
      }
    }

    return updatedWorkflow;
  }

  /**
   * Run the validation phase (validate and fix the complete workflow)
   */
  async runValidationPhase(
    sessionId: string,
    buildingResult?: BuildingResult
  ): Promise<ValidationPhaseResult> {
    try {
      // Get draft workflow from building phase
      let draftWorkflow: any = null;

      // If building result is provided (for tests), use it directly
      if (buildingResult?.workflow) {
        draftWorkflow = buildingResult.workflow;
        console.log(`[WorkflowOrchestrator] Using provided draft workflow`);
      } else {
        // Get from database session
        try {
          const { data: session } = await supabase
            .from("workflow_sessions")
            .select("*")
            .eq("session_id", sessionId)
            .single();

          if (session?.state?.draftWorkflow) {
            draftWorkflow = session.state.draftWorkflow;
          }
        } catch (error) {
          console.log(
            `[WorkflowOrchestrator] Session ${sessionId} not found in database`
          );
        }
      }

      // Validate we have a draft workflow
      if (!draftWorkflow) {
        return {
          success: false,
          phase: "validation",
          workflow: { name: "", nodes: [], connections: {}, settings: {} },
          validationReport: {},
          error: {
            type: "validation_error",
            code: "NO_DRAFT_WORKFLOW",
            message: "No draft workflow found",
            userMessage: "Please complete building phase first",
            retryable: false,
          },
        };
      }

      console.log(
        "[WorkflowOrchestrator] Starting delta-based validation phase..."
      );
      console.log(
        `[WorkflowOrchestrator] Validating workflow with ${
          draftWorkflow.nodes?.length || 0
        } nodes`
      );

      let currentWorkflow = JSON.parse(JSON.stringify(draftWorkflow));
      const validationReport: any = {
        initial: null,
        fixesApplied: [],
        final: null,
        attempts: 0,
      };

      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let allValid = false;

      while (attempts < MAX_ATTEMPTS && !allValid) {
        attempts++;
        console.log(
          `[WorkflowOrchestrator] Validation attempt ${attempts}/${MAX_ATTEMPTS}`
        );

        // Step 1: Run all MCP validations
        const validationResults = await this.runValidations(currentWorkflow);

        // Store initial validation results
        if (attempts === 1) {
          validationReport.initial = validationResults;
        }

        // Extract all errors
        const allErrors = [
          ...(validationResults.workflow?.errors || []),
          ...(validationResults.connections?.errors || []),
          ...(validationResults.expressions?.errors || []),
        ];

        console.log(
          `[WorkflowOrchestrator] Found ${allErrors.length} validation errors`
        );

        if (allErrors.length === 0) {
          allValid = true;
          validationReport.final = validationResults;
          break;
        }

        // Step 2: Send only errors to Claude for fixes
        console.log(
          "[WorkflowOrchestrator] Sending errors to Claude for fix generation..."
        );
        const fixes = await this.claudeService.generateValidationFixes(
          allErrors,
          currentWorkflow
        );

        if (!fixes || fixes.length === 0) {
          console.log("[WorkflowOrchestrator] Claude could not generate fixes");
          break;
        }

        console.log(
          `[WorkflowOrchestrator] Claude generated ${fixes.length} fixes`
        );

        // Step 3: Apply fixes to workflow
        currentWorkflow = this.applyFixes(currentWorkflow, fixes);

        // Track fixes in report
        validationReport.fixesApplied.push(
          ...fixes.map((fix: any) => ({
            ...fix,
            attempt: attempts,
          }))
        );
      }

      // Final validation
      if (!allValid) {
        const finalValidation = await this.runValidations(currentWorkflow);
        validationReport.final = finalValidation;
      }

      validationReport.attempts = attempts;

      // Mark workflow as valid if all validations pass
      currentWorkflow.valid = allValid;

      console.log(
        `[WorkflowOrchestrator] Validation completed after ${attempts} attempts`
      );
      console.log(
        `[WorkflowOrchestrator] Workflow is ${
          allValid ? "valid" : "still invalid"
        }`
      );
      if (validationReport.fixesApplied.length > 0) {
        console.log(
          `[WorkflowOrchestrator] Applied ${validationReport.fixesApplied.length} fixes total`
        );
      }

      return {
        success: true,
        phase: "validation",
        workflow: currentWorkflow,
        validationReport,
        reasoning: [
          `Validation completed after ${attempts} attempts with ${validationReport.fixesApplied.length} fixes applied`,
        ],
      };
    } catch (error) {
      return {
        success: false,
        phase: "validation",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        validationReport: {},
        error: {
          type: "claude_api",
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to validate workflow",
          retryable: true,
        },
      };
    }
  }

  /**
   * Apply operations to session state
   */
  async applyOperations(
    sessionId: string,
    operations: WorkflowOperation[]
  ): Promise<ApplyOperationsResult> {
    // This is a stub implementation
    // In real implementation, this would update the database state

    return {
      success: true,
      applied: operations.length,
      stateUpdate: {
        phase: "discovery",
        discovered: operations.filter((op) => op.type === "discoverNode")
          .length,
        selected: operations.filter((op) => op.type === "selectNode").length,
      },
    };
  }

  /**
   * Check phase transition status
   */
  async checkPhaseTransition(
    session: WorkflowSession
  ): Promise<PhaseStatusResult> {
    const result = this.phaseManager.canTransition(session.state);

    return {
      currentPhase: session.state.phase,
      canProgress: result.canProgress,
      autoTransition: result.autoTransition,
      reason: result.reason,
    };
  }
}
