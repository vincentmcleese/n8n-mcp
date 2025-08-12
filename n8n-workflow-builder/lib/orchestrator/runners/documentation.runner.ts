// lib/orchestrator/runners/documentation.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  DocumentationInput,
  DocumentationOutput,
  DocumentationRunnerDeps,
} from "@/types/orchestrator/documentation";
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
import { wrapPhase } from "@/lib/orchestrator/utils/wrapPhase";

/**
 * Runner for the documentation phase
 * Creates phase-based sticky notes for visual workflow organization
 * Uses deterministic categorization instead of Claude AI
 */
export class DocumentationRunner
  implements PhaseRunner<DocumentationInput, DocumentationOutput>
{
  constructor(private deps: DocumentationRunnerDeps) {
    // Wrap the run method with wrapPhase for automatic operation persistence
    this.run = wrapPhase("documentation", this.run.bind(this));
  }

  /**
   * Run the documentation phase
   * Groups nodes by phase and creates magazine-quality visual layout
   */
  async run(input: DocumentationInput): Promise<DocumentationOutput> {
    const { sessionId, validationResult } = input;

    // ====================================================================
    // Set up token tracking for this phase
    // ====================================================================
    const operationLogger = new OperationLogger(sessionId, "documentation");
    const { logger: _logger, onTokenUsage } =
      operationLogger.withTokenTracking();

    // No Claude dependency required for documentation in current implementation

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

      this.deps.loggers.orchestrator.debug(
        "Starting documentation phase with visual layout system..."
      );

      const operations: WorkflowOperation[] = [];

      // Add phase transition operation
      operations.push({ type: "setPhase", phase: "documentation" });

      // Group nodes by phase using build phase data if available, otherwise fall back to detection
      let phaseGroups: PhaseGroups;
      let phaseDescriptions: Map<string, string> = new Map();
      let phaseOrder: PhaseName[] | undefined;
      let nodeRowMap: Map<string, number> = new Map();

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
          `📊 DOCUMENTATION: Build phases content:`,
          JSON.stringify(buildPhases, null, 2)
        );
        const result = this.mapBuildPhasesToPhaseGroups(
          buildPhases,
          validatedWorkflow
        );
        phaseGroups = result.groups;
        phaseDescriptions = result.descriptions;
        phaseOrder = result.phaseOrder;
        nodeRowMap = result.nodeRowMap;
      } else {
        this.deps.loggers.orchestrator.warn(
          `⚠️ DOCUMENTATION: No build phases in session state! buildPhases = ${buildPhases}`
        );
        this.deps.loggers.orchestrator.warn(
          `⚠️ DOCUMENTATION: Session state keys:`,
          session?.state ? Object.keys(session.state) : "No session state"
        );
        this.deps.loggers.orchestrator.info(
          `📊 DOCUMENTATION: Falling back to node category detection`
        );
        phaseGroups = detectActivePhases(validatedWorkflow.nodes);
        // Default all nodes to row 1 when no build phases
        for (const node of validatedWorkflow.nodes) {
          nodeRowMap.set(node.id, 1);
        }
      }

      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Final phase groups:`,
        JSON.stringify(phaseGroups, null, 2)
      );

      // Reposition nodes with phase-based spacing for better visual grouping
      const repositionedNodes = this.repositionNodesByPhase(
        phaseGroups,
        validatedWorkflow.nodes,
        phaseOrder || [
          "triggers",
          "inputs",
          "transforms",
          "decision",
          "aggregation",
          "storage",
          "integration",
          "outputs",
          "finalization",
          "error",
        ],
        nodeRowMap,
        validatedWorkflow
      );

      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Repositioned ${repositionedNodes.length} nodes with phase-based spacing`
      );

      // Generate layout hints using repositioned nodes
      const layoutHints = generateLayoutHints(phaseGroups, repositionedNodes);
      this.deps.loggers.orchestrator.debug("Layout hints:", layoutHints);

      // Calculate unified height for all sticky notes using repositioned nodes
      const unifiedHeight = calculateUnifiedHeight(
        phaseGroups,
        repositionedNodes
      );
      this.deps.loggers.orchestrator.debug(
        `Unified sticky height: ${unifiedHeight}px`
      );

      // Generate phase-based sticky notes using repositioned nodes
      const stickyNotes = this.generatePhaseStickyNotes(
        phaseGroups,
        repositionedNodes, // Use repositioned nodes instead of original
        unifiedHeight,
        phaseDescriptions,
        phaseOrder,
        nodeRowMap
      );

      // Add both repositioned nodes and sticky notes to workflow
      let documentedWorkflow = {
        ...validatedWorkflow,
        nodes: [...repositionedNodes, ...stickyNotes],
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
        this.deps.loggers.orchestrator.debug(
          "Sticky notes:",
          actualStickyNotes
        );
      }

      // Save the documented workflow to state
      operations.push({ type: "setWorkflow", workflow: documentedWorkflow });

      // Add phase completion operation
      operations.push({ type: "completePhase", phase: "documentation" });

      // Persistence is now handled automatically by wrapPhase wrapper

      return {
        success: true,
        phase: "documentation",
        workflow: documentedWorkflow,
        operations,
        stickyNotesAdded: stickyNotes.length,
        reasoning: [
          `Created ${
            stickyNotes.length
          } phase-based sticky notes for ${layoutHints.presentPhases.join(
            ", "
          )} phases`,
        ],
      };
    } catch (error) {
      // Record error in Supabase
      await this.deps.sessionRepo.recordError(
        sessionId,
        error,
        "documentation"
      );

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
   * Analyze workflow connections to identify parallel branches (fan-outs)
   * Returns a map of target nodes to their source node
   */
  private analyzeParallelBranches(workflow: any): Map<string, string> {
    const targetToSource = new Map<string, string>();
    
    if (!workflow.connections) return targetToSource;
    
    // Build a map of node names to IDs for lookup
    const nodeNameToId = new Map<string, string>();
    const nodeIdToName = new Map<string, string>();
    for (const node of workflow.nodes) {
      nodeNameToId.set(node.name, node.id);
      nodeIdToName.set(node.id, node.name);
    }
    
    // Analyze connections to find fan-outs
    for (const [sourceName, connections] of Object.entries(workflow.connections)) {
      const sourceId = nodeNameToId.get(sourceName);
      if (!sourceId) continue;
      
      const mainConnections = (connections as any).main;
      if (!mainConnections || !Array.isArray(mainConnections)) continue;
      
      // Check first output slot (most common case)
      const firstOutput = mainConnections[0];
      if (Array.isArray(firstOutput) && firstOutput.length > 1) {
        // This is a fan-out - multiple targets from same source
        for (const connection of firstOutput) {
          const targetId = nodeNameToId.get(connection.node);
          if (targetId) {
            targetToSource.set(targetId, sourceId);
          }
        }
      } else if (Array.isArray(firstOutput) && firstOutput.length === 1) {
        // Single connection
        const targetId = nodeNameToId.get(firstOutput[0].node);
        if (targetId) {
          targetToSource.set(targetId, sourceId);
        }
      }
    }
    
    return targetToSource;
  }

  /**
   * Reposition nodes with phase-based spacing for better visual grouping
   */
  private repositionNodesByPhase(
    phaseGroups: PhaseGroups,
    nodes: WorkflowNode[],
    phaseOrder: PhaseName[],
    nodeRowMap: Map<string, number>,
    workflow?: any
  ): WorkflowNode[] {
    const updatedNodes = [...nodes];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Analyze parallel branches if workflow is provided
    const targetToSource = workflow ? this.analyzeParallelBranches(workflow) : new Map<string, string>();

    // Row spacing configuration
    const ROW_SPACING = 200; // Vertical spacing between workflow rows
    const BASE_Y = 300; // Base Y position for row 1
    const VERTICAL_SPACING = 150; // Spacing between vertically stacked nodes

    // Track X position per row
    const rowXPositions = new Map<number, number>();

    // Ensure space for promotional sticky (280px width + 50px gap + 40px padding + 50px margin + 50px buffer)
    const requiredLeftSpace = 280 + 50 + 40 + 50 + 50; // 470px total to account for sticky positioning
    const startX = Math.max(250, requiredLeftSpace); // Start at 470px to guarantee promo space

    // Initialize X position for each row
    const maxRow = Math.max(...Array.from(nodeRowMap.values()), 1);
    for (let row = 1; row <= maxRow; row++) {
      rowXPositions.set(row, startX);
    }

    console.log("\n🔧 MULTI-ROW PHASE SPACING DEBUG:");
    console.log(`   Starting position: ${startX}px`);
    console.log(
      `   Within-phase spacing: ${LAYOUT_CONFIG.spacing.withinPhase}px`
    );
    console.log(
      `   Between-phase gap: ${LAYOUT_CONFIG.spacing.withinPhase}px (additional)`
    );
    console.log(`   Row spacing: ${ROW_SPACING}px`);
    console.log(`   Max row detected: ${maxRow}`);

    // Process each phase in order
    for (const phase of phaseOrder) {
      const nodeIds = phaseGroups[phase];
      if (nodeIds.length === 0) {
        console.log(`   📂 ${phase.toUpperCase()}: empty, skipping`);
        continue;
      }

      // Group nodes by row within this phase
      const nodesByRow = new Map<number, string[]>();
      for (const nodeId of nodeIds) {
        const row = nodeRowMap.get(nodeId) || 1;
        if (!nodesByRow.has(row)) {
          nodesByRow.set(row, []);
        }
        nodesByRow.get(row)!.push(nodeId);
      }

      console.log(
        `   📂 ${phase.toUpperCase()} phase with ${nodesByRow.size} row(s):`
      );

      // Track the maximum X position across all rows for this phase
      let maxPhaseX = 0;

      // Position nodes in each row for this phase
      for (const [row, rowNodeIds] of nodesByRow) {
        const currentX = rowXPositions.get(row) || startX;
        const phaseStartX = currentX;
        let rowCurrentX = currentX;

        console.log(`     Row ${row} starting at X=${currentX}:`);

        // Group nodes by their source to identify parallel branches
        const nodesBySource = new Map<string | undefined, string[]>();
        for (const nodeId of rowNodeIds) {
          const sourceId = targetToSource.get(nodeId);
          const key = sourceId || nodeId; // Use nodeId as key if no source (e.g., triggers)
          if (!nodesBySource.has(key)) {
            nodesBySource.set(key, []);
          }
          nodesBySource.get(key)!.push(nodeId);
        }

        // Position each group of nodes
        for (const [sourceId, groupNodeIds] of nodesBySource) {
          if (groupNodeIds.length > 1) {
            // Multiple nodes from same source in same phase/row - stack vertically
            console.log(`       Vertical stack from source ${sourceId}:`);
            const baseY = row === 1 ? 250 : BASE_Y + (row - 1) * ROW_SPACING;
            
            groupNodeIds.forEach((nodeId, index) => {
              const originalNode = nodeMap.get(nodeId);
              if (originalNode) {
                const updatedNode = updatedNodes.find((n) => n.id === nodeId);
                if (updatedNode) {
                  const oldPosition = [...updatedNode.position];
                  const newY = baseY + (index * VERTICAL_SPACING);
                  updatedNode.position = [rowCurrentX, newY];
                  console.log(
                    `         ${updatedNode.name}: [${oldPosition[0]},${oldPosition[1]}] → [${rowCurrentX},${newY}] (stacked #${index + 1})`
                  );
                }
              }
            });
            
            // Only advance X once for the entire vertical stack
            rowCurrentX += LAYOUT_CONFIG.spacing.withinPhase;
          } else {
            // Single node - position normally
            const nodeId = groupNodeIds[0];
            const originalNode = nodeMap.get(nodeId);
            if (originalNode) {
              const updatedNode = updatedNodes.find((n) => n.id === nodeId);
              if (updatedNode) {
                const oldPosition = [...updatedNode.position];
                const newY = row === 1 ? BASE_Y : BASE_Y + (row - 1) * ROW_SPACING;
                updatedNode.position = [rowCurrentX, newY];
                console.log(
                  `       ${updatedNode.name}: [${oldPosition[0]},${oldPosition[1]}] → [${rowCurrentX},${newY}] (row ${row})`
                );
                rowCurrentX += LAYOUT_CONFIG.spacing.withinPhase;
              }
            }
          }
        }

        // Update the row's X position
        rowXPositions.set(row, rowCurrentX);
        maxPhaseX = Math.max(maxPhaseX, rowCurrentX);

        const phaseWidth =
          rowCurrentX - phaseStartX - LAYOUT_CONFIG.spacing.withinPhase;
        console.log(
          `     Row ${row} phase spans: ${phaseStartX}px to ${
            rowCurrentX - LAYOUT_CONFIG.spacing.withinPhase
          }px (width: ${phaseWidth}px)`
        );
      }

      // Sync all rows to the same X position after this phase (align phases vertically)
      // Add extra gap between phases
      const nextPhaseX = maxPhaseX + LAYOUT_CONFIG.spacing.withinPhase;
      for (let row = 1; row <= maxRow; row++) {
        rowXPositions.set(row, nextPhaseX);
      }

      console.log(`     Phase complete, all rows advance to X=${nextPhaseX}px`);
    }

    const finalX = Math.max(...Array.from(rowXPositions.values()));
    console.log(`   🏁 Final X position: ${finalX}px`);

    return updatedNodes;
  }

  /**
   * Map build phases to phase groups for documentation
   */
  private mapBuildPhasesToPhaseGroups(
    buildPhases: Array<{
      type: string;
      description: string;
      nodeIds: string[];
      row?: number;
    }>,
    workflow: any
  ): {
    groups: PhaseGroups;
    descriptions: Map<string, string>;
    phaseOrder: PhaseName[];
    nodeRowMap: Map<string, number>;
  } {
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
      error: [],
    };

    // Store descriptions from build phases
    const descriptions = new Map<string, string>();

    // Track the order of phases as they appear in build phases
    const phaseOrder: PhaseName[] = [];

    // Track which row each node belongs to
    const nodeRowMap = new Map<string, number>();

    // Map build phase types to documentation phase categories
    const phaseTypeMapping: Record<string, keyof PhaseGroups> = {
      trigger: "triggers",
      data_collection: "inputs",
      data_processing: "transforms",
      decision: "decision",
      aggregation: "aggregation",
      notification: "outputs",
      storage: "storage",
      integration: "integration",
      error_handling: "error",
    };

    for (const phase of buildPhases) {
      const targetPhase = phaseTypeMapping[phase.type];

      // Track the row for all nodes in this phase
      const row = phase.row || 1; // Default to row 1 if not specified
      if (phase.nodeIds) {
        for (const nodeId of phase.nodeIds) {
          nodeRowMap.set(nodeId, row);
        }
      }

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
        this.deps.loggers.orchestrator.debug(
          `Unmapped phase type: ${phase.type}, defaulting to transforms`
        );
        phaseGroups.transforms.push(...(phase.nodeIds || []));
        if (!phaseOrder.includes("transforms")) {
          phaseOrder.push("transforms");
        }
        if (phase.description && !descriptions.has("transforms")) {
          descriptions.set("transforms", phase.description);
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
      for (const [nodeName, connections] of Object.entries(
        workflow.connections
      )) {
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
        if (key !== "finalization") {
          phaseGroups[key] = phaseGroups[key].filter(
            (id) => !uniqueNodesToMove.includes(id)
          );
        }
      }

      // Add them to finalization
      phaseGroups.finalization.push(...uniqueNodesToMove);

      // Add a description for finalization if we have nodes there
      if (
        !descriptions.has("finalization") &&
        phaseGroups.finalization.length > 0
      ) {
        descriptions.set(
          "finalization",
          "Post-output processing and aggregation"
        );
      }

      this.deps.loggers.orchestrator.info(
        `📊 DOCUMENTATION: Moved ${
          uniqueNodesToMove.length
        } nodes to finalization phase: ${uniqueNodesToMove.join(", ")}`
      );
    }

    return { groups: phaseGroups, descriptions, phaseOrder, nodeRowMap };
  }

  /**
   * Generate phase-based sticky notes for visual workflow organization
   */
  private generatePhaseStickyNotes(
    phaseGroups: PhaseGroups,
    nodes: WorkflowNode[],
    unifiedHeight: number,
    phaseDescriptions?: Map<string, string>,
    dynamicPhaseOrder?: PhaseName[],
    nodeRowMap?: Map<string, number>
  ): WorkflowNode[] {
    const stickyNotes: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Row spacing configuration
    const ROW_SPACING = 200; // Should match the row spacing in repositionNodesByPhase
    const BASE_Y = 300; // Base Y position for row 1

    // Determine the number of rows
    const maxRow = nodeRowMap
      ? Math.max(...Array.from(nodeRowMap.values()), 1)
      : 1;

    // Use dynamic phase order if provided, otherwise use default
    const phaseOrder = dynamicPhaseOrder || [
      "triggers",
      "inputs",
      "transforms",
      "decision",
      "aggregation",
      "storage",
      "integration",
      "outputs",
      "finalization",
      "error",
    ];

    // Calculate global Y bounds across ALL nodes for uniform sticky alignment
    const allNodeYPositions = nodes.map(n => n.position[1]);
    const globalMinY = allNodeYPositions.length > 0 ? Math.min(...allNodeYPositions) : BASE_Y;
    const globalMaxY = allNodeYPositions.length > 0 ? Math.max(...allNodeYPositions) : BASE_Y;
    
    // Calculate uniform sticky position and height for ALL sticky notes
    const uniformStickyTopY = globalMinY - LAYOUT_CONFIG.spacing.stickyPadding - LAYOUT_CONFIG.spacing.stickyTopSpacing;
    const uniformStickyHeight = 
      LAYOUT_CONFIG.spacing.stickyTopSpacing +
      LAYOUT_CONFIG.spacing.stickyPadding +
      (globalMaxY - globalMinY + LAYOUT_CONFIG.dimensions.nodeHeight) +
      LAYOUT_CONFIG.spacing.stickyPadding;
    
    console.log("\n🔧 UNIFORM STICKY DIMENSIONS:");
    console.log(`   Global Y range: ${globalMinY} to ${globalMaxY}`);
    console.log(`   Uniform sticky top Y: ${uniformStickyTopY}`);
    console.log(`   Uniform sticky height: ${uniformStickyHeight}px`);

    // Process sticky notes per phase (not per row) - one sticky spans all rows
    for (const phase of phaseOrder) {
      const nodeIds = phaseGroups[phase];
      if (nodeIds.length === 0) continue;

      const phaseConfig = PHASE_DEFINITIONS[phase];

      // Get all nodes in this phase across ALL rows
      const phaseNodes = nodeIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is WorkflowNode => n !== undefined);

      if (phaseNodes.length === 0) continue;

      // Calculate phase boundaries based on actual node positions
      const xPositions = phaseNodes.map((n) => n.position[0]);
      const yPositions = phaseNodes.map((n) => n.position[1]);
      const nodeMinX = Math.min(...xPositions);
      const nodeMaxX = Math.max(...xPositions);
      const nodeMinY = Math.min(...yPositions);
      const nodeMaxY = Math.max(...yPositions);

      console.log(`\n🔧 STICKY for ${phase.toUpperCase()} phase:`);
      console.log(
        `   Phase nodes: ${phaseNodes
          .map((n) => `${n.name}@[${n.position[0]},${n.position[1]}]`)
          .join(", ")}`
      );
      console.log(`   X range: ${nodeMinX} to ${nodeMaxX}`);
      console.log(`   Y range: ${nodeMinY} to ${nodeMaxY}`);

      // Calculate the actual width of the node cluster
      // The rightmost node's right edge is at nodeMaxX + nodeWidth
      const clusterWidth =
        nodeMaxX - nodeMinX + LAYOUT_CONFIG.dimensions.nodeWidth;

      // Calculate the center point of the node cluster
      const clusterCenterX =
        (nodeMinX + nodeMaxX + LAYOUT_CONFIG.dimensions.nodeWidth) / 2;

      // Add equal padding on both sides for visual centering
      const totalPadding = LAYOUT_CONFIG.spacing.stickyPadding * 2;

      // Calculate sticky width to cover all nodes with equal padding
      // Minimum width of 310px for readability
      const stickyWidth = Math.max(310, clusterWidth + totalPadding);

      // Position sticky note so it's centered on the node cluster
      const stickyX = clusterCenterX - stickyWidth / 2;

      // Use uniform Y position and height for all sticky notes
      console.log(
        `   Sticky position: [${stickyX}, ${uniformStickyTopY}], width: ${stickyWidth}px, height: ${uniformStickyHeight}px`
      );

      // Use description from build phase if available, otherwise use default
      const description =
        phaseDescriptions?.get(phase) || phaseConfig.description;

      // Create sticky note for this phase with uniform height
      const stickyNote: WorkflowNode = {
        id: `sticky_${phase}_${Date.now()}`,
        name: `${phaseConfig.name} Documentation`,
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [stickyX, uniformStickyTopY],
        parameters: {
          content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${description}`,
          height: uniformStickyHeight,
          width: stickyWidth,
          color: phaseConfig.color,
        },
      };

      stickyNotes.push(stickyNote);
    }

    // Add promotional sticky note as a title element - positioned well to the left
    // Find the leftmost sticky note to position the promo to its left
    if (stickyNotes.length > 0) {
      const allStickyXPositions = stickyNotes.map((s) => s.position[0]);
      const leftmostStickyX = Math.min(...allStickyXPositions);
      
      // Use the same uniform Y position as all other stickies

      console.log("\n🔧 PROMOTIONAL STICKY DEBUG:");
      console.log(
        `   All sticky X positions: [${allStickyXPositions.join(", ")}]`
      );
      console.log(`   Leftmost sticky X: ${leftmostStickyX}`);
      console.log(`   Using uniform Y: ${uniformStickyTopY}`);

      // Calculate promo position with safety constraints to prevent overlap
      const promoWidth = 280; // Fixed width for promotional sticky
      const minPromoX = 50; // Minimum X for viewport visibility
      const minGapFromFirstPhase = 50; // Minimum gap to prevent overlap with first phase

      console.log(`   Promo width: ${promoWidth}px`);
      console.log(`   Min promo X: ${minPromoX}px`);
      console.log(`   Min gap from first phase: ${minGapFromFirstPhase}px`);

      // Only add promo if there's enough space to avoid overlap
      // If leftmost sticky is too close to the left edge, skip the promo sticky
      const requiredSpace = promoWidth + minGapFromFirstPhase;
      const availableSpace = leftmostStickyX - minPromoX;

      console.log(
        `   Required space: ${requiredSpace}px (${promoWidth} + ${minGapFromFirstPhase})`
      );
      console.log(
        `   Available space: ${availableSpace}px (${leftmostStickyX} - ${minPromoX})`
      );
      console.log(
        `   Space check: ${
          availableSpace >= requiredSpace ? "✅ PASS" : "❌ FAIL"
        }`
      );

      // Skip promotional sticky if it would overlap
      if (availableSpace < requiredSpace) {
        console.log(`   🚫 SKIPPING promotional sticky - insufficient space!`);
        this.deps.loggers.orchestrator.info(
          `Skipping promotional sticky note - insufficient space (available: ${availableSpace}px, required: ${requiredSpace}px)`
        );
        return stickyNotes; // Return without adding promo
      }

      // Calculate ideal position with larger gap for title-like separation
      const idealPromoGap = 100; // Standard gap for separation
      const promoX = Math.max(
        minPromoX,
        leftmostStickyX - idealPromoGap - promoWidth
      );

      console.log(`   Ideal gap: ${idealPromoGap}px`);
      console.log(`   Calculated promo X: ${promoX}px`);
      console.log(`   Final promo position: [${promoX}, ${uniformStickyTopY}]`);
      console.log(`   ✅ ADDING promotional sticky`);

      const promoStickyNote: WorkflowNode = {
        id: `sticky_promo_${Date.now()}`,
        name: "Workflow Overview",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [promoX, uniformStickyTopY],
        parameters: {
          content: `## 🚀 Grow your AI business\n\nNeed help in implementing this workflow for your business? Join the Ghost Team community.\n\nThis workflow is made with 💚 by Ghost Team.`,
          height: uniformStickyHeight,
          width: promoWidth,
          color: 4, // Green color
        },
      };

      // Add promo sticky as the LAST element (final operation)
      stickyNotes.push(promoStickyNote);
    } else {
      console.log(
        "\n🔧 PROMOTIONAL STICKY: No sticky notes found, skipping promo"
      );
    }

    return stickyNotes;
  }
}
