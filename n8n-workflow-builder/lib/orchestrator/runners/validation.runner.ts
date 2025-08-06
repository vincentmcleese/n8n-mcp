// lib/orchestrator/runners/validation.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  ValidationInput,
  ValidationOutput,
  ValidationRunnerDeps,
} from "@/lib/orchestrator/contracts/validation.types";
import { WorkflowOperation } from "@/types/workflow";

/**
 * Runner for the validation phase
 * Handles workflow validation and auto-fixing
 */
export class ValidationRunner implements PhaseRunner<ValidationInput, ValidationOutput> {
  constructor(private deps: ValidationRunnerDeps) {}

  /**
   * Run the validation phase
   */
  async run(input: ValidationInput): Promise<ValidationOutput> {
    const { sessionId, buildingResult } = input;
    
    try {
      // Get draft workflow from building phase
      let draftWorkflow: any = null;
      
      // If building result is provided (for tests), use it directly
      if (buildingResult?.workflow) {
        draftWorkflow = buildingResult.workflow;
        this.deps.loggers.orchestrator.debug(`Using provided draft workflow`);
      } else {
        // Get from database session
        const session = await this.deps.sessionRepo.load(sessionId);
        if (session?.state?.workflow) {
          draftWorkflow = session.state.workflow;
        }
      }

      // Validate we have a draft workflow
      if (!draftWorkflow) {
        return {
          success: false,
          phase: "validation",
          workflow: { name: "", nodes: [], connections: {}, settings: {} },
          validationReport: {},
          operations: [],
          error: {
            type: "validation",
            code: "NO_DRAFT_WORKFLOW",
            message: "No draft workflow found",
            userMessage: "Please complete building phase first",
            retryable: false,
          },
        };
      }

      this.deps.loggers.orchestrator.debug(
        "Starting delta-based validation phase..."
      );
      this.deps.loggers.orchestrator.debug(
        `Validating workflow with ${
          draftWorkflow.nodes?.length || 0
        } nodes`
      );

      let currentWorkflow = JSON.parse(JSON.stringify(draftWorkflow));
      const validationReport: any = {
        initial: null,
        fixesApplied: [],
        final: null,
        attempts: 0,
      };
      
      const operations: WorkflowOperation[] = [];
      
      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'validation' });

      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let allValid = false;

      while (attempts < MAX_ATTEMPTS && !allValid) {
        attempts++;
        this.deps.loggers.orchestrator.debug(
          `Validation attempt ${attempts}/${MAX_ATTEMPTS}`
        );

        // Step 1: Run all MCP validations
        const validationResults = await this.runValidations(currentWorkflow);

        // Store initial validation results
        if (attempts === 1) {
          validationReport.initial = validationResults;
        }

        // Extract all errors
        const allErrors = [
          ...(validationResults.workflow?.errors || []),
          ...(validationResults.connections?.errors || []),
          ...(validationResults.expressions?.errors || []),
        ];

        this.deps.loggers.orchestrator.debug(
          `Found ${allErrors.length} validation errors`
        );
        
        // Log detailed errors
        if (allErrors.length > 0) {
          this.deps.loggers.orchestrator.info(
            `\n   🔍 Validation Errors (Attempt ${attempts}/${MAX_ATTEMPTS}):`
          );
          allErrors.forEach((error, index) => {
            const errorMsg = typeof error === 'string' ? error : 
                           error.message || JSON.stringify(error);
            const nodeInfo = error.node || error.nodeId ? 
                           ` [Node: ${error.node || error.nodeId}]` : '';
            this.deps.loggers.orchestrator.info(
              `      ${index + 1}. ${errorMsg}${nodeInfo}`
            );
          });
        }

        // Create validateNode operations for each node with errors
        const nodeErrorMap = new Map<string, string[]>();
        
        // Group errors by node
        for (const error of allErrors) {
          // Extract node ID from error - errors typically have a node property or mention node ID in message
          let nodeId = error.node || error.nodeId;
          
          // If no direct node ID, try to extract from message
          if (!nodeId && error.message) {
            const nodeMatch = error.message.match(/node[:\s]+["']?([^"'\s]+)["']?/i);
            if (nodeMatch) {
              nodeId = nodeMatch[1];
            }
          }
          
          if (nodeId) {
            if (!nodeErrorMap.has(nodeId)) {
              nodeErrorMap.set(nodeId, []);
            }
            nodeErrorMap.get(nodeId)!.push(error.message || String(error));
          } else {
            // Workflow-level error without specific node
            if (!nodeErrorMap.has('workflow')) {
              nodeErrorMap.set('workflow', []);
            }
            nodeErrorMap.get('workflow')!.push(error.message || String(error));
          }
        }
        
        // Create validateNode operations for each node with errors
        for (const [nodeId, errors] of nodeErrorMap) {
          const validationOp = {
            type: "validateNode" as const,
            nodeId: nodeId,
            result: {
              valid: false,
              errors: errors,
            },
            timestamp: new Date().toISOString(),
            attempt: attempts,
            reasoning: `Validation errors detected: ${errors.join('; ')}`,
          };
          
          operations.push(validationOp);
          
          this.deps.loggers.orchestrator.debug(
            `Validation failed for ${nodeId === 'workflow' ? 'workflow' : `node ${nodeId}`}: ${errors.join(', ')}`
          );
        }

        if (allErrors.length === 0) {
          allValid = true;
          validationReport.final = validationResults;
          
          // Log successful validation for all nodes
          for (const node of currentWorkflow.nodes || []) {
            operations.push({
              type: "validateNode" as const,
              nodeId: node.id,
              result: {
                valid: true,
                errors: [],
              },
              timestamp: new Date().toISOString(),
              attempt: attempts,
              reasoning: "Node passed all validation checks",
            });
          }
          
          this.deps.loggers.orchestrator.info(
            `\n   ✅ Validation Successful after ${attempts} attempt${attempts > 1 ? 's' : ''}`
          );
          
          break;
        }

        // Step 2: Send only errors to Claude for fixes
        this.deps.loggers.orchestrator.debug(
          "Sending errors to Claude for fix generation..."
        );

        const fixResult = await this.deps.claudeService.generateValidationFixes({
          errors: allErrors,
          workflow: currentWorkflow
        });
        
        if (!fixResult.success || !fixResult.data) {
          throw new Error('Failed to generate validation fixes');
        }
        const fixResponse = fixResult.data;
        
        const fixes = Array.isArray(fixResponse) ? fixResponse : fixResponse.fixes || [];
        const reasoning = !Array.isArray(fixResponse) && fixResponse.reasoning ? 
                        fixResponse.reasoning : [];

        if (!fixes || fixes.length === 0) {
          this.deps.loggers.orchestrator.debug("Claude could not generate fixes");
          break;
        }

        this.deps.loggers.orchestrator.info(
          `\n   🤖 Claude Analysis & Fixes (Attempt ${attempts}/${MAX_ATTEMPTS}):`
        );
        
        // Log Claude's reasoning if available
        if (reasoning && reasoning.length > 0) {
          this.deps.loggers.orchestrator.info(
            `      Reasoning: ${reasoning.join('; ')}`
          );
        }
        
        this.deps.loggers.orchestrator.info(
          `      Generated ${fixes.length} fix operations:`
        );
        
        // Log each fix with details
        fixes.forEach((fix: any, index: number) => {
          const fixDescription = this.describeFix(fix);
          this.deps.loggers.orchestrator.info(
            `      ${index + 1}. ${fixDescription}`
          );
        });

        // Step 3: Apply fixes to workflow
        currentWorkflow = this.applyFixes(currentWorkflow, fixes);

        // Track fixes in report with reasoning
        validationReport.fixesApplied.push(
          ...fixes.map((fix: any, index: number) => ({
            ...fix,
            attempt: attempts,
            timestamp: new Date().toISOString(),
            reasoning: reasoning?.[index] || this.describeFix(fix),
            description: this.describeFix(fix),
          }))
        );
        
        // Log fix operations for affected nodes
        const fixedNodeIds = new Set<string>();
        for (const fix of fixes) {
          if (fix.nodeId) {
            fixedNodeIds.add(fix.nodeId);
          }
        }
        
        // Create validation operations showing fixes were applied
        for (const nodeId of fixedNodeIds) {
          const fixesForNode = fixes.filter((f: any) => f.nodeId === nodeId);
          const fixDescriptions = fixesForNode.map((f: any) => this.describeFix(f));
          
          operations.push({
            type: "validateNode" as const,
            nodeId: nodeId,
            result: {
              valid: false, // Still needs re-validation
              errors: [`Applied fixes: ${fixDescriptions.join('; ')}`],
            },
            timestamp: new Date().toISOString(),
            attempt: attempts,
            reasoning: `Applied ${fixesForNode.length} fixes to resolve validation errors`,
            fixes: fixesForNode,
          });
        }
        
        this.deps.loggers.orchestrator.debug(
          `Applied ${fixes.length} fixes to ${fixedNodeIds.size} nodes`
        );
      }

      // Final validation
      if (!allValid) {
        const finalValidation = await this.runValidations(currentWorkflow);
        validationReport.final = finalValidation;
      }

      validationReport.attempts = attempts;

      // Mark workflow as valid if all validations pass
      currentWorkflow.valid = allValid;

      this.deps.loggers.orchestrator.debug(
        `Validation completed after ${attempts} attempts`
      );
      this.deps.loggers.orchestrator.debug(
        `Workflow is ${
          allValid ? "valid" : "still invalid"
        }`
      );

      if (validationReport.fixesApplied.length > 0) {
        this.deps.loggers.orchestrator.info(
          `\n   📊 Validation Summary:`
        );
        this.deps.loggers.orchestrator.info(
          `      Total fixes applied: ${validationReport.fixesApplied.length}`
        );
        this.deps.loggers.orchestrator.info(
          `      Validation attempts: ${attempts}/${MAX_ATTEMPTS}`
        );
        this.deps.loggers.orchestrator.info(
          `      Final status: ${allValid ? '✅ Valid' : '⚠️ Still has issues'}`
        );
        
        if (!allValid && validationReport.final) {
          const remainingErrors = [
            ...(validationReport.final.workflow?.errors || []),
            ...(validationReport.final.connections?.errors || []),
            ...(validationReport.final.expressions?.errors || []),
          ];
          if (remainingErrors.length > 0) {
            this.deps.loggers.orchestrator.info(
              `      Remaining issues: ${remainingErrors.length}`
            );
            remainingErrors.slice(0, 3).forEach((error, i) => {
              const errorMsg = typeof error === 'string' ? error : 
                             error.message || JSON.stringify(error);
              this.deps.loggers.orchestrator.info(
                `         ${i + 1}. ${errorMsg}`
              );
            });
            if (remainingErrors.length > 3) {
              this.deps.loggers.orchestrator.info(
                `         ... and ${remainingErrors.length - 3} more`
              );
            }
          }
        }
      }

      // Save the validated workflow to state
      operations.push({ 
        type: 'setWorkflow', 
        workflow: currentWorkflow
      } as WorkflowOperation);

      // Add phase completion operation if successful
      if (allValid) {
        operations.push({ type: 'completePhase', phase: 'validation' });
      }
      
      // Persist operations before forcing save
      if (operations.length > 0) {
        await this.deps.sessionRepo.persistOperations(sessionId, operations);
      }

      // Force save at phase completion
      await this.deps.sessionRepo.save(sessionId);

      // Use empty reasoning array - Claude doesn't provide reasoning for validation fixes
      // The validation report itself contains all the details about what was validated and fixed
      const reasoning: string[] = [];

      return {
        success: true,
        phase: "validation",
        workflow: currentWorkflow,
        validationReport,
        operations,
        reasoning,
      };
    } catch (error) {
      // Record error in Supabase
      await this.deps.sessionRepo.recordError(sessionId, error, "validation");
      
      return {
        success: false,
        phase: "validation",
        workflow: { name: "", nodes: [], connections: {}, settings: {} },
        validationReport: {},
        operations: [],
        error: {
          type: "claude_api",
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to validate workflow",
          retryable: true,
        },
      };
    }
  }

  /**
   * Run MCP validation tools directly
   */
  private async runValidations(workflow: any): Promise<{
    workflow: any;
    connections: any;
    expressions: any;
  }> {
    const results = {
      workflow: null as any,
      connections: null as any,
      expressions: null as any,
    };

    try {
      this.deps.loggers.orchestrator.debug(
        "Running comprehensive workflow validation..."
      );

      // The MCP validate_workflow tool performs all three types of validation
      const validationResult = await this.deps.nodeContextService.validateWorkflow(workflow, {
        validateNodes: true,
        validateConnections: true,
        validateExpressions: true,
        profile: "runtime", // Use runtime profile for production validation
      });

      this.deps.loggers.orchestrator.debug("Validation result structure:", {
        valid: validationResult.valid,
        errorCount: validationResult.errors?.length || 0,
        warningCount: validationResult.warnings?.length || 0,
        hasStatistics: !!validationResult.statistics,
        errorSample: validationResult.errors?.[0],
      });

      // The validate_workflow tool returns a comprehensive result
      // We need to categorize errors by type
      const allErrors = validationResult.errors || [];
      const allWarnings = validationResult.warnings || [];

      // Categorize errors for our report structure
      // The errors have a complex structure with node and message fields
      results.workflow = {
        errors: allErrors, // Keep all errors for now - they'll all be sent to Claude
        warnings: allWarnings,
        valid: validationResult.valid,
        statistics: validationResult.statistics || validationResult.summary,
      };

      // For delta-based validation, we don't need to categorize errors
      // We'll send all errors to Claude and let it figure out the fixes
      results.connections = {
        errors: [],
        warnings: [],
      };

      results.expressions = {
        errors: [],
        warnings: [],
      };
    } catch (error) {
      this.deps.loggers.orchestrator.error(
        "Workflow validation failed:",
        error
      );
      // Return empty results on error
      results.workflow = { errors: [], warnings: [], valid: false };
      results.connections = { errors: [], warnings: [] };
      results.expressions = { errors: [], warnings: [] };
    }

    return results;
  }

  /**
   * Apply fix operations to workflow
   */
  /**
   * Describe a fix operation in human-readable format
   */
  private describeFix(fix: any): string {
    switch (fix.type) {
      case 'updateField':
      case 'updateParameter':
        return `Update ${fix.field || fix.parameter} on ${fix.nodeId} to ${JSON.stringify(fix.value)}`;
      case 'addField':
        return `Add ${fix.field} to ${fix.nodeId} with value ${JSON.stringify(fix.value)}`;
      case 'removeField':
        return `Remove ${fix.field} from ${fix.nodeId}`;
      case 'addConnection':
        return `Add connection from ${fix.from} to ${fix.to}`;
      case 'removeConnection':
        return `Remove connection from ${fix.from} to ${fix.to}`;
      case 'addNode':
        return `Add new node ${fix.node?.name || fix.node?.id || 'unknown'}`;
      case 'updateNode':
        return `Update entire node ${fix.nodeId}`;
      case 'updateWorkflowSettings':
        return `Update workflow settings`;
      case 'setWorkflowName':
        return `Set workflow name to "${fix.name}"`;
      default:
        return `${fix.type} operation on ${fix.nodeId || 'workflow'}`;
    }
  }
  
  private applyFixes(workflow: any, fixes: any[]): any {
    // Deep clone workflow to avoid mutations
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));

    this.deps.loggers.orchestrator.debug(`Applying ${fixes.length} fixes`);

    // Define node-level properties that should not go into parameters
    const NODE_LEVEL_PROPERTIES = [
      "type",  // Critical: node type must be at node level
      "typeVersion",  // Also important for node versioning
      "name",
      "position",
      "disabled",
      "notes",
      "retryOnFail",
      "maxTries",
      "waitBetweenTries",
      "continueOnFail",
      "alwaysOutputData",  // Always output data even on failure
      "executeOnce",  // Execute node only once
      "onError",  // Error handling strategy
      "credentials",  // Node credentials configuration
      "issues",  // Node validation issues
      "color",
      "webhookId",
      "externalHooks",
      "notesInFlow",
    ];

    for (const fix of fixes) {
      const nodeId = fix.nodeId;

      switch (fix.type) {
        case "updateParameter":
          // Update node parameter
          const node = updatedWorkflow.nodes.find((n: any) => n.id === nodeId);
          if (node) {
            // Check if this should be a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.parameter)) {
              // Set at node level
              node[fix.parameter] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Applied node-level fix for node ${nodeId}: ${fix.parameter} = ${JSON.stringify(fix.value)}`
              );
            } else {
              // Ensure parameters object exists
              if (!node.parameters) node.parameters = {};
              // Set in parameters
              node.parameters[fix.parameter] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Applied parameter fix for node ${nodeId}: ${fix.parameter} = ${JSON.stringify(fix.value)}`
              );
            }
          } else {
            this.deps.loggers.orchestrator.warn(
              `Node ${nodeId} not found for parameter update`
            );
          }
          break;

        case "updateField":
          // Update node field (similar to updateParameter but uses 'field' property)
          const nodeForField = updatedWorkflow.nodes.find((n: any) => n.id === nodeId);
          if (nodeForField) {
            // Check if this should be a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Set at node level
              nodeForField[fix.field] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Applied node-level fix for node ${nodeId}: ${fix.field} = ${JSON.stringify(fix.value)}`
              );
            } else {
              // Ensure parameters object exists
              if (!nodeForField.parameters) nodeForField.parameters = {};
              // Set in parameters
              nodeForField.parameters[fix.field] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Applied parameter fix for node ${nodeId}: ${fix.field} = ${JSON.stringify(fix.value)}`
              );
            }
          } else {
            this.deps.loggers.orchestrator.warn(
              `Node ${nodeId} not found for field update`
            );
          }
          break;

        case "addField":
          // Add a field to a node
          const nodeForAdd = updatedWorkflow.nodes.find((n: any) => n.id === nodeId);
          if (nodeForAdd) {
            // Check if this should be a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Set at node level
              nodeForAdd[fix.field] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Added node-level field for node ${nodeId}: ${fix.field} = ${JSON.stringify(fix.value)}`
              );
            } else {
              // Ensure parameters object exists
              if (!nodeForAdd.parameters) nodeForAdd.parameters = {};
              // Set in parameters
              nodeForAdd.parameters[fix.field] = fix.value;
              this.deps.loggers.orchestrator.debug(
                `Added parameter field for node ${nodeId}: ${fix.field} = ${JSON.stringify(fix.value)}`
              );
            }
          } else {
            this.deps.loggers.orchestrator.warn(
              `Node ${nodeId} not found for field addition`
            );
          }
          break;

        case "removeField":
          // Remove a field from a node
          const nodeForRemove = updatedWorkflow.nodes.find((n: any) => n.id === nodeId);
          if (nodeForRemove) {
            // Check if this is a node-level property
            if (NODE_LEVEL_PROPERTIES.includes(fix.field)) {
              // Remove from node level
              delete nodeForRemove[fix.field];
              this.deps.loggers.orchestrator.debug(
                `Removed node-level field from node ${nodeId}: ${fix.field}`
              );
            } else if (nodeForRemove.parameters) {
              // Remove from parameters
              delete nodeForRemove.parameters[fix.field];
              this.deps.loggers.orchestrator.debug(
                `Removed parameter field from node ${nodeId}: ${fix.field}`
              );
            }
          } else {
            this.deps.loggers.orchestrator.warn(
              `Node ${nodeId} not found for field removal`
            );
          }
          break;

        case "updateNode":
          // Update entire node
          const existingNodeIndex = updatedWorkflow.nodes.findIndex(
            (n: any) => n.id === nodeId
          );
          if (existingNodeIndex !== -1) {
            updatedWorkflow.nodes[existingNodeIndex] = fix.node;
            this.deps.loggers.orchestrator.debug(
              `Updated entire node ${nodeId}`
            );
          }
          break;

        case "addConnection":
          // Add connection between nodes
          if (!updatedWorkflow.connections[fix.from]) {
            updatedWorkflow.connections[fix.from] = { main: [[]] };
          }
          // Check if connection already exists
          const existingConnection = updatedWorkflow.connections[
            fix.from
          ].main[0].find((c: any) => c.node === fix.to);
          if (!existingConnection) {
            updatedWorkflow.connections[fix.from].main[0].push({
              node: fix.to,
              type: "main",
              index: 0,
            });
            this.deps.loggers.orchestrator.debug(
              `Added connection from ${fix.from} to ${fix.to}`
            );
          } else {
            this.deps.loggers.orchestrator.debug(
              `Connection from ${fix.from} to ${fix.to} already exists, skipping`
            );
          }
          break;

        case "removeConnection":
          // Remove connection
          if (updatedWorkflow.connections[fix.from]) {
            updatedWorkflow.connections[fix.from].main[0] =
              updatedWorkflow.connections[fix.from].main[0].filter(
                (c: any) => c.node !== fix.to
              );
          }
          break;

        case "addNode":
          // Add new node
          updatedWorkflow.nodes.push(fix.node);
          break;

        case "updateWorkflowSettings":
          // Update workflow-level settings
          if (!updatedWorkflow.settings) updatedWorkflow.settings = {};
          Object.assign(updatedWorkflow.settings, fix.settings);
          break;

        case "setWorkflowName":
          updatedWorkflow.name = fix.name;
          break;

        case "addStickyNote":
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
          break;
      }
    }

    // Clean up empty connections
    for (const nodeId in updatedWorkflow.connections) {
      if (updatedWorkflow.connections[nodeId].main[0].length === 0) {
        delete updatedWorkflow.connections[nodeId];
        this.deps.loggers.orchestrator.debug(
          `Removed empty connection for ${nodeId}`
        );
      }
    }

    // Clean up node-level properties that might be in parameters
    for (const node of updatedWorkflow.nodes) {
      if (node.parameters) {
        for (const prop of NODE_LEVEL_PROPERTIES) {
          if (prop in node.parameters) {
            // Move to node level if not already there
            if (!(prop in node)) {
              node[prop] = node.parameters[prop];
            }
            // Remove from parameters
            delete node.parameters[prop];
            this.deps.loggers.orchestrator.debug(
              `Cleaned up ${prop} from parameters of node ${node.id} (${node.name})`
            );
          }
        }
      }
    }

    return updatedWorkflow;
  }
}