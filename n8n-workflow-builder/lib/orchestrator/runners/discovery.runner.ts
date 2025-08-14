// lib/orchestrator/runners/discovery.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  DiscoveryInput,
  DiscoveryOutput,
  ClarificationInput,
  DiscoveryRunnerDeps,
} from "@/types/orchestrator/discovery";
import { DiscoveredNode, WorkflowOperation } from "@/types/workflow";
import { wrapPhase, PhaseContext } from "@/lib/orchestrator/utils/wrapPhase";
import { TaskService, GapSearchService } from "@/services/mcp";
import type { ClaudeAnalysisResponse } from "@/types/claude";

/**
 * Runner for the discovery phase (OPTIMIZED with task-based flow)
 *
 * New flow:
 * 1. Intent analysis -> exact task names + unmatched capabilities
 * 2. Direct task fetching from MCP (no Claude)
 * 3. Gap searching with optimized terms (no Claude)
 * 4. Claude selection only for gaps (if any)
 * 5. Hybrid assembly with pre-configured flags
 */
export class DiscoveryRunner
  implements PhaseRunner<DiscoveryInput, DiscoveryOutput>
{
  private taskService: TaskService;
  private gapSearchService: GapSearchService;

  constructor(private deps: DiscoveryRunnerDeps) {
    // Initialize services with MCP client from deps or node context
    // Prefer the one from deps if available as it's more likely to be fresh
    const mcpClient =
      this.deps.mcpClient ||
      this.deps.nodeContextService.getMCPClient?.() ||
      undefined;
    this.taskService = new TaskService(mcpClient);
    this.gapSearchService = new GapSearchService(mcpClient);

    // Note: run method is already wrapped with wrapPhase in its definition (line 48)
    // Do NOT double-wrap here as it causes operations to be persisted multiple times
  }

  /**
   * Run the discovery phase - wrapped with error handling and operation logging
   */
  run = wrapPhase<DiscoveryInput, DiscoveryOutput>(
    "discovery",
    async (
      input: DiscoveryInput,
      context: PhaseContext
    ): Promise<DiscoveryOutput> => {
      const { sessionId, prompt, userId } = input;
      const { operationLogger } = context;

      this.deps.loggers.orchestrator.info(
        "Starting OPTIMIZED discovery phase with task-based flow"
      );

      // Initialize Supabase session if enabled (pass userId for ownership)
      await this.deps.sessionRepo.initialize(sessionId, prompt, userId);

      // Try to load existing session from Supabase
      const existingSession = await this.deps.sessionRepo.load(sessionId);
      if (existingSession) {
        this.deps.loggers.orchestrator.info(
          `Recovered existing session ${sessionId} from phase: ${existingSession.state.phase}`
        );

        // If session exists and is past discovery, return existing discovery results
        if (
          existingSession.state.phase !== "discovery" &&
          existingSession.state.discovered.length > 0
        ) {
          return {
            success: true,
            operations: [],
            phase: existingSession.state.phase,
            discoveredNodes: existingSession.state.discovered,
            selectedNodeIds: existingSession.state.selected,
            reasoning: [
              `Recovered from existing session in ${existingSession.state.phase} phase`,
            ],
          };
        }
      }

      // ====================================================================
      // STEP 1: Intent Analysis with exact task names
      // ====================================================================

      const { logger: _logger, onTokenUsage } =
        operationLogger.withTokenTracking();
      if (this.deps.claudeService.setOnUsageCallback) {
        this.deps.claudeService.setOnUsageCallback(onTokenUsage);
      }

      this.deps.loggers.orchestrator.debug(
        "Step 1: Analyzing intent for task-based discovery"
      );
      const analysisResult = await this.deps.claudeService.analyzeIntent({
        prompt,
      });

      if (!analysisResult.success || !analysisResult.data) {
        // Log more details about the failure
        this.deps.loggers.orchestrator.error("Intent analysis failed", {
          success: analysisResult.success,
          hasData: !!analysisResult.data,
          error: analysisResult.error?.message || "Unknown error",
          usage: analysisResult.usage,
        });
        throw new Error(
          `Failed to analyze workflow intent: ${
            analysisResult.error?.message || "Invalid response"
          }`
        );
      }

      const intentAnalysis = analysisResult.data as ClaudeAnalysisResponse;

      // Log what Claude identified
      this.deps.loggers.orchestrator.debug("Intent analysis results", {
        matchedTasks: intentAnalysis.matched_tasks,
        unmatchedCount: intentAnalysis.unmatched_capabilities?.length || 0,
        searchSuggestions: intentAnalysis.search_suggestions?.length || 0,
        unmatchedCapabilities: intentAnalysis.unmatched_capabilities,
        searchSuggestionsDetail: intentAnalysis.search_suggestions,
      });

      // Log task selection reasoning if available
      if (
        intentAnalysis.task_selection_reasoning &&
        intentAnalysis.task_selection_reasoning.length > 0
      ) {
        this.deps.loggers.orchestrator.info("Task selection reasoning:");
        intentAnalysis.task_selection_reasoning.forEach(({ task, reason }) => {
          this.deps.loggers.orchestrator.info(`  📦 ${task}: ${reason}`);
        });
      }

      // Check if clarification is needed
      if (intentAnalysis.clarification_needed && intentAnalysis.clarification) {
        this.deps.loggers.orchestrator.info(
          "Clarification needed from intent analysis"
        );

        const clarificationOp: WorkflowOperation = {
          type: "requestClarification",
          questionId: `q_${Date.now()}`,
          question: intentAnalysis.clarification.question,
          context: {
            reason: intentAnalysis.clarification.context,
            suggestions: intentAnalysis.clarification.suggestions,
          },
        };

        return {
          success: true,
          operations: [clarificationOp],
          phase: "discovery",
          discoveredNodes: [],
          selectedNodeIds: [],
          pendingClarification: {
            questionId: clarificationOp.questionId,
            question: clarificationOp.question,
          },
          reasoning: intentAnalysis.reasoning || [],
        };
      }

      this.deps.loggers.orchestrator.info(
        `Intent analysis complete: ${intentAnalysis.matched_tasks.length} tasks, ` +
          `${intentAnalysis.unmatched_capabilities.length} gaps`
      );

      // ====================================================================
      // STEP 2: Fetch task nodes directly (NO CLAUDE NEEDED!)
      // ====================================================================

      let taskNodes: DiscoveredNode[] = [];
      let taskOperations: WorkflowOperation[] = [];

      if (intentAnalysis.matched_tasks.length > 0) {
        this.deps.loggers.orchestrator.debug(
          `Step 2: Fetching ${intentAnalysis.matched_tasks.length} task templates: ` +
            intentAnalysis.matched_tasks.join(", ")
        );

        const taskResult = await this.taskService.fetchTaskNodes(
          intentAnalysis.matched_tasks
        );

        // Convert successful task fetches to discovered nodes
        taskNodes = taskResult.successful.map((task) => {
          // LOG CATEGORY FROM TASK
          this.deps.loggers.orchestrator.info(
            `📦 Task node ${task.taskName}: type=${task.nodeType}, category=${
              task.category || "MISSING"
            }`
          );
          return {
            id: task.nodeId,
            type: task.nodeType,
            displayName: task.taskName.replace(/_/g, " "),
            purpose: task.purpose || `Pre-configured: ${task.taskName}`,
            category: task.category, // Preserve category from MCP
            isPreConfigured: true,
            config: task.config,
          };
        });

        // Generate operations for task nodes, including pre-configured flags
        taskOperations = taskResult.successful.flatMap((task) => [
          {
            type: "discoverNode" as const,
            node: {
              id: task.nodeId,
              type: task.nodeType,
              purpose: task.purpose || `Pre-configured: ${task.taskName}`,
              displayName: task.taskName.replace(/_/g, " "),
              category: task.category, // Include category in operation
              isPreConfigured: true,
              config: task.config,
            },
          },
          {
            type: "selectNode" as const,
            nodeId: task.nodeId,
          },
        ]);

        this.deps.loggers.orchestrator.info(
          `✅ Fetched ${taskResult.successful.length}/${intentAnalysis.matched_tasks.length} task templates`
        );

        // Convert failed tasks to unmatched capabilities
        if (taskResult.failed.length > 0) {
          const additionalGaps =
            this.taskService.convertFailedTasksToCapabilities(
              taskResult.failed
            );
          intentAnalysis.unmatched_capabilities.push(...additionalGaps);

          this.deps.loggers.orchestrator.warn(
            `Failed to fetch ${taskResult.failed.length} tasks, added to gaps`
          );
        }
      }

      // ====================================================================
      // STEP 3: Search for gaps (NO CLAUDE NEEDED!)
      // ====================================================================

      let gapNodes: DiscoveredNode[] = [];
      let gapOperations: WorkflowOperation[] = [];

      if (intentAnalysis.unmatched_capabilities.length > 0) {
        this.deps.loggers.orchestrator.debug(
          `Step 3: Searching for ${intentAnalysis.unmatched_capabilities.length} capability gaps`
        );

        const gapResults = await this.gapSearchService.searchForGaps(
          intentAnalysis.unmatched_capabilities
        );

        this.deps.loggers.orchestrator.info(
          `Gap search complete: ${gapResults.summary.found}/${gapResults.summary.totalCapabilities} found, ` +
            `${gapResults.summary.totalNodes} total nodes`
        );

        // ====================================================================
        // STEP 4: Claude selects from pre-searched results (ONLY IF GAPS EXIST)
        // ====================================================================

        if (gapResults.summary.totalNodes > 0) {
          this.deps.loggers.orchestrator.debug(
            "Step 4: Having Claude select best nodes from search results"
          );

          // Format the results for selection
          const formattedResults =
            this.gapSearchService.formatResultsForSelection(gapResults);

          // Debug log the formatted results Claude will see
          this.deps.loggers.orchestrator.debug(
            "Formatted search results for Claude:\n" + formattedResults
          );

          // Call Claude for gap selection using the new method
          const selectionResult =
            await this.deps.claudeService.selectFromGapResults({
              prompt,
              sessionId,
              intentAnalysis,
              gapResults,
              formattedResults,
            });

          if (selectionResult.success && selectionResult.data) {
            // Debug log Claude's selection
            this.deps.loggers.orchestrator.debug(
              "Claude's selection operations:",
              JSON.stringify(selectionResult.data.operations, null, 2)
            );

            const {
              discoveredNodes: selectedGapNodes,
              operations: selectedGapOps,
            } = this.processGapSelections(
              selectionResult.data.operations,
              gapResults
            );

            gapNodes = selectedGapNodes;
            gapOperations = selectedGapOps;

            this.deps.loggers.orchestrator.info(
              `Claude selected ${gapNodes.length} nodes from search results`
            );

            // Log what nodes were actually selected
            gapNodes.forEach((node) => {
              this.deps.loggers.orchestrator.debug(
                `Selected gap node: ${node.type} - ${node.displayName} (${node.purpose})`
              );
            });
          }
        } else {
          this.deps.loggers.orchestrator.warn(
            "No nodes found for capability gaps - may need manual configuration"
          );
        }
      }

      // ====================================================================
      // STEP 5: Assemble hybrid output
      // ====================================================================

      const allDiscoveredNodes = [...taskNodes, ...gapNodes];
      const allOperations = [...taskOperations, ...gapOperations];
      const selectedNodeIds = allDiscoveredNodes.map((n) => n.id);

      // Note: Operations are persisted automatically by wrapPhase wrapper
      // No need to manually log them here as it causes duplication

      // Log phase completion
      await operationLogger.logPhaseCompletion(
        analysisResult.usage?.totalTokens || 0
      );

      // Log summary
      this.deps.loggers.orchestrator.info(
        `Discovery completed: ${allDiscoveredNodes.length} nodes (${taskNodes.length} tasks, ${gapNodes.length} searched)`
      );

      if (allDiscoveredNodes.length > 0 && allDiscoveredNodes.length <= 5) {
        const nodeTypes = allDiscoveredNodes.map((n) => n.type).join(", ");
        this.deps.loggers.orchestrator.info(
          `   Discovered nodes: ${nodeTypes}`
        );
      }

      // Generate SEO metadata if discovery is complete (no pending clarifications)
      if (!intentAnalysis.clarification && allDiscoveredNodes.length > 0) {
        try {
          // Lazy import to avoid circular dependencies
          const { getSEOGenerator } = await import('@/lib/services/seo-generator.service');
          const seoGenerator = getSEOGenerator();
          
          const seoMetadata = await seoGenerator.generateSEO(
            allDiscoveredNodes,
            selectedNodeIds,
            prompt,
            sessionId
          );
          
          // Add SEO operation to persist it
          allOperations.push({
            type: "setSEOMetadata" as const,
            seo: seoMetadata
          });
          
          this.deps.loggers.orchestrator.info(
            `SEO metadata generated: ${seoMetadata.slug}`
          );
        } catch (error) {
          // SEO generation failure should not block discovery
          this.deps.loggers.orchestrator.error(
            'Failed to generate SEO metadata',
            { error: error instanceof Error ? error.message : 'Unknown error' }
          );
        }
      }

      return {
        success: true,
        operations: allOperations,
        phase: "discovery",
        discoveredNodes: allDiscoveredNodes,
        selectedNodeIds,
        reasoning: [
          `Analyzed intent: ${intentAnalysis.intent}`,
          `Found ${taskNodes.length} pre-configured task templates`,
          `Searched for ${intentAnalysis.unmatched_capabilities.length} capability gaps`,
          `Total nodes discovered: ${allDiscoveredNodes.length}`,
        ],
      };
    }
  );

  /**
   * Handle clarification response
   */
  async handleClarification(
    input: ClarificationInput
  ): Promise<DiscoveryOutput> {
    const { sessionId, questionId, response } = input;

    this.deps.loggers.orchestrator.debug(
      `Processing clarification response for question: ${questionId}`
    );

    // Load session state
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

    const originalPrompt = supabaseSession.state.userPrompt || "";

    // Compose clarified prompt in a structured way
    const clarifiedPrompt = `${originalPrompt}\n\nClarification[${questionId}]: ${response}`;

    this.deps.loggers.orchestrator.debug(
      `Updating existing session ${sessionId} with clarified prompt`
    );

    // Persist clarification response and updated user prompt as operations
    const ops: WorkflowOperation[] = [
      { type: "clarificationResponse", questionId, response },
      {
        type: "setUserPrompt",
        prompt: clarifiedPrompt,
        reason: "clarification" as const,
      },
    ];
    // Persistence is now handled automatically by wrapPhase wrapper

    // Re-run discovery with clarified prompt (session already exists)
    return this.run({ sessionId, prompt: clarifiedPrompt });
  }

  /**
   * Process Claude's gap selections into nodes and operations
   */
  private processGapSelections(
    operations: WorkflowOperation[],
    gapResults: any
  ): {
    discoveredNodes: DiscoveredNode[];
    operations: WorkflowOperation[];
  } {
    const discoveredNodes: DiscoveredNode[] = [];
    const processedOps: WorkflowOperation[] = [];
    let searchNodeCounter = 1;

    for (const operation of operations) {
      if (operation.type === "discoverNode") {
        // Replace gap_node_placeholder with proper search_node_ ID
        const nodeId =
          operation.node.id === "gap_node_placeholder"
            ? `search_node_${searchNodeCounter++}`
            : operation.node.id;

        // LOG CATEGORY FROM GAP NODE
        this.deps.loggers.orchestrator.info(
          `🔍 Gap node ${nodeId}: type=${operation.node.type}, category=${
            operation.node.category || "MISSING"
          }`
        );

        const node: DiscoveredNode = {
          id: nodeId,
          type: operation.node.type,
          displayName: operation.node.displayName || operation.node.type,
          purpose: operation.node.purpose,
          category: operation.node.category, // Preserve category from Claude's selection
          needsConfiguration: true, // Gap nodes need configuration
        };
        discoveredNodes.push(node);

        // Update operation with new ID
        processedOps.push({
          ...operation,
          node: { ...operation.node, id: nodeId },
        });
      } else if (operation.type === "selectNode") {
        // Update selectNode operations that reference the placeholder
        if (operation.nodeId === "gap_node_placeholder") {
          // Get the ID from the previous discoverNode operation
          const prevOp = processedOps[processedOps.length - 1];
          if (prevOp?.type === "discoverNode") {
            processedOps.push({
              ...operation,
              nodeId: prevOp.node.id,
            });
          } else {
            // Shouldn't happen, but handle gracefully
            processedOps.push(operation);
          }
        } else {
          processedOps.push(operation);
        }
      }
    }

    return { discoveredNodes, operations: processedOps };
  }
}
