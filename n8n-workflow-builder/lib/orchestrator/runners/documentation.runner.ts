// lib/orchestrator/runners/documentation.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  DocumentationInput,
  DocumentationOutput,
  DocumentationRunnerDeps,
} from "@/lib/orchestrator/contracts/documentation.types";
import { WorkflowOperation, WorkflowNode } from "@/types/workflow";
import {
  PHASE_DEFINITIONS,
  LAYOUT_CONFIG,
  detectActivePhases,
  calculateUnifiedHeight,
  generateLayoutHints,
  PhaseGroups,
  PhaseName,
} from "@/lib/orchestrator/helpers/phase-categorization";

/**
 * Runner for the documentation phase
 * Creates phase-based sticky notes for visual workflow organization
 * Uses deterministic categorization instead of Claude AI
 */
export class DocumentationRunner implements PhaseRunner<DocumentationInput, DocumentationOutput> {
  constructor(private deps: DocumentationRunnerDeps) {}

  /**
   * Run the documentation phase
   * Groups nodes by phase and creates magazine-quality visual layout
   */
  async run(input: DocumentationInput): Promise<DocumentationOutput> {
    const { sessionId, validationResult } = input;
    
    try {
      // Get validated workflow
      let validatedWorkflow: any = null;
      
      if (validationResult?.workflow) {
        validatedWorkflow = validationResult.workflow;
      } else {
        // Load from session if not provided
        const session = await this.deps.sessionRepo.load(sessionId);
        if (!session?.state?.workflow) {
          return {
            success: false,
            phase: "documentation",
            workflow: { name: "", nodes: [], connections: {}, settings: {} },
            operations: [],
            error: {
              type: "validation",
              code: "NO_WORKFLOW",
              message: "No validated workflow found",
              userMessage: "Please complete validation phase first",
              retryable: false,
            },
          };
        }
        validatedWorkflow = session.state.workflow;
      }

      this.deps.loggers.orchestrator.debug("Starting documentation phase with visual layout system...");
      
      const operations: WorkflowOperation[] = [];
      
      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'documentation' });

      // Group nodes by phase
      const phaseGroups = detectActivePhases(validatedWorkflow.nodes);
      this.deps.loggers.orchestrator.debug("Phase groups detected:", phaseGroups);

      // Generate layout hints
      const layoutHints = generateLayoutHints(phaseGroups, validatedWorkflow.nodes);
      this.deps.loggers.orchestrator.debug("Layout hints:", layoutHints);

      // Calculate unified height for all sticky notes
      const unifiedHeight = calculateUnifiedHeight(phaseGroups, validatedWorkflow.nodes);
      this.deps.loggers.orchestrator.debug(`Unified sticky height: ${unifiedHeight}px`);

      // Generate phase-based sticky notes
      const stickyNotes = this.generatePhaseStickyNotes(
        phaseGroups,
        validatedWorkflow.nodes,
        unifiedHeight
      );

      // Add sticky notes to workflow
      let documentedWorkflow = {
        ...validatedWorkflow,
        nodes: [...validatedWorkflow.nodes, ...stickyNotes],
      };

      this.deps.loggers.orchestrator.debug(
        `Added ${stickyNotes.length} phase sticky notes`
      );
      
      // Log the actual sticky notes in the workflow
      const actualStickyNotes = documentedWorkflow.nodes.filter(
        (n: any) => n.type === "n8n-nodes-base.stickyNote"
      );
      this.deps.loggers.orchestrator.debug(
        `Workflow now contains ${actualStickyNotes.length} sticky notes`
      );
      if (actualStickyNotes.length > 0) {
        this.deps.loggers.orchestrator.debug("Sticky notes:", actualStickyNotes);
      }

      // Save the documented workflow to state
      operations.push({ type: 'setWorkflow', workflow: documentedWorkflow });

      // Add phase completion operation
      operations.push({ type: 'completePhase', phase: 'documentation' });
      
      // Persist operations before forcing save
      if (operations.length > 0) {
        await this.deps.sessionRepo.persistOperations(sessionId, operations);
      }

      // Force save at phase completion
      await this.deps.sessionRepo.save(sessionId);

      return {
        success: true,
        phase: "documentation",
        workflow: documentedWorkflow,
        operations,
        stickyNotesAdded: stickyNotes.length,
        reasoning: [`Created ${stickyNotes.length} phase-based sticky notes for ${layoutHints.presentPhases.join(", ")} phases`],
      };
    } catch (error) {
      // Record error in Supabase
      await this.deps.sessionRepo.recordError(sessionId, error, "documentation");
      
      return {
        success: false,
        phase: "documentation",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        operations: [],
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
   * Generate phase-based sticky notes for visual workflow organization
   */
  private generatePhaseStickyNotes(
    phaseGroups: PhaseGroups,
    nodes: WorkflowNode[],
    unifiedHeight: number
  ): WorkflowNode[] {
    const stickyNotes: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    
    // Calculate cumulative X position for each phase
    let currentX = 100; // Starting X position
    
    // Process each phase in order
    const phaseOrder: PhaseName[] = ["triggers", "inputs", "transforms", "outputs"];
    
    for (const phase of phaseOrder) {
      const nodeIds = phaseGroups[phase];
      if (nodeIds.length === 0) continue;
      
      const phaseConfig = PHASE_DEFINITIONS[phase];
      
      // Get nodes in this phase
      const phaseNodes = nodeIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is WorkflowNode => n !== undefined);
      
      if (phaseNodes.length === 0) continue;
      
      // Calculate phase boundaries
      const xPositions = phaseNodes.map((n) => n.position[0]);
      const yPositions = phaseNodes.map((n) => n.position[1]);
      
      const minX = Math.min(...xPositions) - LAYOUT_CONFIG.spacing.stickyPadding;
      const maxX = Math.max(...xPositions) + LAYOUT_CONFIG.dimensions.nodeWidth + LAYOUT_CONFIG.spacing.stickyPadding;
      const minY = Math.min(...yPositions) - LAYOUT_CONFIG.spacing.stickyPadding;
      
      // Create sticky note for this phase
      const stickyNote: WorkflowNode = {
        id: `sticky_${phase}_${Date.now()}`,
        type: "n8n-nodes-base.stickyNote",
        position: [minX, minY - 100], // Position above the nodes
        parameters: {
          content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${phaseConfig.description}`,
          height: unifiedHeight,
          width: maxX - minX,
          color: phaseConfig.color,
        },
      };
      
      stickyNotes.push(stickyNote);
      
      // Update current X for next phase
      currentX = maxX + LAYOUT_CONFIG.spacing.phaseGap;
    }
    
    return stickyNotes;
  }

}