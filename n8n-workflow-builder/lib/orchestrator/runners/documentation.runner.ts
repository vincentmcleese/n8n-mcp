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
import { OperationLogger } from "@/lib/orchestrator/utils/OperationLogger";

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
    
    // ====================================================================
    // Set up token tracking for this phase
    // ====================================================================
    const operationLogger = new OperationLogger(sessionId, 'documentation');
    const { logger: _logger, onTokenUsage } = operationLogger.withTokenTracking();
    
    // Connect token callback to Claude service (if using Claude for documentation)
    if (this.deps.claudeService?.setOnUsageCallback) {
      this.deps.claudeService.setOnUsageCallback(onTokenUsage);
    }
    
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
      let phaseOrder: PhaseName[] | undefined;
      
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
        const result = this.mapBuildPhasesToPhaseGroups(buildPhases, validatedWorkflow);
        phaseGroups = result.groups;
        phaseDescriptions = result.descriptions;
        phaseOrder = result.phaseOrder;
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
        phaseDescriptions,
        phaseOrder
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
  }>, workflow: any): { groups: PhaseGroups; descriptions: Map<string, string>; phaseOrder: PhaseName[] } {
    const phaseGroups: PhaseGroups = {
      triggers: [],
      inputs: [],
      transforms: [],
      decision: [],
      aggregation: [],
      storage: [],
      integration: [],
      outputs: [],
      finalization: [],
    };
    
    // Store descriptions from build phases
    const descriptions = new Map<string, string>();
    
    // Track the order of phases as they appear in build phases
    const phaseOrder: PhaseName[] = [];
    
    // Map build phase types to documentation phase categories
    const phaseTypeMapping: Record<string, keyof PhaseGroups> = {
      'trigger': 'triggers',
      'data_collection': 'inputs',
      'data_processing': 'transforms',
      'decision': 'decision',
      'aggregation': 'aggregation',
      'notification': 'outputs',
      'storage': 'storage',
      'integration': 'integration',
      'error_handling': 'transforms',
    };
    
    for (const phase of buildPhases) {
      const targetPhase = phaseTypeMapping[phase.type];
      if (targetPhase && phase.nodeIds) {
        // Add all node IDs from this build phase to the appropriate documentation phase
        phaseGroups[targetPhase].push(...phase.nodeIds);
        
        // Track the order of phases as they appear
        if (!phaseOrder.includes(targetPhase)) {
          phaseOrder.push(targetPhase);
        }
        
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
        if (!phaseOrder.includes('transforms')) {
          phaseOrder.push('transforms');
        }
        if (phase.description && !descriptions.has('transforms')) {
          descriptions.set('transforms', phase.description);
        }
      }
    }
    
    // Remove duplicates (in case a node appears in multiple build phases)
    for (const key of Object.keys(phaseGroups) as Array<keyof PhaseGroups>) {
      phaseGroups[key] = [...new Set(phaseGroups[key])];
    }
    
    // AUTOMATIC FINALIZATION DETECTION
    // Find nodes that receive input from output phase nodes
    const outputNodeIds = new Set(phaseGroups.outputs);
    const nodesToMove: string[] = [];
    
    // Create a map of node IDs to names for connection lookup
    const nodeIdToName = new Map<string, string>();
    const nodeNameToId = new Map<string, string>();
    for (const node of workflow.nodes) {
      nodeIdToName.set(node.id, node.name);
      nodeNameToId.set(node.name, node.id);
    }
    
    // Check connections to find nodes receiving from outputs
    if (workflow.connections) {
      for (const [nodeName, connections] of Object.entries(workflow.connections)) {
        const nodeId = nodeNameToId.get(nodeName);
        
        if (nodeId && outputNodeIds.has(nodeId)) {
          // This is an output node, check what it connects to
          const mainConnections = (connections as any).main;
          if (mainConnections && Array.isArray(mainConnections)) {
            for (const connectionGroup of mainConnections) {
              if (Array.isArray(connectionGroup)) {
                for (const connection of connectionGroup) {
                  const targetNodeId = nodeNameToId.get(connection.node);
                  if (targetNodeId && !outputNodeIds.has(targetNodeId)) {
                    // This node receives from output but isn't an output itself
                    nodesToMove.push(targetNodeId);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Move nodes to finalization phase
    if (nodesToMove.length > 0) {
      const uniqueNodesToMove = [...new Set(nodesToMove)];
      
      // Remove these nodes from their current phases
      for (const key of Object.keys(phaseGroups) as Array<keyof PhaseGroups>) {
        if (key !== 'finalization') {
          phaseGroups[key] = phaseGroups[key].filter(id => !uniqueNodesToMove.includes(id));
        }
      }
      
      // Add them to finalization
      phaseGroups.finalization.push(...uniqueNodesToMove);
      
      // Add a description for finalization if we have nodes there
      if (!descriptions.has('finalization') && phaseGroups.finalization.length > 0) {
        descriptions.set('finalization', 'Post-output processing and aggregation');
      }
      
      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Moved ${uniqueNodesToMove.length} nodes to finalization phase: ${uniqueNodesToMove.join(', ')}`
      );
    }
    
    return { groups: phaseGroups, descriptions, phaseOrder };
  }

  /**
   * Generate phase-based sticky notes for visual workflow organization
   */
  private generatePhaseStickyNotes(
    phaseGroups: PhaseGroups,
    nodes: WorkflowNode[],
    unifiedHeight: number,
    phaseDescriptions?: Map<string, string>,
    dynamicPhaseOrder?: PhaseName[]
  ): WorkflowNode[] {
    const stickyNotes: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    
    // Calculate global minimum Y across ALL nodes for unified top alignment
    const allYPositions = nodes.map((n) => n.position[1]);
    const globalMinY = allYPositions.length > 0 ? Math.min(...allYPositions) : 300;
    
    // Calculate unified top position for ALL sticky notes
    // Provide adequate space above the topmost node for descriptions
    const stickyTopY = globalMinY - LAYOUT_CONFIG.spacing.stickyPadding - LAYOUT_CONFIG.spacing.stickyTopSpacing;
    
    // Calculate cumulative X position for each phase
    let currentX = 480; // Starting X position (leave space for promo sticky on the left)
    
    // Use dynamic phase order if provided, otherwise use default
    const phaseOrder = dynamicPhaseOrder || ["triggers", "inputs", "transforms", "decision", "aggregation", "storage", "integration", "outputs", "finalization"];
    
    for (const phase of phaseOrder) {
      const nodeIds = phaseGroups[phase];
      if (nodeIds.length === 0) continue;
      
      const phaseConfig = PHASE_DEFINITIONS[phase];
      
      // Get nodes in this phase
      const phaseNodes = nodeIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is WorkflowNode => n !== undefined);
      
      if (phaseNodes.length === 0) continue;
      
      // Calculate phase width based on nodes within this phase
      const xPositions = phaseNodes.map((n) => n.position[0]);
      const nodeMinX = Math.min(...xPositions);
      const nodeMaxX = Math.max(...xPositions);
      
      // Calculate sticky width to cover all nodes in this phase with padding
      // Minimum width of 310px for readability
      const stickyWidth = Math.max(
        310,
        (nodeMaxX - nodeMinX) + LAYOUT_CONFIG.dimensions.nodeWidth + (LAYOUT_CONFIG.spacing.stickyPadding * 2)
      );
      
      // Use description from build phase if available, otherwise use default
      const description = phaseDescriptions?.get(phase) || phaseConfig.description;
      
      // Create sticky note for this phase using cumulative X position
      const stickyNote: WorkflowNode = {
        id: `sticky_${phase}_${Date.now()}`,
        name: `${phaseConfig.name} Notes`,
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [currentX, stickyTopY], // Use cumulative X position, not node position
        parameters: {
          content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${description}`,
          height: unifiedHeight,
          width: stickyWidth,
          color: phaseConfig.color,
        },
      };
      
      stickyNotes.push(stickyNote);
      
      // Update current X for next phase
      currentX = currentX + stickyWidth + LAYOUT_CONFIG.spacing.phaseGap;
    }
    
    // Add promotional sticky note to the LEFT of all workflow content as the last step
    // Calculate leftmost workflow position
    const allNodeXPositions = nodes.map((n) => n.position[0]);
    const workflowMinX = allNodeXPositions.length > 0 ? Math.min(...allNodeXPositions) : 250;
    
    // Position promo sticky well to the left with extra spacing (at least 150px gap)
    const promoX = workflowMinX - 150 - 280; // 150px gap + sticky width
    
    const promoStickyNote: WorkflowNode = {
      id: `sticky_promo_${Date.now()}`,
      name: "Ghost Team Promo",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [Math.max(100, promoX), stickyTopY], // Same Y as other stickies, but well to the left
      parameters: {
        content: `## 🚀 Grow your AI business\n\nNeed help in implementing this workflow for your business? Join the Ghost Team community.\n\nThis workflow is made with 💚 by Ghost Team.`,
        height: unifiedHeight,
        width: 280, // Fixed width for promotional sticky
        color: 4, // Green color
      },
    };
    stickyNotes.push(promoStickyNote);
    
    return stickyNotes;
  }

}