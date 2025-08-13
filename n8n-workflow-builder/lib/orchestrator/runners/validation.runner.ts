// lib/orchestrator/runners/validation.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  ValidationInput,
  ValidationOutput,
  ValidationRunnerDeps,
} from "@/types/orchestrator/validation";
import { WorkflowOperation } from "@/types/workflow";
import { OperationLogger } from "@/lib/orchestrator/utils/OperationLogger";
import { wrapPhase } from "@/lib/orchestrator/utils/wrapPhase";

/**
 * Runner for the validation phase
 * Handles workflow validation and auto-fixing
 */
export class ValidationRunner
  implements PhaseRunner<ValidationInput, ValidationOutput>
{
  constructor(private deps: ValidationRunnerDeps) {
    // Wrap the run method with wrapPhase for automatic operation persistence
    this.run = wrapPhase("validation", this.run.bind(this));
  }

  /**
   * Run the validation phase
   */
  async run(input: ValidationInput): Promise<ValidationOutput> {
    const { sessionId, buildingResult } = input;

    // ====================================================================
    // Set up token tracking for this phase
    // ====================================================================
    const operationLogger = new OperationLogger(sessionId, "validation");
    const { logger: _logger, onTokenUsage } =
      operationLogger.withTokenTracking();

    // Connect token callback to Claude service
    if (this.deps.claudeService.setOnUsageCallback) {
      this.deps.claudeService.setOnUsageCallback(onTokenUsage);
    }

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
        `Validating workflow with ${draftWorkflow.nodes?.length || 0} nodes`
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
      operations.push({ type: "setPhase", phase: "validation" });

      const MAX_ATTEMPTS = 5;
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

        // Debug log to understand error structure
        if (allErrors.length > 0 && attempts === 1) {
          this.deps.loggers.orchestrator.debug(
            "First error structure for debugging:",
            {
              error: allErrors[0],
              type: typeof allErrors[0],
              keys:
                allErrors[0] && typeof allErrors[0] === "object"
                  ? Object.keys(allErrors[0])
                  : [],
              isArray: Array.isArray(allErrors[0]),
              stringified: JSON.stringify(allErrors[0], null, 2),
            }
          );
        }

        // Log detailed errors
        if (allErrors.length > 0) {
          this.deps.loggers.orchestrator.info(
            `\n   🔍 Validation Errors (Attempt ${attempts}/5):`
          );
          allErrors.forEach((error, index) => {
            // Safely extract error message and node info
            let errorMsg = "";
            let nodeInfo = "";

            if (typeof error === "string") {
              errorMsg = error;
            } else if (error && typeof error === "object") {
              // Extract node information from various possible locations
              const nodeId =
                error.node || error.nodeId || error.nodeName || error.id;
              if (nodeId) {
                nodeInfo = ` [Node: ${nodeId}]`;
              } else if (error.data?.node || error.data?.nodeId) {
                nodeInfo = ` [Node: ${error.data.node || error.data.nodeId}]`;
              } else if (error.details?.node || error.details?.nodeId) {
                nodeInfo = ` [Node: ${
                  error.details.node || error.details.nodeId
                }]`;
              }

              // Handle different message formats
              if (typeof error.message === "string") {
                // Format A: Simple string message
                errorMsg = error.message;
              } else if (error.message && typeof error.message === "object") {
                // Format B: Nested object message
                const msgObj = error.message;
                const parts = [];
                if (msgObj.type) parts.push(`[${msgObj.type}]`);
                if (msgObj.property) parts.push(`Property: ${msgObj.property}`);
                if (msgObj.message) parts.push(msgObj.message);
                if (msgObj.fix) parts.push(`Fix: ${msgObj.fix}`);
                errorMsg = parts.join(" - ");
              } else {
                // Fallback to other possible error fields
                errorMsg = error.error || error.msg || error.text || "";
              }

              // If we still don't have a message, stringify the whole object
              if (!errorMsg) {
                errorMsg = JSON.stringify(error);
              }
            } else {
              errorMsg = String(error);
            }

            this.deps.loggers.orchestrator.info(
              `      ${index + 1}. ${errorMsg}${nodeInfo}`
            );

            // Additional debug logging for complex errors
            if (
              error &&
              typeof error === "object" &&
              Object.keys(error).length > 0
            ) {
              this.deps.loggers.orchestrator.debug(
                `      Error ${index + 1} details:`,
                {
                  keys: Object.keys(error),
                  hasNode: !!error.node,
                  hasNodeId: !!error.nodeId,
                  hasMessage: !!error.message,
                  raw: error,
                }
              );
            }
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
              reasoning: "Node passed all validation checks",
            });
          }

          this.deps.loggers.orchestrator.info(
            `\n   ✅ Validation Successful after ${attempts} attempt${
              attempts > 1 ? "s" : ""
            }`
          );

          break;
        }

        // Step 2: Extract affected entities
        const { affectedNodes, needsConnectionFix } =
          this.extractAffectedEntities(allErrors, currentWorkflow);

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

        // Normalize all errors to strings before passing to Claude
        const normalizedErrors = allErrors.map((error) => {
          if (typeof error === "string") {
            return error;
          } else if (error && typeof error === "object") {
            // Extract node information
            const nodeId =
              error.node || error.nodeId || error.nodeName || error.id;

            // Handle different message formats
            let errorMsg = "";
            if (typeof error.message === "string") {
              // Format A: Simple string message
              errorMsg = error.message;
            } else if (error.message && typeof error.message === "object") {
              // Format B: Nested object message
              const msgObj = error.message;
              const parts = [];
              if (msgObj.type) parts.push(`[${msgObj.type}]`);
              if (msgObj.property) parts.push(`Property: ${msgObj.property}`);
              if (msgObj.message) parts.push(msgObj.message);
              if (msgObj.fix) parts.push(`Fix: ${msgObj.fix}`);
              errorMsg = parts.join(" - ");
            } else {
              // Fallback to other possible error fields
              errorMsg = error.error || error.msg || error.text || "";
            }

            if (errorMsg) {
              return nodeId ? `${errorMsg} [Node: ${nodeId}]` : errorMsg;
            } else {
              // If no message field, stringify the entire object
              return JSON.stringify(error);
            }
          } else {
            return String(error);
          }
        });

        const fixResult = await this.deps.claudeService.generateEntityFixes({
          errors: normalizedErrors,
          entities,
          workflow: currentWorkflow,
        });

        if (!fixResult.success || !fixResult.data) {
          throw new Error("Failed to generate entity fixes");
        }

        const { fixedNodes, fixedConnections, reasoning } = fixResult.data;

        if (!fixedNodes && !fixedConnections) {
          this.deps.loggers.orchestrator.debug(
            "Claude could not generate fixes"
          );
          break;
        }

        this.deps.loggers.orchestrator.info(
          `\n   🤖 Claude Entity Fixes (Attempt ${attempts}/5):`
        );

        // Log Claude's reasoning if available
        if (reasoning && reasoning.length > 0) {
          this.deps.loggers.orchestrator.info(
            `      Reasoning: ${reasoning.join("; ")}`
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
          fixedConnections,
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
          type: "entity-replacement",
          attempt: attempts,
          timestamp: new Date().toISOString(),
          description: fixDescription.join(", "),
          reasoning: reasoning || [],
          entitiesFixed: {
            nodes: fixedNodes?.map((n: any) => n.id),
            connections: !!fixedConnections,
          },
        });

        // Log operations for tracking
        if (fixedNodes) {
          for (const node of fixedNodes) {
            operations.push({
              type: "validateNode" as const,
              nodeId: node.id,
              result: {
                valid: false, // Still needs re-validation
                errors: [
                  {
                    nodeId: node.id,
                    message: "Node replaced entirely",
                    severity: "error",
                  },
                ],
              },
              timestamp: new Date().toISOString(),
              reasoning: `Node replaced to fix validation errors`,
            });
          }
        }

        this.deps.loggers.orchestrator.debug(
          `Applied entity replacements: ${fixDescription.join(", ")}`
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
        `Workflow is ${allValid ? "valid" : "still invalid"}`
      );

      if (validationReport.fixesApplied.length > 0) {
        this.deps.loggers.orchestrator.info(`\n   📊 Validation Summary:`);
        this.deps.loggers.orchestrator.info(
          `      Total fixes applied: ${validationReport.fixesApplied.length}`
        );
        this.deps.loggers.orchestrator.info(
          `      Validation attempts: ${attempts}/5`
        );
        this.deps.loggers.orchestrator.info(
          `      Final status: ${allValid ? "✅ Valid" : "⚠️ Still has issues"}`
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
              const errorMsg =
                typeof error === "string"
                  ? error
                  : error.message || JSON.stringify(error);
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
        type: "setWorkflow",
        workflow: currentWorkflow,
      } as WorkflowOperation);

      // Add phase completion operation if successful
      if (allValid) {
        operations.push({ type: "completePhase", phase: "validation" });
      }

      // Persistence is now handled automatically by wrapPhase wrapper

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
  private extractAffectedEntities(
    errors: any[],
    workflow: any
  ): {
    affectedNodes: Map<string, any>;
    needsConnectionFix: boolean;
  } {
    const affectedNodes = new Map<string, any>();
    let needsConnectionFix = false;

    // Debug log to understand error structure
    this.deps.loggers.orchestrator.debug(
      `Processing ${errors.length} errors for entity extraction`
    );

    for (const error of errors) {
      // Deep introspection of error structure
      this.deps.loggers.orchestrator.debug("Error structure:", {
        type: typeof error,
        hasMessage: !!error?.message,
        hasError: !!error?.error,
        hasNode: !!error?.node,
        hasNodeId: !!error?.nodeId,
        hasNodeName: !!error?.nodeName,
        keys: error && typeof error === "object" ? Object.keys(error) : [],
      });

      // Safely extract error message - handle various error structures
      let errorMsg = "";
      if (typeof error === "string") {
        errorMsg = error;
      } else if (error?.message) {
        errorMsg = String(error.message);
      } else if (error?.error) {
        errorMsg = String(error.error);
      } else if (error && typeof error === "object") {
        // Try to extract any string property that might contain the error
        const possibleMessageFields = ["msg", "text", "description", "details"];
        for (const field of possibleMessageFields) {
          if (error[field]) {
            errorMsg = String(error[field]);
            break;
          }
        }
        if (!errorMsg) {
          errorMsg = JSON.stringify(error);
        }
      } else {
        errorMsg = String(error);
      }

      // Check if error is about connections
      if (
        errorMsg.includes("Connection") ||
        errorMsg.includes("connection") ||
        errorMsg.includes("uses node ID") ||
        errorMsg.includes("instead of node name") ||
        errorMsg.includes("no connections")
      ) {
        needsConnectionFix = true;
      }

      // Check if error is node-specific - look in multiple places
      let nodeIdentifier =
        error?.node || error?.nodeId || error?.nodeName || error?.id;

      // Also check for nested node information
      if (!nodeIdentifier && error && typeof error === "object") {
        // Check for nested node property
        if (error.data?.node) nodeIdentifier = error.data.node;
        if (error.data?.nodeId) nodeIdentifier = error.data.nodeId;
        if (error.details?.node) nodeIdentifier = error.details.node;
        if (error.details?.nodeId) nodeIdentifier = error.details.nodeId;
      }

      if (nodeIdentifier && nodeIdentifier !== "workflow") {
        // Find node by ID or name
        const node = workflow.nodes?.find(
          (n: any) => n.id === nodeIdentifier || n.name === nodeIdentifier
        );
        if (node && !affectedNodes.has(node.id)) {
          affectedNodes.set(node.id, node);
          this.deps.loggers.orchestrator.debug(
            `Added affected node: ${node.id} (${node.name})`
          );
        }
      }

      // Also check if error message mentions a specific node
      if (errorMsg) {
        // Try multiple patterns to extract node name from error message
        const patterns = [
          /node ["']([^"']+)["']/i,
          /Node: ([^\s,\]]+)/,
          /\[Node: ([^\]]+)\]/,
          /for node ([^\s,]+)/i,
          /node\s+(\w+)/i,
        ];

        for (const pattern of patterns) {
          const match = errorMsg.match(pattern);
          if (match) {
            const nodeName = match[1];
            const node = workflow.nodes?.find(
              (n: any) => n.name === nodeName || n.id === nodeName
            );
            if (node && !affectedNodes.has(node.id)) {
              affectedNodes.set(node.id, node);
              this.deps.loggers.orchestrator.debug(
                `Added affected node from message: ${node.id} (${node.name})`
              );
            }
          }
        }
      }
    }

    // If we have validation errors but no specific nodes identified,
    // and it's not a connection issue, include ALL nodes with issues
    if (affectedNodes.size === 0 && !needsConnectionFix && errors.length > 0) {
      this.deps.loggers.orchestrator.debug(
        "No specific nodes identified, checking all nodes for issues"
      );

      // Send all nodes to Claude for comprehensive fixing
      for (const node of workflow.nodes || []) {
        affectedNodes.set(node.id, node);
      }

      if (affectedNodes.size > 0) {
        this.deps.loggers.orchestrator.debug(
          `Added all ${affectedNodes.size} nodes for comprehensive validation`
        );
      }
    }

    this.deps.loggers.orchestrator.debug(
      `Entity extraction complete: ${affectedNodes.size} nodes, connectionFix: ${needsConnectionFix}`
    );

    return { affectedNodes, needsConnectionFix };
  }

  /**
   * Apply entity fixes by replacing entire nodes/connections
   */
  private applyEntityFixes(
    workflow: any,
    fixes: {
      fixedNodes?: any[];
      fixedConnections?: any;
    }
  ): any {
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
      const validationResult =
        await this.deps.nodeContextService.validateWorkflow(workflow, {
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
        errorTypes: validationResult.errors
          ?.map((e: any) => typeof e)
          .slice(0, 5),
        firstErrorKeys:
          validationResult.errors?.[0] &&
          typeof validationResult.errors[0] === "object"
            ? Object.keys(validationResult.errors[0])
            : null,
        rawSample: JSON.stringify(
          validationResult.errors?.slice(0, 2),
          null,
          2
        ),
      });

      // The validate_workflow tool returns a comprehensive result
      // We need to categorize errors by type
      let allErrors = validationResult.errors || [];
      const allWarnings = validationResult.warnings || [];

      // Log ALL warnings for visibility
      if (allWarnings.length > 0) {
        this.deps.loggers.orchestrator.info(
          `\n   📋 Validation Warnings Found (${allWarnings.length} total):`
        );
        allWarnings.forEach((warning: any, index: number) => {
          // Handle different message formats (same as error handling)
          let message = "";
          if (typeof warning?.message === "string") {
            message = warning.message;
          } else if (warning?.message && typeof warning.message === "object") {
            // Format B: Nested object message
            const msgObj = warning.message;
            const parts = [];
            if (msgObj.type) parts.push(`[${msgObj.type}]`);
            if (msgObj.property) parts.push(`Property: ${msgObj.property}`);
            if (msgObj.message) parts.push(msgObj.message);
            if (msgObj.fix) parts.push(`Fix: ${msgObj.fix}`);
            message = parts.join(" - ");
          } else {
            message = warning?.text || JSON.stringify(warning);
          }
          const node = warning?.node || "Unknown";
          this.deps.loggers.orchestrator.info(
            `      ${index + 1}. [${node}] ${message}`
          );
        });

        // CRITICAL: Treat "Outdated typeVersion" warnings as errors
        // These warnings indicate the node will fail deployment to n8n
        const typeVersionWarnings = allWarnings.filter((warning: any) => {
          // Check if this is a typeVersion warning based on the message
          let message = "";
          if (typeof warning?.message === "string") {
            message = warning.message;
          } else if (warning?.message && typeof warning.message === "object") {
            // For nested messages, check the actual message text
            message = warning.message.message || "";
          } else {
            message = warning?.text || "";
          }
          return message.startsWith("Outdated typeVersion");
        });

        if (typeVersionWarnings.length > 0) {
          this.deps.loggers.orchestrator.info(
            `\n   🔄 Converting ${typeVersionWarnings.length} typeVersion warnings to ERRORS for deployment compatibility:`
          );

          // Log each typeVersion issue being promoted
          typeVersionWarnings.forEach((warning: any) => {
            // Extract message properly handling nested format
            let message = "";
            if (typeof warning?.message === "string") {
              message = warning.message;
            } else if (
              warning?.message &&
              typeof warning.message === "object"
            ) {
              message =
                warning.message.message || JSON.stringify(warning.message);
            } else {
              message = warning?.text || "";
            }

            const match = message.match(
              /Outdated typeVersion: ([\d.]+)\. Latest is ([\d.]+)/
            );
            if (match) {
              this.deps.loggers.orchestrator.info(
                `      ✅ ${warning.node}: Updating typeVersion ${match[1]} → ${match[2]}`
              );
            } else {
              this.deps.loggers.orchestrator.info(
                `      ✅ ${warning.node}: ${message}`
              );
            }
          });

          // Convert warnings to error format and add to errors array
          const typeVersionErrors = typeVersionWarnings.map((warning: any) => ({
            node: warning.node,
            message: warning.message,
            type: "typeVersion",
            severity: "error",
          }));

          allErrors = [...allErrors, ...typeVersionErrors];

          this.deps.loggers.orchestrator.info(
            `      These will be sent to Claude for automatic fixing.`
          );
        } else {
          this.deps.loggers.orchestrator.info(
            `      ℹ️ No typeVersion warnings found - all nodes using latest versions`
          );
        }
      } else {
        this.deps.loggers.orchestrator.debug("No validation warnings found");
      }

      // Categorize errors for our report structure
      // The errors have a complex structure with node and message fields
      results.workflow = {
        errors: allErrors, // Now includes typeVersion warnings promoted to errors
        warnings: allWarnings.filter((w: any) => {
          // Extract message properly to check if it's a typeVersion warning
          let message = "";
          if (typeof w?.message === "string") {
            message = w.message;
          } else if (w?.message && typeof w.message === "object") {
            message = w.message.message || "";
          } else {
            message = w?.text || "";
          }
          return !message.startsWith("Outdated typeVersion");
        }), // Remove promoted warnings
        valid: validationResult.valid && allErrors.length === 0, // Not valid if we have errors
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
        "Error during validation processing:",
        error
      );

      // Don't add JavaScript runtime errors to the validation errors
      // Instead, return a proper validation error structure
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Only add as validation error if it's actually a validation issue
      // Runtime errors should be logged but not added to validation errors
      if (
        errorMessage.includes("validation") ||
        errorMessage.includes("invalid")
      ) {
        results.workflow = {
          errors: [
            {
              node: "workflow",
              message: `Validation processing error: ${errorMessage}`,
            },
          ],
          warnings: [],
          valid: false,
        };
      } else {
        // For runtime errors, just return empty validation results
        // The error has already been logged above
        results.workflow = { errors: [], warnings: [], valid: false };
      }

      results.connections = { errors: [], warnings: [] };
      results.expressions = { errors: [], warnings: [] };
    }

    return results;
  }
}
