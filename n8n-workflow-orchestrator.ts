import {
  WorkflowSession,
  WorkflowOperation,
  WorkflowPhase,
  DiscoveredNode,
  ErrorResponse,
  ValidationError,
} from "@/types/workflow";
import {
  ClaudeService,
  NodeInfoRequirements,
} from "@/lib/services/claude-service";
import { MCPClient } from "@/lib/mcp-client";
import { supabase } from "@/lib/db/client";
import { PhaseManager } from "@/lib/phase-manager";

export interface DiscoveryResult {
  id: string;
  type: string;
  purpose: string;
  config: any;
  validated: boolean;
  validationErrors?: ValidationError[];
}

export interface ConfigurationResult {
  success: boolean;
  operations: WorkflowOperation[];
  phase: WorkflowPhase;
  configured: DiscoveredNode[];
  reasoning: string;
  error?: ErrorResponse;
}

export class WorkflowOrchestrator {
  private claudeService: ClaudeService;
  private mcpClient: MCPClient;
  private phaseManager: PhaseManager;

  constructor() {
    this.claudeService = new ClaudeService();
    this.mcpClient = new MCPClient();
    this.phaseManager = new PhaseManager();
  }

  async discoverNodes(
    workflowSession: WorkflowSession
  ): Promise<WorkflowOperation[]> {
    const operations: WorkflowOperation[] = [];
    const discoveredNodes: DiscoveredNode[] = [];

    for (const node of workflowSession.nodes) {
      const operation = await this.claudeService.discoverNode(node.type);
      operations.push(operation);
      discoveredNodes.push(operation.result);
    }

    return operations;
  }

  async configureNodes(
    workflowSession: WorkflowSession,
    selectedNodeIds: string[],
    nodeConfigs: any[]
  ): Promise<ConfigurationResult> {
    try {
      // Get session to build context for configuration
      const context = await this.claudeService.buildContext(workflowSession);

      if (selectedNodeIds.length === 0) {
        return {
          success: false,
          operations: [],
          phase: "configuration",
          configured: [],
          error: {
            type: "client",
            code: "NO_NODES_SELECTED",
            message: "No nodes selected for configuration",
            userMessage:
              "Please complete discovery phase with selected nodes first",
            retryable: false,
          },
        };
      }

      const configured: DiscoveredNode[] = [];
      const reasoning: string = "";
      let validCount = 0;
      let allValid = true;

      for (const node of workflowSession.nodes) {
        if (!selectedNodeIds.includes(node.id)) {
          continue;
        }

        const nodeConfig = nodeConfigs.find((nc) => nc.id === node.id);
        if (!nodeConfig) {
          allValid = false;
          configured.push({
            id: node.id,
            type: node.type,
            purpose: node.purpose,
            config: {},
            validated: false,
            validationErrors: [
              {
                message: `No configuration found for node with ID: ${node.id}`,
              },
            ],
          });
          continue;
        }

        const validationResult = await this.claudeService.validateConfig(
          node.type,
          nodeConfig
        );
        const isValid = validationResult.success;
        let validationErrors: ValidationError[] = [];

        if (!isValid) {
          if (validationResult.errors) {
            validationErrors = Array.isArray(validationResult.errors)
              ? validationResult.errors
              : [validationResult.errors];
          } else if (validationResult.missingFields) {
            validationErrors = validationResult.missingFields.map(
              (field: string) => ({
                message: `Missing required field: ${field}`,
              })
            );
          } else if (validationResult.missingRequiredFields) {
            validationErrors = validationResult.missingRequiredFields.map(
              (field: string) => ({
                message: `Missing required field: "${field}" (this might be a display name - check the node properties for the actual field name)`,
              })
            );
          }
        }

        configured.push({
          id: node.id,
          type: node.type,
          purpose: node.purpose,
          config: nodeConfig,
          validated: isValid,
          validationErrors: isValid ? undefined : validationErrors,
        });

        // Add validation operation for tracking
        const validationOperation = {
          id: `validation-${node.id}`,
          type: "validation",
          phase: "configuration",
          status: isValid ? "success" : "failure",
          message: isValid
            ? "Node configuration is valid"
            : `Node configuration is invalid: ${validationErrors
                .map((e) => e.message)
                .join(", ")}`,
          details: {
            nodeId: node.id,
            nodeType: node.type,
            validationErrors: validationErrors,
          },
        };
        operations.push(validationOperation);

        if (isValid) {
          validCount++;
        } else {
          allValid = false;
        }
      }

      return {
        success: true,
        operations: operations,
        phase: "configuration",
        configured,
        reasoning,
        error: allValid
          ? undefined
          : {
              type: "validation",
              code: "PARTIAL_VALIDATION_FAILURE",
              message: `${
                configured.length - validCount
              } nodes failed validation`,
              userMessage: `Some nodes could not be properly configured. ${validCount} of ${configured.length} nodes are ready.`,
              retryable: false,
            },
      };
    } catch (error) {
      console.error(`[WorkflowOrchestrator] Failed to configure nodes:`, error);
      return {
        success: false,
        operations: [],
        phase: "configuration",
        configured: [],
        reasoning: "",
        error: {
          type: "server",
          code: "CONFIGURATION_FAILED",
          message: "Failed to configure nodes",
          userMessage: "Configuration failed. Please try again.",
          retryable: false,
        },
      };
    }
  }

  private async _validateConfig(nodeType: string, config: any) {
    let validationErrors: ValidationError[] = [];
    let isValid = false;

    try {
      console.log(
        `[WorkflowOrchestrator] Validating configuration for ${nodeType}`
      );
      const validationResult = await this.claudeService.validateConfig(
        nodeType,
        config
      );

      if (validationResult.success) {
        const validation = JSON.parse(validationResult.content[0].text);
        isValid = validation.valid || validation.isValid || false;
        if (!isValid) {
          if (validation.errors) {
            validationErrors = Array.isArray(validation.errors)
              ? validation.errors
              : [validation.errors];
          } else if (validation.missingFields) {
            validationErrors = validation.missingFields.map(
              (field: string) => ({
                message: `Missing required field: ${field}`,
              })
            );
          } else if (validation.missingRequiredFields) {
            validationErrors = validation.missingRequiredFields.map(
              (field: string) => ({
                message: `Missing required field: "${field}" (this might be a display name - check the node properties for the actual field name)`,
              })
            );
          }
        }
      } else {
        console.log(
          `[WorkflowOrchestrator] Validation failed for ${nodeType}:`,
          validationResult.errors || validationResult.message
        );
        if (validationResult.errors) {
          validationErrors = Array.isArray(validationResult.errors)
            ? validationResult.errors
            : [validationResult.errors];
        } else if (validationResult.message) {
          validationErrors = [{ message: validationResult.message }];
        }
      }
    } catch (e) {
      console.log(`[WorkflowOrchestrator] Could not parse validation result`);
      validationErrors = [
        {
          message: `Failed to validate configuration for ${nodeType}: ${e.message}`,
        },
      ];
    }
    return { isValid, validationErrors };
  }
}
