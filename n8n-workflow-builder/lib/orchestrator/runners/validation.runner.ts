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
        "Starting entity-based validation phase..."
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

        // Step 2: Extract affected entities
        const { affectedNodes, needsConnectionFix } = this.extractAffectedEntities(
          allErrors, 
          currentWorkflow
        );

        // Step 3: Prepare entities for Claude
        const entities: any = {};
        
        if (affectedNodes.size > 0) {
          entities.nodes = Array.from(affectedNodes.values());
          this.deps.loggers.orchestrator.debug(
            `Sending ${entities.nodes.length} nodes to Claude for fixing`
          );
        }
        
        if (needsConnectionFix) {
          entities.connections = currentWorkflow.connections;
          this.deps.loggers.orchestrator.debug(
            `Sending entire connections object to Claude for fixing`
          );
        }

        // Step 4: Get fixed entities from Claude
        this.deps.loggers.orchestrator.debug(
          "Requesting entity fixes from Claude..."
        );

        const fixResult = await this.deps.claudeService.generateEntityFixes({
          errors: allErrors,
          entities,
          workflow: currentWorkflow
        });
        
        if (!fixResult.success || !fixResult.data) {
          throw new Error('Failed to generate entity fixes');
        }
        
        const { fixedNodes, fixedConnections, reasoning } = fixResult.data;

        if (!fixedNodes && !fixedConnections) {
          this.deps.loggers.orchestrator.debug("Claude could not generate fixes");
          break;
        }

        this.deps.loggers.orchestrator.info(
          `\n   🤖 Claude Entity Fixes (Attempt ${attempts}/${MAX_ATTEMPTS}):`
        );
        
        // Log Claude's reasoning if available
        if (reasoning && reasoning.length > 0) {
          this.deps.loggers.orchestrator.info(
            `      Reasoning: ${reasoning.join('; ')}`
          );
        }
        
        if (fixedNodes && fixedNodes.length > 0) {
          this.deps.loggers.orchestrator.info(
            `      Fixed ${fixedNodes.length} nodes`
          );
        }
        
        if (fixedConnections) {
          this.deps.loggers.orchestrator.info(
            `      Replaced entire connections object`
          );
        }

        // Step 5: Apply entity replacements
        currentWorkflow = this.applyEntityFixes(currentWorkflow, {
          fixedNodes,
          fixedConnections
        });

        // Track fixes in report
        const fixDescription = [];
        if (fixedNodes) {
          fixDescription.push(`Replaced ${fixedNodes.length} nodes`);
        }
        if (fixedConnections) {
          fixDescription.push(`Replaced connections object`);
        }
        
        validationReport.fixesApplied.push({
          type: 'entity-replacement',
          attempt: attempts,
          timestamp: new Date().toISOString(),
          description: fixDescription.join(', '),
          reasoning: reasoning || [],
          entitiesFixed: {
            nodes: fixedNodes?.map((n: any) => n.id),
            connections: !!fixedConnections
          }
        });
        
        // Log operations for tracking
        if (fixedNodes) {
          for (const node of fixedNodes) {
            operations.push({
              type: "validateNode" as const,
              nodeId: node.id,
              result: {
                valid: false, // Still needs re-validation
                errors: [`Node replaced entirely`],
              },
              timestamp: new Date().toISOString(),
              attempt: attempts,
              reasoning: `Node replaced to fix validation errors`,
            });
          }
        }
        
        this.deps.loggers.orchestrator.debug(
          `Applied entity replacements: ${fixDescription.join(', ')}`
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
   * Extract affected entities from validation errors
   */
  private extractAffectedEntities(errors: any[], workflow: any): {
    affectedNodes: Map<string, any>;
    needsConnectionFix: boolean;
  } {
    const affectedNodes = new Map<string, any>();
    let needsConnectionFix = false;
    
    for (const error of errors) {
      const errorMsg = typeof error === 'string' ? error : error.message || '';
      
      // Check if error is about connections
      if (errorMsg.includes('Connection') || 
          errorMsg.includes('connection') ||
          errorMsg.includes('uses node ID') ||
          errorMsg.includes('instead of node name')) {
        needsConnectionFix = true;
      }
      
      // Check if error is node-specific
      const nodeId = error.node || error.nodeId;
      const nodeName = error.nodeName;
      
      if (nodeId && nodeId !== 'workflow') {
        // Find node by ID or name
        const node = workflow.nodes?.find((n: any) => 
          n.id === nodeId || n.name === nodeId || n.name === nodeName
        );
        if (node && !affectedNodes.has(node.id)) {
          affectedNodes.set(node.id, node);
        }
      }
      
      // Also check if error message mentions a specific node
      if (errorMsg) {
        // Try to extract node name from error message
        const nodeNameMatch = errorMsg.match(/node ["']([^"']+)["']/i);
        if (nodeNameMatch) {
          const nodeName = nodeNameMatch[1];
          const node = workflow.nodes?.find((n: any) => 
            n.name === nodeName || n.id === nodeName
          );
          if (node && !affectedNodes.has(node.id)) {
            affectedNodes.set(node.id, node);
          }
        }
      }
    }
    
    return { affectedNodes, needsConnectionFix };
  }

  /**
   * Apply entity fixes by replacing entire nodes/connections
   */
  private applyEntityFixes(workflow: any, fixes: {
    fixedNodes?: any[];
    fixedConnections?: any;
  }): any {
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
    
    // Replace entire nodes
    if (fixes.fixedNodes) {
      for (const fixedNode of fixes.fixedNodes) {
        const index = updatedWorkflow.nodes.findIndex(
          (n: any) => n.id === fixedNode.id
        );
        if (index !== -1) {
          updatedWorkflow.nodes[index] = fixedNode;
          this.deps.loggers.orchestrator.debug(
            `Replaced entire node ${fixedNode.id} (${fixedNode.name})`
          );
        } else {
          // If node doesn't exist, add it
          updatedWorkflow.nodes.push(fixedNode);
          this.deps.loggers.orchestrator.debug(
            `Added new node ${fixedNode.id} (${fixedNode.name})`
          );
        }
      }
    }
    
    // Replace entire connections object
    if (fixes.fixedConnections) {
      updatedWorkflow.connections = fixes.fixedConnections;
      this.deps.loggers.orchestrator.debug(
        `Replaced entire connections object`
      );
    }
    
    return updatedWorkflow;
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

}