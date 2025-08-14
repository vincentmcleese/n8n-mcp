// lib/orchestrator/runners/building.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  BuildingInput,
  BuildingOutput,
  BuildingRunnerDeps,
} from "@/types/orchestrator/building";
import { WorkflowOperation } from "@/types/workflow";
import type { ConfiguredNode } from "@/types/orchestrator/configuration";
import { BuildingPromptBuilder } from "@/services/claude/config/building-prompt-builder";
import { OperationLogger } from "@/lib/orchestrator/utils/OperationLogger";
import { wrapPhase } from "@/lib/orchestrator/utils/wrapPhase";
import { getConfigAnalyzer } from "@/lib/services/config-analyzer.service";

/**
 * Runner for the building phase
 * Handles workflow assembly from configured nodes
 */
export class BuildingRunner
  implements PhaseRunner<BuildingInput, BuildingOutput>
{
  private promptBuilder: BuildingPromptBuilder;

  constructor(private deps: BuildingRunnerDeps) {
    this.promptBuilder = new BuildingPromptBuilder();

    // Wrap the run method with wrapPhase for automatic operation persistence
    this.run = wrapPhase("building", this.run.bind(this));
  }

  /**
   * Run the building phase
   */
  async run(input: BuildingInput): Promise<BuildingOutput> {
    const { sessionId } = input;

    // ====================================================================
    // Set up token tracking for this phase
    // ====================================================================
    const operationLogger = new OperationLogger(sessionId, "building");
    const { logger: _logger, onTokenUsage } =
      operationLogger.withTokenTracking();

    // Connect token callback to Claude service
    if (this.deps.claudeService.setOnUsageCallback) {
      this.deps.claudeService.setOnUsageCallback(onTokenUsage);
    }

    try {
      // Get session to retrieve validated configurations
      const { configuredNodes, userPrompt } = await this.getBuildingContext(
        sessionId
      );

      // Validate we have configured nodes
      if (configuredNodes.length === 0) {
        return {
          success: false,
          phase: "building",
          workflow: { name: "", nodes: [], connections: {}, settings: {} },
          operations: [],
          error: {
            type: "validation",
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
          operations: [],
          error: {
            type: "validation",
            code: "NO_VALIDATED_NODES",
            message: "No validated nodes found",
            userMessage: "All nodes must be validated before building",
            retryable: false,
          },
        };
      }

      this.deps.loggers.orchestrator.debug("Starting building phase...");
      this.deps.loggers.orchestrator.debug(
        `Building workflow with ${validatedNodes.length} validated nodes`
      );

      const operations: WorkflowOperation[] = [];

      // Add phase transition operation
      operations.push({ type: "setPhase", phase: "building" });

      // Build the prompt using the prompt builder
      const promptParts = this.promptBuilder.buildPrompt({
        userIntent: userPrompt,
        configuredNodes: validatedNodes,
      });

      // Have Claude build the complete workflow with the built prompt parts
      const claudeResult = await this.deps.claudeService.execute(
        {
          promptParts, // Pass the properly structured prompt parts
          userPrompt,
          configuredNodes: validatedNodes,
        },
        { sessionId }
      );

      if (!claudeResult.success || !claudeResult.data) {
        // Include raw response in error for debugging
        const error = new Error("Failed to build workflow") as any;
        error.raw = (claudeResult as any).raw;
        throw error;
      }
      const claudeResponse = claudeResult.data;

      this.deps.loggers.orchestrator.info(
        `📊 BUILD PHASE: Claude response has phases: ${!!claudeResponse.phases}, count: ${
          claudeResponse.phases?.length || 0
        }`
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
        // Note: phases are stored separately in session state, not in workflow
      };

      // Enrich nodes with categories from configured nodes
      const categoryMap = new Map(
        validatedNodes.map((n) => [n.id, n.category])
      );
      workflow.nodes = workflow.nodes.map((node: any) => ({
        ...node,
        category: categoryMap.get(node.id) || undefined,
      }));

      this.deps.loggers.orchestrator.debug(
        `Built workflow with ${workflow.nodes.length} nodes`
      );

      // Add setWorkflow operation
      operations.push({ type: "setWorkflow", workflow } as WorkflowOperation);

      // Store phases separately in session state if they exist
      if (claudeResponse.phases) {
        operations.push({
          type: "setBuildPhases",
          phases: claudeResponse.phases,
        } as any);
        this.deps.loggers.orchestrator.info(
          `📊 BUILD PHASE: Storing ${claudeResponse.phases.length} phases in session state`
        );
        this.deps.loggers.orchestrator.info(
          `📊 BUILD PHASE: Phases content:`,
          JSON.stringify(claudeResponse.phases, null, 2)
        );
      } else {
        this.deps.loggers.orchestrator.warn(
          `⚠️ BUILD PHASE: No phases generated by Claude!`
        );
      }

      // Generate configuration analysis for the workflow
      const configAnalyzer = getConfigAnalyzer();
      const configAnalysis = configAnalyzer.analyzeWorkflow(workflow);
      
      operations.push({
        type: "setConfigAnalysis",
        analysis: configAnalysis,
      } as WorkflowOperation);
      
      this.deps.loggers.orchestrator.info(
        `📋 BUILD PHASE: Configuration analysis - ${configAnalysis.configuredNodes}/${configAnalysis.totalNodes} nodes configured`
      );
      
      if (!configAnalysis.isComplete) {
        this.deps.loggers.orchestrator.warn(
          `⚠️ BUILD PHASE: Workflow needs additional configuration - ${configAnalysis.missingCredentials.length} credentials missing`
        );
      }

      // Add phase completion operation
      operations.push({ type: "completePhase", phase: "building" });

      // Persistence is now handled automatically by wrapPhase wrapper
      this.deps.loggers.orchestrator.debug(
        `Generated ${operations.length} operations including workflow and phases`
      );

      return {
        success: true,
        phase: "building",
        workflow,
        operations,
        reasoning: claudeResponse.reasoning,
      };
    } catch (error) {
      // Record error in Supabase
      await this.deps.sessionRepo.recordError(sessionId, error, "building");

      return {
        success: false,
        phase: "building",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        operations: [],
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
   * Get building context from session
   */
  private async getBuildingContext(sessionId: string) {
    let configuredNodes: ConfiguredNode[] = [];
    let userPrompt = "";

    const session = await this.deps.sessionRepo.load(sessionId);
    if (session) {
      // Handle Map type for configured nodes
      const configured = session.state.configured;

      let configArray: any[] = [];

      if (configured instanceof Map) {
        // Convert Map to array
        configArray = Array.from(configured.values());
        this.deps.loggers.orchestrator.debug(
          `BuildingRunner: Configured is a Map with ${configured.size} entries`
        );
      } else if (Array.isArray(configured)) {
        configArray = configured;
        this.deps.loggers.orchestrator.debug(
          `BuildingRunner: Configured is an array with ${configured.length} entries`
        );
      } else if (configured && typeof configured === "object") {
        // Fallback for plain object
        configArray = Object.values(configured);
        this.deps.loggers.orchestrator.debug(
          `BuildingRunner: Configured is an object with ${
            Object.keys(configured).length
          } entries`
        );
      }

      this.deps.loggers.orchestrator.debug(
        `BuildingRunner: configArray length: ${configArray.length}`
      );

      // Add validated property based on validation state
      const validated = session.state.validated;
      configuredNodes = configArray.map((node: any) => {
        const nodeId = node.nodeId || node.id;
        let validationResult;

        if (validated instanceof Map) {
          validationResult = validated.get(nodeId);
        } else if (validated && typeof validated === "object") {
          validationResult = validated[nodeId];
        }

        const mappedNode = {
          id: node.nodeId || node.id,
          type: node.nodeType || node.type || "",
          purpose: node.purpose || "",
          config: node.parameters || node.config || {}, // Just pass config as-is
          validated: validationResult ? validationResult.valid : true,
        };

        return mappedNode;
      });

      userPrompt = session.state.userPrompt || "";
    }

    this.deps.loggers.orchestrator.debug(
      `BuildingRunner: Final configuredNodes count: ${configuredNodes.length}`
    );

    return { configuredNodes, userPrompt };
  }
}
