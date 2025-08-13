/**
 * Building Phase Service
 *
 * Handles the building phase of workflow generation, including:
 * - Workflow structure creation
 * - Node connections
 * - Error handling configuration
 * - Visual positioning
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from "./base";
import { TOKEN_LIMITS } from "../constants";
import { workflowBuildResponseSchema } from "../validation/schemas";
import type { ClaudeBuildingResponse } from "@/types";
import { PromptParts } from "../prompts/common";

// ==========================================
// Type Definitions
// ==========================================

export interface BuildingInput {
  promptParts?: any; // Pre-built prompt parts from runner
  userIntent: string;
  configuredNodes: ConfiguredNode[];
}

export interface ConfiguredNode {
  id: string;
  type: string;
  purpose: string;
  config: any;
}

export interface BuildingOutput extends ClaudeBuildingResponse {
  // Inherits all properties from ClaudeBuildingResponse
  // Including: name, nodes, connections, settings, reasoning, operations, phases
}

// ==========================================
// Building Phase Service Implementation
// ==========================================

export class BuildingPhaseService extends BasePhaseService<
  BuildingInput,
  BuildingOutput
> {
  get phaseName(): string {
    return "building";
  }

  /**
   * Execute the building phase
   */
  async execute(
    input: BuildingInput,
    context: PhaseContext
  ): Promise<PhaseResult<BuildingOutput>> {
    const { promptParts, userIntent, configuredNodes } = input;

    this.logger.debug("Building workflow structure from configured nodes");

    try {
      // Use pre-built prompt parts or error
      if (!promptParts) {
        throw new Error("Building phase requires pre-built prompt parts");
      }

      // Call Claude for workflow building
      const result = await this.callClaude<BuildingOutput>(
        promptParts,
        TOKEN_LIMITS.building,
        workflowBuildResponseSchema as any,
        "buildWorkflow"
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error("Failed to build workflow"),
          usage: result.usage,
        };
      }

      // Ensure the workflow has required fields
      const workflow = this.ensureWorkflowStructure(result.data);

      this.logSuccess("Workflow building", {
        workflowName: workflow.name,
        nodeCount: workflow.nodes?.length || 0,
        connectionCount: Object.keys(workflow.connections || {}).length,
      });

      return {
        success: true,
        data: workflow,
        usage: result.usage,
        reasoning: result.data.reasoning,
      };
    } catch (error) {
      this.logError("building phase", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Ensure the workflow has all required structure
   */
  private ensureWorkflowStructure(data: any): BuildingOutput {
    const workflow: BuildingOutput = {
      name: data.name || "n8n Workflow",
      nodes: data.nodes || [],
      connections: data.connections || {},
      settings: data.settings || {
        executionOrder: "v1",
        saveDataSuccessExecution: "all",
        saveDataErrorExecution: "all",
        saveManualExecutions: true,
      },
      phases: data.phases, // Preserve phases from Claude's response
      operations: [], // Building phase doesn't use operations
      reasoning: data.reasoning || ["Workflow built from configured nodes"],
    };

    // Ensure nodes have required fields
    workflow.nodes = workflow.nodes.map((node: any, index: number) => ({
      ...node,
      id: node.id || `node_${index + 1}`,
      name: node.name || `Node ${index + 1}`,
      type: node.type,
      typeVersion: node.typeVersion || 1,
      position: node.position || [250 + index * 300, 300],
      parameters: node.parameters || {},
    }));

    // Validate connections structure
    if (
      typeof workflow.connections === "object" &&
      workflow.connections !== null
    ) {
      // Ensure each connection has the proper structure
      for (const [nodeName, connections] of Object.entries(
        workflow.connections
      )) {
        if (!connections || typeof connections !== "object") {
          (workflow.connections as any)[nodeName] = { main: [] };
        } else if (!(connections as any).main) {
          (workflow.connections as any)[nodeName] = { main: [] };
        }
      }
    }

    return workflow;
  }

  /**
   * Validate the built workflow structure
   */
  validateWorkflow(workflow: BuildingOutput): boolean {
    // Check for required fields
    if (!workflow.name || !workflow.nodes || workflow.nodes.length === 0) {
      this.logWarning("validateWorkflow", "Missing required workflow fields");
      return false;
    }

    // Check that all nodes have required properties
    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type) {
        this.logWarning(
          "validateWorkflow",
          `Node missing required fields: ${JSON.stringify(node)}`
        );
        return false;
      }

      if (
        !node.position ||
        !Array.isArray(node.position) ||
        node.position.length !== 2
      ) {
        this.logWarning(
          "validateWorkflow",
          `Node ${node.name} has invalid position`
        );
        return false;
      }
    }

    // Check connections reference valid nodes
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));

    for (const [sourceName, connections] of Object.entries(
      workflow.connections || {}
    )) {
      if (!nodeNames.has(sourceName)) {
        this.logWarning(
          "validateWorkflow",
          `Connection from non-existent node: ${sourceName}`
        );
        return false;
      }

      const mainConnections = (connections as any).main;
      if (Array.isArray(mainConnections)) {
        for (const connectionGroup of mainConnections) {
          if (Array.isArray(connectionGroup)) {
            for (const connection of connectionGroup) {
              if (!connection.node || !nodeNames.has(connection.node)) {
                this.logWarning(
                  "validateWorkflow",
                  `Connection to non-existent node: ${connection.node}`
                );
                return false;
              }
            }
          }
        }
      }
    }

    // Check for at least one trigger/webhook node
    const hasTrigger = workflow.nodes.some(
      (node) =>
        node.type.includes("trigger") ||
        node.type.includes("webhook") ||
        node.type.includes("schedule")
    );

    if (!hasTrigger) {
      this.logWarning("validateWorkflow", "No trigger node found in workflow");
      // This is a warning, not a failure - some workflows might not need triggers
    }

    return true;
  }
}
