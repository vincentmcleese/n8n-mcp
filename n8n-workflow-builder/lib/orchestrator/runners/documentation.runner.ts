// lib/orchestrator/runners/documentation.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  DocumentationInput,
  DocumentationOutput,
  DocumentationRunnerDeps,
} from "@/lib/orchestrator/contracts/documentation.types";
import { WorkflowOperation } from "@/types/workflow";

/**
 * Runner for the documentation phase
 * Handles adding sticky notes to document the workflow
 */
export class DocumentationRunner implements PhaseRunner<DocumentationInput, DocumentationOutput> {
  constructor(private deps: DocumentationRunnerDeps) {}

  /**
   * Run the documentation phase
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

      this.deps.loggers.orchestrator.debug("Starting documentation phase...");
      
      const operations: WorkflowOperation[] = [];
      
      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'documentation' });

      // Extract minimal node metadata for Claude
      const nodeMetadata = this.extractNodeMetadata(validatedWorkflow);
      this.deps.loggers.orchestrator.debug("Node metadata for documentation:", JSON.stringify(nodeMetadata, null, 2));

      // Get user prompt from session
      let userPrompt = "";
      const session = await this.deps.sessionRepo.load(sessionId);
      if (session) {
        userPrompt = session.state.userPrompt || "Create a workflow";
      } else {
        // If no session found, use the workflow name as context
        userPrompt = validatedWorkflow.name || "Create a workflow";
        this.deps.loggers.orchestrator.debug("No session found, using workflow name as context");
      }

      // Have Claude generate sticky notes
      const claudeResult = await this.deps.claudeService.execute(
        {
          workflow: validatedWorkflow,
          nodeMetadata,
          userPrompt,
        },
        { sessionId }
      );
      
      if (!claudeResult.success || !claudeResult.data) {
        throw new Error('Failed to generate documentation');
      }
      const claudeResponse = claudeResult.data;

      // Apply sticky note operations
      let documentedWorkflow = validatedWorkflow;
      if (claudeResponse.operations && claudeResponse.operations.length > 0) {
        documentedWorkflow = this.applyFixes(
          validatedWorkflow,
          claudeResponse.operations
        );

        // Calculate sticky note positions
        documentedWorkflow = this.positionStickyNotes(documentedWorkflow);
      }

      this.deps.loggers.orchestrator.debug(
        `Added ${claudeResponse.operations?.length || 0} sticky notes`
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
        stickyNotesAdded: claudeResponse.operations?.length || 0,
        reasoning: claudeResponse.reasoning,
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
   * Extract minimal node metadata for documentation
   */
  private extractNodeMetadata(workflow: any): any {
    const nodeGroups = this.identifyNodeGroups(workflow);
    
    return {
      nodeGroups: nodeGroups.map(group => ({
        nodeIds: group.nodeIds,
        purpose: group.nodes.map((n: any) => `${n.name} (${n.type})`).join(" → "),
        dataFlow: this.describeDataFlow(group, workflow.connections),
      })),
      totalNodes: workflow.nodes.length,
      workflowPurpose: workflow.name,
    };
  }

  /**
   * Identify logical groups of connected nodes
   */
  private identifyNodeGroups(workflow: any): any[] {
    const groups: any[] = [];
    const visited = new Set<string>();

    // Simple grouping by direct connections
    for (const node of workflow.nodes) {
      if (visited.has(node.id) || node.type === "n8n-nodes-base.stickyNote") {
        continue;
      }

      const group = {
        nodeIds: [node.id],
        nodes: [node],
      };

      // Find all nodes connected to this one
      const queue = [node.id];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        // Check outgoing connections
        if (workflow.connections[currentId]) {
          for (const connection of workflow.connections[currentId].main[0] || []) {
            if (!visited.has(connection.node)) {
              const connectedNode = workflow.nodes.find((n: any) => n.id === connection.node);
              if (connectedNode && connectedNode.type !== "n8n-nodes-base.stickyNote") {
                group.nodeIds.push(connection.node);
                group.nodes.push(connectedNode);
                visited.add(connection.node);
                queue.push(connection.node);
              }
            }
          }
        }
        
        // Check incoming connections
        for (const [nodeId, connections] of Object.entries(workflow.connections)) {
          if ((connections as any).main?.[0]) {
            for (const connection of (connections as any).main[0]) {
              if (connection.node === currentId && !visited.has(nodeId)) {
                const connectedNode = workflow.nodes.find((n: any) => n.id === nodeId);
                if (connectedNode && connectedNode.type !== "n8n-nodes-base.stickyNote") {
                  group.nodeIds.push(nodeId);
                  group.nodes.push(connectedNode);
                  visited.add(nodeId);
                  queue.push(nodeId);
                }
              }
            }
          }
        }
      }

      visited.add(node.id);
      if (group.nodes.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Describe the data flow in a node group
   */
  private describeDataFlow(group: any, connections: any): string {
    // Find the starting node (no incoming connections from within the group)
    const startNodes = group.nodes.filter((node: any) => {
      const hasIncomingFromGroup = Object.entries(connections).some(([fromId, conns]: any) => {
        return group.nodeIds.includes(fromId) && 
               conns.main?.[0]?.some((c: any) => c.node === node.id);
      });
      return !hasIncomingFromGroup;
    });

    if (startNodes.length === 0) return "Circular flow";
    
    // Simple description based on node types
    const nodeTypes = group.nodes.map((n: any) => {
      const type = n.type.split('.').pop();
      return type.charAt(0).toUpperCase() + type.slice(1);
    });

    return nodeTypes.join(" → ");
  }

  /**
   * Position sticky notes relative to node groups
   */
  private positionStickyNotes(workflow: any): any {
    const stickyNotes = workflow.nodes.filter(
      (n: any) => n.type === "n8n-nodes-base.stickyNote"
    );

    for (const sticky of stickyNotes) {
      // Extract node group IDs from the sticky note's temporary property
      const nodeGroupIds = sticky._nodeGroupIds || [];
      
      if (nodeGroupIds.length > 0) {
        // Find the nodes in this group
        const groupNodes = workflow.nodes.filter((n: any) => 
          nodeGroupIds.includes(n.id) && n.type !== "n8n-nodes-base.stickyNote"
        );

        if (groupNodes.length > 0) {
          // Calculate bounding box of the node group
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          
          for (const node of groupNodes) {
            if (node.position) {
              minX = Math.min(minX, node.position[0]);
              minY = Math.min(minY, node.position[1]);
              maxX = Math.max(maxX, node.position[0]);
              maxY = Math.max(maxY, node.position[1]);
            }
          }

          // Position sticky note above the group
          sticky.position = [
            minX,
            minY - 200, // 200px above the group
          ];

          // Adjust size based on group width
          const groupWidth = maxX - minX + 250; // Add node width
          sticky.parameters.width = Math.max(250, Math.min(groupWidth, 400));
        }
      }
      
      // Clean up temporary property
      delete sticky._nodeGroupIds;
    }

    return workflow;
  }

  /**
   * Apply fix operations to workflow
   * This is a simplified version that only handles sticky note operations
   */
  private applyFixes(workflow: any, fixes: any[]): any {
    // Deep clone workflow to avoid mutations
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));

    for (const fix of fixes) {
      if (fix.type === "addStickyNote") {
        // Add sticky note to workflow
        const stickyNode = {
          id: fix.note.id,
          name: `Sticky Note ${fix.note.id}`,
          type: "n8n-nodes-base.stickyNote",
          typeVersion: 1,
          position: [0, 0], // Will be calculated by positioning algorithm
          parameters: {
            content: fix.note.content,
            height: 150,
            width: 250,
            color: fix.note.color || 1
          },
          // Store nodeGroupIds at node level for positioning (will be removed later)
          _nodeGroupIds: fix.note.nodeGroupIds
        };
        updatedWorkflow.nodes.push(stickyNode);
        this.deps.loggers.orchestrator.debug(
          `Added sticky note ${fix.note.id} for nodes: ${fix.note.nodeGroupIds.join(", ")}`
        );
      }
    }

    return updatedWorkflow;
  }
}