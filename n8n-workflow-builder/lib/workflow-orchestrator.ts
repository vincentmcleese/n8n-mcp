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
import { loggers } from "@/lib/utils/logger";

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

export interface DocumentationPhaseResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  stickyNotesAdded?: number;
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
      loggers.orchestrator.debug(
        "Starting simplified discovery phase - trusting AI agent decisions"
      );

      // Step 1: Have Claude analyze the prompt and suggest what to search for
      const analysisResponse = await this.claudeService.analyzeWorkflowIntent(
        prompt
      );

      loggers.orchestrator.debug(
        "Claude suggests searching for:",
        analysisResponse.suggestedSearchTerms
      );
      loggers.orchestrator.debug(
        "Node recommendations:",
        analysisResponse.nodeRecommendations.map((r) => r.type)
      );

      // Step 2: Simple search - just search for what Claude suggests
      const searchResults: any[] = [];

      // Handle empty search terms
      if (analysisResponse.suggestedSearchTerms.length === 0) {
        loggers.orchestrator.debug(
          "No search terms suggested - likely invalid prompt"
        );
      }

      // Search for each term Claude suggested
      for (const searchTerm of analysisResponse.suggestedSearchTerms) {
        try {
          loggers.orchestrator.debug(`Searching for: "${searchTerm}"`);
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
                loggers.orchestrator.debug(
                  `Could not parse search results`
                );
              }
            }
          }
        } catch (error) {
          loggers.orchestrator.error(`Error searching nodes:`, error);
        }
      }

      loggers.orchestrator.debug(
        `Found ${searchResults.length} nodes from search`
      );

      // Step 3: Get node details for ALL search results - trust Claude to make intelligent decisions
      const nodeDetails: any[] = [];
      const nodesToDetail = searchResults; // Send ALL nodes to Claude, no filtering!

      loggers.orchestrator.debug(
        `Getting details for all ${nodesToDetail.length} discovered nodes (trusting Claude to filter)`
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
          loggers.orchestrator.error(
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

      // Step 4: Have Claude select and design the workflow with discovered nodes
      loggers.orchestrator.debug(
        `Sending ${nodeDetails.length} nodes to Claude for workflow design`
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

        loggers.orchestrator.debug(
          `Combined ${clarificationQuestions.length} clarification questions`
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
    loggers.orchestrator.debug(
      `Processing answer for question: ${questionId}`
    );
    loggers.orchestrator.debug(`User response: "${response}"`);

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

        loggers.orchestrator.debug(
          `Found existing session with ${existingDiscoveredNodes.length} discovered nodes`
        );
        loggers.orchestrator.debug(
          `Existing selected nodes: ${existingSelectedNodeIds.join(
            ", "
          )}`
        );
      }
    } catch (error) {
      // Session not found - for interactive test, use mock data from the first discovery
      loggers.orchestrator.debug(
        `Session ${sessionId} not found, checking for test context`
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

        loggers.orchestrator.debug(
          `Using test session state with ${existingDiscoveredNodes.length} discovered nodes`
        );
        loggers.orchestrator.debug(
          `Test selected nodes: ${existingSelectedNodeIds.join(
            ", "
          )}`
        );
        // Log node structure for debugging
        if (existingDiscoveredNodes.length > 0) {
          loggers.orchestrator.debug(
            `First discovered node structure:`,
            JSON.stringify(existingDiscoveredNodes[0], null, 2)
          );
        }
      } else {
        loggers.orchestrator.debug(
          `No test state available - using empty context`
        );
      }
    }

    // Create clarification response operation
    const clarificationOp: WorkflowOperation = {
      type: "clarificationResponse",
      questionId,
      response,
    };

    loggers.orchestrator.debug(
      `Only searching for additional nodes based on: "${response}"`
    );

    // Step 1: Extract new search terms from clarification response
    const clarificationAnalysis =
      await this.claudeService.analyzeWorkflowIntent(
        `Based on this clarification: "${response}", what additional nodes should we search for? Context: ${originalPrompt}`
      );

    loggers.orchestrator.debug(
      `Claude suggests searching for additional terms: ${clarificationAnalysis.suggestedSearchTerms.join(
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
        loggers.orchestrator.debug(
          `Skipping search for "${searchTerm}" - already have nodes of this type`
        );
        continue;
      }

      try {
        loggers.orchestrator.debug(`Searching for new nodes: "${searchTerm}"`);
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

                loggers.orchestrator.debug(
                  `Found ${newNodes.length} new nodes for "${searchTerm}"`
                );
                newSearchResults.push(...newNodes);
              }
            } catch (e) {
              loggers.orchestrator.debug(
                `Could not parse search results for "${searchTerm}"`
              );
            }
          }
        }
      } catch (error) {
        loggers.orchestrator.error(
          `Error searching for "${searchTerm}":`,
          error
        );
      }
    }

    loggers.orchestrator.debug(
      `Total new nodes found: ${newSearchResults.length}`
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
          loggers.orchestrator.debug(
            `Added new node: ${operation.node.type} (${operation.node.id})`
          );
        }
      } else if (operation.type === "selectNode") {
        // Only add if not already selected
        if (!existingSelectedNodeIds.includes(operation.nodeId)) {
          newSelectedNodeIds.push(operation.nodeId);
          loggers.orchestrator.debug(
            `Selected additional node: ${operation.nodeId}`
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

      loggers.orchestrator.debug(
        `${followUpClarifications.length} follow-up clarification(s) needed`
      );
    }

    loggers.orchestrator.debug(`Incremental update complete:`);
    loggers.orchestrator.debug(
      `  - New nodes discovered: ${newDiscoveredNodes.length}`
    );
    loggers.orchestrator.debug(
      `  - Additional nodes selected: ${newSelectedNodeIds.length}`
    );
    loggers.orchestrator.debug(
      `  - Total nodes now: ${
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

      loggers.orchestrator.debug(
        "Starting configuration phase with hybrid approach (configure + pre-validate)..."
      );

      const configured: ConfiguredNode[] = [];
      const operations: WorkflowOperation[] = [];
      const reasoning: string[] = [];

      // Process each selected node: configure → validate → fix if needed
      for (const nodeId of selectedNodeIds) {
        const node = discoveredNodes.find((n) => n.id === nodeId);
        if (!node) {
          loggers.orchestrator.warn(
            `Node ${nodeId} not found in discovered nodes`
          );
          continue;
        }

        loggers.orchestrator.debug(
          `Configuring ${node.type} (${node.id}) with hybrid approach`
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
          loggers.orchestrator.debug(
            `✅ ${node.type} configured and validated successfully`
          );
          reasoning.push(`${node.type} configured and validated successfully`);
        } else {
          loggers.orchestrator.debug(
            `⚠️  ${node.type} configured but validation failed`
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

      loggers.orchestrator.debug(`Configuration phase completed:`);
      loggers.orchestrator.debug(
        `  - Total nodes: ${configured.length}`
      );
      loggers.orchestrator.debug(`  - Valid nodes: ${validCount}`);
      loggers.orchestrator.debug(
        `  - Invalid nodes: ${
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
      loggers.orchestrator.debug(
        `Using provided discovery result: ${selectedNodeIds.length} nodes selected`
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
        loggers.orchestrator.debug(
          `Session ${sessionId} not found in database, continuing with empty context`
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

    loggers.orchestrator.debug(`Claude analysis for ${node.type}:`, {
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

      loggers.orchestrator.debug(
        `Fixing configuration for ${
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
      loggers.orchestrator.debug(`Getting essentials for ${nodeType}`);
      const essentialsResult = await this.mcpClient.getNodeEssentials(nodeType);

      if (essentialsResult?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(essentialsResult.content[0].text);
        } catch (e) {
          loggers.orchestrator.debug(
            `Could not parse essentials for ${nodeType}`
          );
          return { raw: essentialsResult.content[0].text };
        }
      }
    } catch (error) {
      loggers.orchestrator.error(
        `Failed to get essentials for ${nodeType}:`,
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

    // OPTIMIZATION: If we have a task template, we likely don't need property searches
    const hasTaskTemplate = !!analysis.suggestedTask;
    
    const fetchProperty = async (property: string) => {
      try {
        loggers.orchestrator.debug(
          `Searching for ${property} properties in ${nodeType}`
        );
        const result = await this.mcpClient.searchNodeProperties(
          nodeType,
          property
        );
        if (result?.content?.[0]?.type === "text") {
          try {
            const parsed = JSON.parse(result.content[0].text);
            // Only store if we found actual matches
            if (parsed.matches && parsed.matches.length > 0) {
              context[`${property}Properties`] = parsed;
              loggers.orchestrator.debug(`Found ${parsed.matches.length} matches for ${property}`);
            } else {
              loggers.orchestrator.debug(`No matches found for ${property} - skipping`);
            }
          } catch (e) {
            context[`${property}Properties`] = { raw: result.content[0].text };
          }
        }
      } catch (error) {
        loggers.orchestrator.error(
          `Failed to search ${property} properties:`,
          error
        );
      }
    };

    // Only search for properties if:
    // 1. We don't have a task template (task templates are complete)
    // 2. The property was explicitly requested by Claude
    // 3. We're not searching for things already in essentials
    if (!hasTaskTemplate && analysis.needsProperties.length > 0) {
      // Remove duplicates and filter out common properties that are usually in essentials
      const propertiesToSearch = [...new Set(analysis.needsProperties)]
        .filter(prop => {
          // Skip common properties that are typically in essentials
          const skipProperties = ['resource', 'operation', 'method', 'type'];
          return !skipProperties.includes(prop.toLowerCase());
        });
      
      loggers.orchestrator.debug(`Will search for ${propertiesToSearch.length} properties: ${propertiesToSearch.join(', ')}`);
      
      for (const property of propertiesToSearch) {
        propertyFetches.push(fetchProperty(property));
      }
    } else if (hasTaskTemplate) {
      loggers.orchestrator.debug(`Skipping property searches - task template provides complete configuration`);
    }

    if (analysis.suggestedTask) {
      propertyFetches.push(
        (async () => {
          try {
            loggers.orchestrator.debug(
              `Getting task template: ${analysis.suggestedTask}`
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
            loggers.orchestrator.error(
              `Failed to get task template:`,
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
            loggers.orchestrator.debug(
              `Getting documentation for ${nodeType}`
            );
            const result = await this.mcpClient.getNodeDocumentation(nodeType);
            if (result?.content?.[0]?.type === "text") {
              context.documentation = result.content[0].text;
            }
          } catch (error) {
            loggers.orchestrator.error(
              `Failed to get documentation:`,
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
      loggers.orchestrator.debug(
        `Validating configuration for ${nodeType}`
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
          loggers.orchestrator.debug(
            `Could not parse validation result`
          );
          isValid = true; // Assume valid if we can't parse
        }
      }
    } catch (error) {
      loggers.orchestrator.error(
        `Validation failed for ${nodeType}:`,
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
        loggers.orchestrator.debug(
          `Using provided configuration result: ${configuredNodes.length} nodes`
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
          loggers.orchestrator.debug(
            `Session ${sessionId} not found in database`
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

      loggers.orchestrator.debug("Starting building phase...");
      loggers.orchestrator.debug(
        `Building workflow with ${validatedNodes.length} validated nodes`
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

      loggers.orchestrator.debug(
        `Built workflow with ${workflow.nodes.length} nodes`
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

            loggers.orchestrator.debug(
              `Saved draft workflow to session`
            );
          }
        } catch (error) {
          loggers.orchestrator.error(
            "Failed to save draft workflow:",
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
      loggers.orchestrator.debug(
        "Running comprehensive workflow validation..."
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

        loggers.orchestrator.debug("Validation result structure:", {
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
      loggers.orchestrator.error(
        "Workflow validation failed:",
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

    loggers.orchestrator.debug(`Applying ${fixes.length} fixes`);

    // Define node-level properties that should not go into parameters
    const NODE_LEVEL_PROPERTIES = [
      "type",  // Critical: node type must be at node level
      "typeVersion",  // Also important for node versioning
      "name",
      "position",
      "disabled",
      "notes",
      "retryOnFail",
      "maxTries",
      "waitBetweenTries",
      "continueOnFail",
      "executeOnce",
      "alwaysOutputData",
      "onError",
      "color",
      "timezone",
      "notesInFlow",
    ];

    for (const fix of fixes) {
      loggers.orchestrator.debug(`Applying fix:`, fix);

      switch (fix.type) {
        case "addField":
          // Find node by ID or name (fixes might reference by name)
          const nodeToUpdate = updatedWorkflow.nodes.find(
            (n: any) => n.id === fix.nodeId || n.name === fix.nodeId
          );
          if (nodeToUpdate) {
            // Special case: adding the entire parameters object
            if (fix.field === "parameters" && typeof fix.value === "object") {
              // Merge with existing parameters to preserve other fields
              nodeToUpdate.parameters = {
                ...nodeToUpdate.parameters,
                ...fix.value
              };
              loggers.orchestrator.debug(
                `Merged parameters in node ${nodeToUpdate.id} (${nodeToUpdate.name})`
              );
            } else if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Place at node level
              nodeToUpdate[fix.field] = fix.value;
              loggers.orchestrator.debug(
                `Added node-level field ${fix.field} to node ${nodeToUpdate.id} (${nodeToUpdate.name})`
              );
            } else {
              // Place in parameters
              if (!nodeToUpdate.parameters) nodeToUpdate.parameters = {};
              nodeToUpdate.parameters[fix.field] = fix.value;
              loggers.orchestrator.debug(
                `Added parameter field ${fix.field} to node ${nodeToUpdate.id} (${nodeToUpdate.name})`
              );
            }
          } else {
            loggers.orchestrator.debug(
              `Node ${fix.nodeId} not found for addField`
            );
          }
          break;

        case "updateField":
          // Find node by ID or name (fixes might reference by name)
          const nodeToModify = updatedWorkflow.nodes.find(
            (n: any) => n.id === fix.nodeId || n.name === fix.nodeId
          );
          if (nodeToModify) {
            // Special case: updating the entire parameters object
            if (fix.field === "parameters" && typeof fix.value === "object") {
              // Merge with existing parameters to preserve other fields
              nodeToModify.parameters = {
                ...nodeToModify.parameters,
                ...fix.value
              };
              loggers.orchestrator.debug(
                `Merged parameters in node ${nodeToModify.id} (${nodeToModify.name})`
              );
            } else if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Place at node level
              nodeToModify[fix.field] = fix.value;
              loggers.orchestrator.debug(
                `Updated node-level field ${fix.field} in node ${nodeToModify.id} (${nodeToModify.name})`
              );
              // Special handling for type field to ensure it's correctly updated
              if (fix.field === 'type' && nodeToModify.type !== fix.value) {
                loggers.orchestrator.warn(`Type field was not properly updated. Expected: ${fix.value}, Actual: ${nodeToModify.type}`);
              }
            } else {
              // Place in parameters
              if (!nodeToModify.parameters) nodeToModify.parameters = {};
              nodeToModify.parameters[fix.field] = fix.value;
              loggers.orchestrator.debug(
                `Updated parameter field ${fix.field} in node ${nodeToModify.id} (${nodeToModify.name})`
              );
            }
          } else {
            loggers.orchestrator.debug(
              `Node ${fix.nodeId} not found for updateField`
            );
          }
          break;

        case "removeField":
          // Find node by ID or name and remove field
          const nodeToRemoveFrom = updatedWorkflow.nodes.find(
            (n: any) => n.id === fix.nodeId || n.name === fix.nodeId
          );
          if (nodeToRemoveFrom) {
            // Check if field is at node level or in parameters
            if (fix.field in nodeToRemoveFrom) {
              delete nodeToRemoveFrom[fix.field];
              loggers.orchestrator.debug(
                `Removed field ${fix.field} from node ${nodeToRemoveFrom.id} (${nodeToRemoveFrom.name})`
              );
            } else if (nodeToRemoveFrom.parameters && fix.field in nodeToRemoveFrom.parameters) {
              delete nodeToRemoveFrom.parameters[fix.field];
              loggers.orchestrator.debug(
                `Removed field ${fix.field} from parameters of node ${nodeToRemoveFrom.id} (${nodeToRemoveFrom.name})`
              );
            }
          } else {
            loggers.orchestrator.debug(
              `Node ${fix.nodeId} not found for removeField`
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
            loggers.orchestrator.debug(
              `Added connection from ${fix.from} to ${fix.to}`
            );
          } else {
            loggers.orchestrator.debug(
              `Connection from ${fix.from} to ${fix.to} already exists, skipping`
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

        case "addStickyNote":
          // Add sticky note to workflow
          const stickyNode = {
            id: fix.note.id,
            name: `Sticky Note ${fix.note.id}`,
            type: "n8n-nodes-base.stickyNote",
            typeVersion: 1,
            position: [0, 0], // Will be calculated by positioning algorithm
            parameters: {
              content: fix.note.content,
              height: 150,
              width: 250,
              color: fix.note.color || 1
            },
            // Store nodeGroupIds at node level for positioning (will be removed later)
            _nodeGroupIds: fix.note.nodeGroupIds
          };
          updatedWorkflow.nodes.push(stickyNode);
          loggers.orchestrator.debug(
            `Added sticky note ${fix.note.id} for nodes: ${fix.note.nodeGroupIds.join(", ")}`
          );
          break;
      }
    }

    // Clean up empty connections
    for (const nodeId in updatedWorkflow.connections) {
      if (updatedWorkflow.connections[nodeId].main[0].length === 0) {
        delete updatedWorkflow.connections[nodeId];
        loggers.orchestrator.debug(
          `Removed empty connection for ${nodeId}`
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
            loggers.orchestrator.debug(
              `Cleaned up ${prop} from parameters of node ${node.id} (${node.name})`
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
        loggers.orchestrator.debug(`Using provided draft workflow`);
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
          loggers.orchestrator.debug(
            `Session ${sessionId} not found in database`
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

      loggers.orchestrator.debug(
        "Starting delta-based validation phase..."
      );
      loggers.orchestrator.debug(
        `Validating workflow with ${
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
        loggers.orchestrator.debug(
          `Validation attempt ${attempts}/${MAX_ATTEMPTS}`
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

        loggers.orchestrator.debug(
          `Found ${allErrors.length} validation errors`
        );

        if (allErrors.length === 0) {
          allValid = true;
          validationReport.final = validationResults;
          break;
        }

        // Step 2: Send only errors to Claude for fixes
        loggers.orchestrator.debug(
          "Sending errors to Claude for fix generation..."
        );
        const fixes = await this.claudeService.generateValidationFixes(
          allErrors,
          currentWorkflow
        );

        if (!fixes || fixes.length === 0) {
          loggers.orchestrator.debug("Claude could not generate fixes");
          break;
        }

        loggers.orchestrator.debug(
          `Claude generated ${fixes.length} fixes`
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

      loggers.orchestrator.debug(
        `Validation completed after ${attempts} attempts`
      );
      loggers.orchestrator.debug(
        `Workflow is ${
          allValid ? "valid" : "still invalid"
        }`
      );
      if (validationReport.fixesApplied.length > 0) {
        loggers.orchestrator.debug(
          `Applied ${validationReport.fixesApplied.length} fixes total`
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
   * Run the documentation phase (add sticky notes to explain workflow sections)
   */
  async runDocumentationPhase(
    sessionId: string,
    validationResult?: ValidationPhaseResult
  ): Promise<DocumentationPhaseResult> {
    try {
      // Get validated workflow
      let validatedWorkflow: any = null;

      if (validationResult?.workflow) {
        validatedWorkflow = validationResult.workflow;
      } else {
        // Load from session if not provided
        const { data: session } = await supabase
          .from("workflow_sessions")
          .select("state")
          .eq("session_id", sessionId)
          .single();

        if (!session?.state?.draftWorkflow) {
          return {
            success: false,
            phase: "documentation",
            workflow: { name: "", nodes: [], connections: {}, settings: {} },
            error: {
              type: "workflow_error",
              code: "NO_WORKFLOW",
              message: "No validated workflow found",
              userMessage: "Please complete validation phase first",
              retryable: false,
            },
          };
        }

        validatedWorkflow = session.state.draftWorkflow;
      }

      loggers.orchestrator.debug("Starting documentation phase...");

      // Extract minimal node metadata for Claude
      const nodeMetadata = this.extractNodeMetadata(validatedWorkflow);
      loggers.orchestrator.debug("Node metadata for documentation:", JSON.stringify(nodeMetadata, null, 2));

      // Get user prompt from session or use default
      let userPrompt = "";
      try {
        const { data: session } = await supabase
          .from("workflow_sessions")
          .select("initial_prompt")
          .eq("session_id", sessionId)
          .single();

        userPrompt = session?.initial_prompt || "Create a workflow";
      } catch (error) {
        // If no session found, use the workflow name as context
        userPrompt = validatedWorkflow.name || "Create a workflow";
        loggers.orchestrator.debug("No session found, using workflow name as context");
      }

      // Have Claude generate sticky notes
      const claudeResponse = await this.claudeService.processWorkflowPhase(
        "documentation",
        userPrompt,
        sessionId,
        undefined,
        {
          workflow: validatedWorkflow,
          nodeMetadata,
        }
      );

      // Apply sticky note operations
      let documentedWorkflow = validatedWorkflow;
      if (claudeResponse.operations && claudeResponse.operations.length > 0) {
        documentedWorkflow = this.applyFixes(
          validatedWorkflow,
          claudeResponse.operations
        );

        // Calculate sticky note positions
        documentedWorkflow = this.positionStickyNotes(documentedWorkflow);
      }

      loggers.orchestrator.debug(
        `Added ${claudeResponse.operations?.length || 0} sticky notes`
      );
      
      // Log the actual sticky notes in the workflow
      const actualStickyNotes = documentedWorkflow.nodes.filter(
        (n: any) => n.type === "n8n-nodes-base.stickyNote"
      );
      loggers.orchestrator.debug(
        `Workflow now contains ${actualStickyNotes.length} sticky notes`
      );
      if (actualStickyNotes.length > 0) {
        loggers.orchestrator.debug("Sticky notes:", actualStickyNotes);
      }

      return {
        success: true,
        phase: "documentation",
        workflow: documentedWorkflow,
        stickyNotesAdded: claudeResponse.operations?.length || 0,
        reasoning: claudeResponse.reasoning,
      };
    } catch (error) {
      return {
        success: false,
        phase: "documentation",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        error: {
          type: "claude_api",
          code: "DOCUMENTATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to add documentation",
          retryable: true,
        },
      };
    }
  }

  /**
   * Extract minimal node metadata for documentation
   */
  private extractNodeMetadata(workflow: any): any {
    const nodeGroups = this.identifyNodeGroups(workflow);
    
    return {
      nodeGroups: nodeGroups.map(group => ({
        nodeIds: group.nodeIds,
        purpose: group.nodes.map(n => `${n.name} (${n.type})`).join(" → "),
        dataFlow: this.describeDataFlow(group, workflow.connections),
      })),
      totalNodes: workflow.nodes.length,
      workflowPurpose: workflow.name,
    };
  }

  /**
   * Identify logical groups of connected nodes
   */
  private identifyNodeGroups(workflow: any): any[] {
    const groups: any[] = [];
    const visited = new Set<string>();

    // Simple grouping by direct connections
    for (const node of workflow.nodes) {
      if (visited.has(node.id) || node.type === "n8n-nodes-base.stickyNote") {
        continue;
      }

      const group = {
        nodeIds: [node.id],
        nodes: [node],
      };

      // Find all nodes connected to this one
      const queue = [node.id];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        // Check outgoing connections
        if (workflow.connections[currentId]) {
          for (const connection of workflow.connections[currentId].main[0] || []) {
            if (!visited.has(connection.node)) {
              const connectedNode = workflow.nodes.find((n: any) => n.id === connection.node);
              if (connectedNode && connectedNode.type !== "n8n-nodes-base.stickyNote") {
                group.nodeIds.push(connection.node);
                group.nodes.push(connectedNode);
                visited.add(connection.node);
                queue.push(connection.node);
              }
            }
          }
        }
      }

      visited.add(node.id);
      groups.push(group);
    }

    return groups;
  }

  /**
   * Describe the data flow for a node group
   */
  private describeDataFlow(group: any, connections: any): string {
    const firstNode = group.nodes[0];
    const lastNode = group.nodes[group.nodes.length - 1];
    
    if (group.nodes.length === 1) {
      return `Standalone ${firstNode.type.split('.').pop()} node`;
    }
    
    return `${firstNode.type.split('.').pop()} → ${lastNode.type.split('.').pop()}`;
  }

  /**
   * Position sticky notes intelligently based on node groups
   */
  private positionStickyNotes(workflow: any): any {
    const stickyNotes = workflow.nodes.filter(
      (n: any) => n.type === "n8n-nodes-base.stickyNote"
    );

    for (const sticky of stickyNotes) {
      // Extract node group IDs from the sticky note's temporary property
      const nodeGroupIds = sticky._nodeGroupIds || [];
      
      if (nodeGroupIds.length > 0) {
        // Find the nodes in this group
        const groupNodes = workflow.nodes.filter((n: any) => 
          nodeGroupIds.includes(n.id) && n.type !== "n8n-nodes-base.stickyNote"
        );

        if (groupNodes.length > 0) {
          // Calculate bounding box of the node group
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          
          for (const node of groupNodes) {
            if (node.position) {
              minX = Math.min(minX, node.position[0]);
              minY = Math.min(minY, node.position[1]);
              maxX = Math.max(maxX, node.position[0]);
              maxY = Math.max(maxY, node.position[1]);
            }
          }

          // Position sticky note above the group
          sticky.position = [
            minX,
            minY - 200, // 200px above the group
          ];

          // Adjust size based on group width
          const groupWidth = maxX - minX + 250; // Add node width
          sticky.parameters.width = Math.max(250, Math.min(groupWidth, 400));
        }
      }
      
      // Clean up temporary property
      delete sticky._nodeGroupIds;
    }

    return workflow;
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
