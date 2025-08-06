// lib/orchestrator/runners/building.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  BuildingInput,
  BuildingOutput,
  BuildingRunnerDeps,
} from "@/lib/orchestrator/contracts/building.types";
import { WorkflowOperation } from "@/types/workflow";
import { ConfiguredNode } from "@/lib/orchestrator/contracts/configuration.types";

/**
 * Runner for the building phase
 * Handles workflow assembly from configured nodes
 */
export class BuildingRunner implements PhaseRunner<BuildingInput, BuildingOutput> {
  constructor(private deps: BuildingRunnerDeps) {}

  /**
   * Run the building phase
   */
  async run(input: BuildingInput): Promise<BuildingOutput> {
    const { sessionId } = input;
    
    try {
      // Get session to retrieve validated configurations
      const { configuredNodes, userPrompt } = await this.getBuildingContext(sessionId);

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
      operations.push({ type: 'setPhase', phase: 'building' });

      // Have Claude build the complete workflow
      const claudeResult = await this.deps.claudeService.execute(
        {
          userPrompt,
          configuredNodes: validatedNodes,
        },
        { sessionId }
      );
      
      if (!claudeResult.success || !claudeResult.data) {
        throw new Error('Failed to build workflow');
      }
      const claudeResponse = claudeResult.data;

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

      this.deps.loggers.orchestrator.debug(
        `Built workflow with ${workflow.nodes.length} nodes`
      );

      // Save draft workflow to session state for validation phase
      await this.saveDraftWorkflow(sessionId, workflow);

      // Add phase completion operation
      operations.push({ type: 'completePhase', phase: 'building' });
      
      // Persist operations before forcing save
      if (operations.length > 0) {
        await this.deps.sessionRepo.persistOperations(sessionId, operations);
      }

      // Force save at phase completion
      await this.deps.sessionRepo.save(sessionId);

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
      } else if (configured && typeof configured === 'object') {
        // Fallback for plain object
        configArray = Object.values(configured);
        this.deps.loggers.orchestrator.debug(
          `BuildingRunner: Configured is an object with ${Object.keys(configured).length} entries`
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
        } else if (validated && typeof validated === 'object') {
          validationResult = validated[nodeId];
        }
        const mappedNode = {
          id: node.nodeId || node.id,
          type: node.nodeType || node.type || '', // Handle both old and new structures
          purpose: node.purpose || '', // Handle missing purpose field
          config: node.parameters || node.config, // Handle both parameter names
          validated: validationResult ? validationResult.valid : true // Default to true if no validation result
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

  /**
   * Save draft workflow to session for validation phase
   */
  private async saveDraftWorkflow(sessionId: string, workflow: any) {
    try {
      const session = await this.deps.sessionRepo.load(sessionId);
      if (session) {
        // Update the workflow in the session state
        const operations: WorkflowOperation[] = [
          {
            type: 'setWorkflow',
            workflow: workflow
          } as WorkflowOperation
        ];
        
        await this.deps.sessionRepo.persistOperations(sessionId, operations);
        
        this.deps.loggers.orchestrator.debug(
          `Saved draft workflow to session`
        );
      }
    } catch (error) {
      this.deps.loggers.orchestrator.error(
        "Failed to save draft workflow:",
        error
      );
      // Continue anyway - validation can still work with the result
    }
  }
}