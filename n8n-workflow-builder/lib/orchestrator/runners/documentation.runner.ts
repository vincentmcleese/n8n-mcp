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

      // Group nodes by phase using build phase data if available, otherwise fall back to detection
      let phaseGroups: PhaseGroups;
      let phaseDescriptions: Map<string, string> = new Map();
      
      // Load build phases from session state if available
      const session = await this.deps.sessionRepo.load(sessionId);
      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Session loaded, checking for buildPhases...`
      );
      
      const buildPhases = session?.state?.buildPhases;
      
      if (buildPhases && Array.isArray(buildPhases)) {
        this.deps.loggers.orchestrator.info(
          `📊 DOCUMENTATION: Found ${buildPhases.length} phases from build phase in session state`
        );
        this.deps.loggers.orchestrator.info(
          `📊 DOCUMENTATION: Build phases content:`, JSON.stringify(buildPhases, null, 2)
        );
        const result = this.mapBuildPhasesToPhaseGroups(buildPhases);
        phaseGroups = result.groups;
        phaseDescriptions = result.descriptions;
      } else {
        this.deps.loggers.orchestrator.warn(
          `⚠️ DOCUMENTATION: No build phases in session state! buildPhases = ${buildPhases}`
        );
        this.deps.loggers.orchestrator.warn(
          `⚠️ DOCUMENTATION: Session state keys:`, session?.state ? Object.keys(session.state) : 'No session state'
        );
        this.deps.loggers.orchestrator.info(
          `📊 DOCUMENTATION: Falling back to node category detection`
        );
        phaseGroups = detectActivePhases(validatedWorkflow.nodes);
      }
      
      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Final phase groups:`, JSON.stringify(phaseGroups, null, 2)
      );

      // Generate layout hints
      const layoutHints = generateLayoutHints(phaseGroups, validatedWorkflow.nodes);
      this.deps.loggers.orchestrator.debug("Layout hints:", layoutHints);

      // Calculate unified height for all sticky notes
      const unifiedHeight = calculateUnifiedHeight(phaseGroups, validatedWorkflow.nodes);
      this.deps.loggers.orchestrator.debug(`Unified sticky height: ${unifiedHeight}px`);

      // Generate phase-based sticky notes using visual layout system
      const stickyNotes = this.generatePhaseStickyNotes(
        phaseGroups,
        validatedWorkflow.nodes,
        unifiedHeight,
        phaseDescriptions
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
   * Map build phases to phase groups for documentation
   */
  private mapBuildPhasesToPhaseGroups(buildPhases: Array<{
    type: string;
    description: string;
    nodeIds: string[];
  }>): { groups: PhaseGroups; descriptions: Map<string, string> } {
    const phaseGroups: PhaseGroups = {
      triggers: [],
      inputs: [],
      transforms: [],
      outputs: [],
    };
    
    // Store descriptions from build phases
    const descriptions = new Map<string, string>();
    
    // Map build phase types to documentation phase categories
    const phaseTypeMapping: Record<string, keyof PhaseGroups> = {
      'trigger': 'triggers',
      'data_collection': 'inputs',
      'data_processing': 'transforms',
      'notification': 'outputs',
      'storage': 'outputs',
      'integration': 'outputs',
      'error_handling': 'transforms',
    };
    
    for (const phase of buildPhases) {
      const targetPhase = phaseTypeMapping[phase.type];
      if (targetPhase && phase.nodeIds) {
        // Add all node IDs from this build phase to the appropriate documentation phase
        phaseGroups[targetPhase].push(...phase.nodeIds);
        
        // Store the description for this phase
        if (phase.description && !descriptions.has(targetPhase)) {
          descriptions.set(targetPhase, phase.description);
        } else if (phase.description && descriptions.has(targetPhase)) {
          // Append additional descriptions if multiple build phases map to same documentation phase
          const existing = descriptions.get(targetPhase);
          descriptions.set(targetPhase, `${existing}\n\n${phase.description}`);
        }
      } else {
        // Default unmapped phases to transforms
        this.deps.loggers.orchestrator.debug(`Unmapped phase type: ${phase.type}, defaulting to transforms`);
        phaseGroups.transforms.push(...(phase.nodeIds || []));
        if (phase.description && !descriptions.has('transforms')) {
          descriptions.set('transforms', phase.description);
        }
      }
    }
    
    // Remove duplicates (in case a node appears in multiple build phases)
    for (const key of Object.keys(phaseGroups) as Array<keyof PhaseGroups>) {
      phaseGroups[key] = [...new Set(phaseGroups[key])];
    }
    
    return { groups: phaseGroups, descriptions };
  }

  /**
   * Generate phase-based sticky notes for visual workflow organization
   */
  private generatePhaseStickyNotes(
    phaseGroups: PhaseGroups,
    nodes: WorkflowNode[],
    unifiedHeight: number,
    phaseDescriptions?: Map<string, string>
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
      
      // Position sticky note to start above the topmost node with proper padding
      // The sticky note should cover from above the nodes to below them
      const minY = Math.min(...yPositions) - LAYOUT_CONFIG.spacing.stickyPadding - 100; // Start 100px + padding above the topmost node
      
      // Use description from build phase if available, otherwise use default
      const description = phaseDescriptions?.get(phase) || phaseConfig.description;
      
      // Create sticky note for this phase
      const stickyNote: WorkflowNode = {
        id: `sticky_${phase}_${Date.now()}`,
        name: `${phaseConfig.name} Notes`,
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [minX, minY], // Position to cover nodes with padding above and below
        parameters: {
          content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${description}`,
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