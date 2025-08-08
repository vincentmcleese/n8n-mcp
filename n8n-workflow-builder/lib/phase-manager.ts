// lib/phase-manager.ts

import {
  WorkflowPhase,
  WorkflowSession,
  WorkflowOperation,
} from "@/types/workflow";

export interface PhaseTransitionResult {
  canProgress: boolean;
  autoTransition: boolean;
  nextPhase?: WorkflowPhase;
  reason?: string;
}

export class PhaseManager {
  // Define allowed operations for each phase
  private phaseOperations: Record<WorkflowPhase, string[]> = {
    discovery: [
      "discoverNode",
      "selectNode",
      "deselectNode",
      "requestClarification",
      "clarificationResponse",
      "setUserPrompt",
    ],
    configuration: ["configureNode", "updateNodeConfig", "setUserPrompt"],
    building: [
      "addToWorkflow",
      "addConnection",
      "updateWorkflowSettings",
      "setUserPrompt",
    ],
    validation: ["validateNode", "addValidationError", "setUserPrompt"],
    documentation: ["addStickyNote", "setUserPrompt"],
    complete: [],
  };

  // Define MCP tools available in each phase
  private phaseTools: Record<WorkflowPhase, string[]> = {
    discovery: ["search_nodes", "get_node_info", "list_node_types"],
    configuration: [
      "get_node_essentials",
      "get_node_schema",
      "validate_params",
    ],
    building: ["generate_workflow", "optimize_workflow"],
    validation: [
      "validate_workflow",
      "check_connections",
      "get_input_schema",
      "get_output_schema",
    ],
    documentation: [], // No MCP tools needed for documentation phase
    complete: [],
  };

  /**
   * Check if the session can transition to the next phase
   */
  canTransition(state: WorkflowSession["state"]): PhaseTransitionResult {
    const {
      phase,
      selected,
      configured,
      validated,
      workflow,
      pendingClarifications,
    } = state;

    // Check for pending clarifications
    if (pendingClarifications.length > 0) {
      return {
        canProgress: false,
        autoTransition: false,
        reason: "Pending clarifications must be resolved",
      };
    }

    switch (phase) {
      case "discovery":
        if (selected.length === 0) {
          return {
            canProgress: false,
            autoTransition: false,
            reason: "No nodes selected",
          };
        }
        return {
          canProgress: true,
          autoTransition: false, // Discovery requires manual confirmation
          nextPhase: "configuration",
          reason: "Discovery complete, manual confirmation required",
        };

      case "configuration":
        const unconfiguredCount = selected.length - configured.size;
        if (unconfiguredCount > 0) {
          return {
            canProgress: false,
            autoTransition: false,
            reason: `${unconfiguredCount} node(s) still need configuration`,
          };
        }
        return {
          canProgress: true,
          autoTransition: true,
          nextPhase: "building",
        };

      case "building":
        if (workflow.nodes.length === 0) {
          return {
            canProgress: false,
            autoTransition: false,
            reason: "No nodes in workflow",
          };
        }
        return {
          canProgress: true,
          autoTransition: true,
          nextPhase: "validation",
        };

      case "validation":
        const hasErrors = Array.from(validated.values()).some((v) => !v.valid);
        if (hasErrors) {
          return {
            canProgress: true,
            autoTransition: true,
            nextPhase: "configuration",
            reason: "Validation errors found, returning to configuration",
          };
        }
        if (validated.size !== configured.size) {
          return {
            canProgress: false,
            autoTransition: false,
            reason: "Not all nodes validated",
          };
        }
        return {
          canProgress: true,
          autoTransition: true,
          nextPhase: "documentation",
        };

      case "documentation":
        // Documentation phase is complete when sticky notes have been added
        // Since documentation is the final content phase, we can auto-transition to complete
        return {
          canProgress: true,
          autoTransition: true,
          nextPhase: "complete",
        };

      case "complete":
        return {
          canProgress: false,
          autoTransition: false,
          reason: "Workflow already complete",
        };

      default:
        return {
          canProgress: false,
          autoTransition: false,
          reason: "Unknown phase",
        };
    }
  }

  /**
   * Get allowed operations for a specific phase
   */
  getAllowedOperations(phase: WorkflowPhase): string[] {
    return this.phaseOperations[phase] || [];
  }

  /**
   * Validate if an operation is allowed in the current phase
   */
  validateOperation(
    operation: WorkflowOperation,
    currentPhase: WorkflowPhase
  ): boolean {
    // Phase transition operations are always allowed
    if (operation.type === "setPhase" || operation.type === "completePhase") {
      return true;
    }

    const allowedOperations = this.getAllowedOperations(currentPhase);
    return allowedOperations.includes(operation.type);
  }

  /**
   * Get MCP tools available for a specific phase
   */
  getPhaseTools(phase: WorkflowPhase): string[] {
    return this.phaseTools[phase] || [];
  }

  /**
   * Get the next phase in the workflow
   */
  getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
    const phaseOrder: WorkflowPhase[] = [
      "discovery",
      "configuration",
      "building",
      "validation",
      "documentation",
      "complete",
    ];
    const currentIndex = phaseOrder.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
      return null;
    }

    return phaseOrder[currentIndex + 1];
  }
}
