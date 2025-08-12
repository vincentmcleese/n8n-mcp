// lib/orchestrator/runners/configuration.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  ConfigurationInput,
  ConfigurationOutput,
  ConfiguredNode,
  ConfigurationRunnerDeps,
} from "@/lib/orchestrator/contracts/configuration.types";
import { DiscoveredNode, WorkflowOperation } from "@/types/workflow";
import type { MissingFieldFix } from "@/types/orchestrator/configuration";
import { ConfigurationPromptBuilder } from "@/services/claude/config/prompt-builder";
import { patchRegistry } from "@/lib/orchestrator/patches";
import { OperationLogger } from "@/lib/orchestrator/utils/OperationLogger";
import pLimit from "p-limit";

/**
 * Runner for the configuration phase (OPTIMIZED)
 * Uses node essentials for 95% token reduction
 */
export class ConfigurationRunner implements PhaseRunner<ConfigurationInput, ConfigurationOutput> {
  private promptBuilder: ConfigurationPromptBuilder;
  
  constructor(private deps: ConfigurationRunnerDeps) {
    this.promptBuilder = new ConfigurationPromptBuilder();
  }

  /**
   * Run the configuration phase
   */
  async run(input: ConfigurationInput): Promise<ConfigurationOutput> {
    const { sessionId } = input;
    
    // ====================================================================
    // Set up token tracking for this phase
    // ====================================================================
    const operationLogger = new OperationLogger(sessionId, 'configuration');
    const { logger: _logger, onTokenUsage } = operationLogger.withTokenTracking();
    
    // Connect token callback to Claude service
    if (this.deps.claudeService.setOnUsageCallback) {
      this.deps.claudeService.setOnUsageCallback(onTokenUsage);
    }
    
    try {
      // Get session to build context for configuration
      const { discoveredNodes, userPrompt } =
        await this.getConfigurationContext(sessionId);

      // Validate we have discovered nodes to configure
      if (discoveredNodes.length === 0) {
        return {
          success: false,
          operations: [],
          phase: "configuration",
          configured: [],
          error: {
            type: "validation",
            code: "NO_DISCOVERED_NODES",
            message: "No nodes discovered for configuration",
            userMessage:
              "Please complete discovery phase first to identify workflow nodes",
            retryable: false,
          },
        };
      }

      this.deps.loggers.orchestrator.debug(
        "Starting OPTIMIZED configuration phase with essentials-based approach"
      );

      const configured: ConfiguredNode[] = [];
      const operations: WorkflowOperation[] = [];
      const reasoning: string[] = [];
      
      // Prefetch node essentials for ALL nodes at the start
      const nodeEssentials = await this.prefetchNodeEssentials(discoveredNodes);
      
      // Log that we have the essentials cached in memory
      this.deps.loggers.orchestrator.info(
        `   💾 Cached essentials for ${nodeEssentials.size} nodes in memory`
      );

      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'configuration' });

      // Create concurrency limiter (max 3 parallel configurations for essentials)
      const limit = pLimit(3);
      
      const startTime = Date.now();
      
      // Simply configure ALL discovered nodes - no need to filter by IDs
      // This includes both task nodes and gap nodes
      this.deps.loggers.orchestrator.info(
        `⚙️  Configuring ${discoveredNodes.length} nodes in parallel (max 3 concurrent)`
      );
      this.deps.loggers.orchestrator.debug(
        `Nodes to configure: ${discoveredNodes.map(n => `${n.type} (${n.id})`).join(', ')}`
      );
      
      // Process nodes in parallel with concurrency control
      const configurationTasks = discoveredNodes.map((node, index) => 
        limit(async () => {
          this.deps.loggers.orchestrator.info(
            `   [${index + 1}/${discoveredNodes.length}] Starting configuration for ${node.type} (${node.id})`
          );
          this.deps.loggers.orchestrator.debug(
            `   ${node.type} is ${node.isPreConfigured ? 'a task template' : 'a searched node'}`
          );

          try {
            const result = await this.generateAndValidateNodeConfig(
              node,
              userPrompt,
              sessionId,
              nodeEssentials
            );
            
            // Only show success checkmark if actually valid
            if (result.isValid) {
              this.deps.loggers.orchestrator.info(
                `   ✅ [${index + 1}/${discoveredNodes.length}] Successfully configured ${node.type}`
              );
            } else {
              this.deps.loggers.orchestrator.warn(
                `   ⚠️  [${index + 1}/${discoveredNodes.length}] Completed configuration for ${node.type} with errors`
              );
            }
            
            return {
              node,
              ...result
            };
          } catch (error) {
            this.deps.loggers.orchestrator.error(
              `   ❌ [${index + 1}/${discoveredNodes.length}] Failed to configure ${node.type} (${node.id}):`,
              error
            );
            return {
              node,
              finalConfig: {},
              isValid: false,
              validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
              nodeReasoning: [`Failed to configure ${node.type}: ${error instanceof Error ? error.message : 'Unknown error'}`],
              configOperations: []
            };
          }
        })
      );

      // Wait for all configurations to complete
      this.deps.loggers.orchestrator.info(`   ⏳ Waiting for all configuration tasks to complete...`);
      const results = await Promise.allSettled(configurationTasks);
      this.deps.loggers.orchestrator.info(`   ✅ All ${results.length} configuration tasks completed`);
      
      // Process results in order
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const nodeBeingConfigured = discoveredNodes[i];
        
        if (result.status === 'rejected') {
          // Handle rejected promises - this should not happen with our error handling
          this.deps.loggers.orchestrator.error(
            `   ❌ Configuration task ${i + 1} was rejected:`,
            result.reason
          );
          
          // Still add to configured array to track the failure
          configured.push({
            id: nodeBeingConfigured?.id || 'unknown',
            type: nodeBeingConfigured?.type || 'unknown',
            purpose: nodeBeingConfigured?.purpose || 'Failed to configure',
            config: {},
            validated: false,
            validationErrors: [`Task rejected: ${result.reason}`],
            category: nodeBeingConfigured?.category || 'unknown'
          });
          
          reasoning.push(`Configuration task ${i + 1} failed: ${result.reason}`);
          continue;
        }
        
        if (!result.value) {
          // This shouldn't happen anymore with our improved error handling
          this.deps.loggers.orchestrator.error(
            `   ❌ Configuration task ${i + 1} returned null - this is unexpected`
          );
          continue;
        }
        
        const { node, finalConfig, isValid, validationErrors, nodeReasoning, configOperations } = result.value;
        
        operations.push(...configOperations);
        reasoning.push(...nodeReasoning);

        // Add to configured nodes
        configured.push({
          id: node.id,
          type: node.type,
          purpose: node.purpose,
          config: finalConfig,
          validated: isValid,
          validationErrors: isValid ? undefined : validationErrors,
          category: node.category, // Preserve category from discovery
        });

        // Add validation operation for tracking
        operations.push({
          type: "validateNode",
          nodeId: node.id,
          result: {
            valid: isValid,
            errors: validationErrors.map((error: any) => ({
              nodeId: node.id,
              message: error,
              severity: 'error' as const
            })),
          },
        });

        if (isValid) {
          this.deps.loggers.orchestrator.debug(
            `✅ ${node.type} configured and validated successfully`
          );
          reasoning.push(`${node.type} configured and validated successfully`);
        } else {
          // Store detailed errors for summary later
          const errorMsg = validationErrors.length > 0 
            ? `: ${validationErrors.join(", ")}`
            : "";
          this.deps.loggers.orchestrator.debug(
            `❌ ${node.type} validation failed${errorMsg}`
          );
          reasoning.push(
            `${node.type} configured but validation failed${errorMsg}`
          );
        }
      }

      // Check if all nodes were successfully configured
      const allValid = configured.every((n) => n.validated);
      const validCount = configured.filter((n) => n.validated).length;
      const invalidNodes = configured.filter((n) => !n.validated);
      const elapsedTime = Date.now() - startTime;

      // Log detailed summary if there were failures
      if (invalidNodes.length > 0) {
        this.deps.loggers.orchestrator.info(
          `\n   📊 Configuration Results:`
        );
        this.deps.loggers.orchestrator.info(
          `      ✅ Successful: ${validCount}/${configured.length} nodes`
        );
        this.deps.loggers.orchestrator.info(
          `      ❌ Failed: ${invalidNodes.length}/${configured.length} nodes`
        );
        invalidNodes.forEach(node => {
          this.deps.loggers.orchestrator.info(
            `         - ${node.type} (${node.id}): ${node.validationErrors?.join(', ')}`
          );
        });
      }

      // Log summary of configuration phase ONCE at the end
      this.deps.loggers.orchestrator.info(
        `\n⚙️  Phase 2: Configuration Complete`
      );
      this.deps.loggers.orchestrator.info(
        `   Nodes configured: ${configured.length}`
      );
      
      // Log node types configured
      if (configured.length > 0) {
        // Count pre-configured task nodes based on discovery flag
        const taskNodes = discoveredNodes
          .filter(n => n.isPreConfigured && !!n.config).length;
        const searchNodes = configured.length - taskNodes;
        this.deps.loggers.orchestrator.info(
          `   - Task templates customized: ${taskNodes}`
        );
        this.deps.loggers.orchestrator.info(
          `   - Search nodes configured: ${searchNodes}`
        );
      }
      
      // Log validation summary with proper error details
      if (validCount === configured.length) {
        this.deps.loggers.orchestrator.info(
          `   ✅ All nodes validated successfully`
        );
      } else {
        const failedNodes = configured.filter(n => !n.validated);
        this.deps.loggers.orchestrator.info(
          `   ⚠️  Validation: ${validCount}/${configured.length} passed`
        );
        // List failed nodes with their errors at INFO level
        failedNodes.forEach(node => {
          if (node.validationErrors && node.validationErrors.length > 0) {
            // If we have specific errors, show them
            this.deps.loggers.orchestrator.info(
              `      ❌ ${node.type}:`
            );
            node.validationErrors.forEach(error => {
              this.deps.loggers.orchestrator.info(
                `         - ${error}`
              );
            });
          } else {
            // If no specific errors, check if it's from a failed Claude call
            this.deps.loggers.orchestrator.info(
              `      ❌ ${node.type}: Validation check failed (run with --verbose for details)`
            );
          }
        });
      }
      
      this.deps.loggers.orchestrator.info(
        `   ⏱️  Duration: ${elapsedTime}ms`
      );

      // Add phase completion operation if successful
      if (allValid) {
        operations.push({ type: 'completePhase', phase: 'configuration' });
      }
      
      // Persist operations before forcing save
      if (operations.length > 0) {
        await this.deps.sessionRepo.persistOperations(sessionId, operations);
      }

      // Force save at phase completion
      await this.deps.sessionRepo.save(sessionId);

      return {
        success: allValid,
        operations,
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
              retryable: true,
            },
      };
    } catch (error) {
      // Record error in Supabase
      await this.deps.sessionRepo.recordError(sessionId, error, "configuration");
      
      return {
        success: false,
        operations: [],
        phase: "configuration",
        configured: [],
        error: {
          type: "claude_api",
          code: "CONFIGURATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to configure workflow nodes",
          retryable: true,
        },
      };
    }
  }

  /**
   * Get configuration context from session or discovery result
   */
  private async getConfigurationContext(sessionId: string) {
    let discoveredNodes: DiscoveredNode[] = [];
    let userPrompt = "Configure discovered nodes";

    const session = await this.deps.sessionRepo.load(sessionId);
    if (session) {
      discoveredNodes = session.state.discovered || [];
      userPrompt = session.state.userPrompt || userPrompt;
    }

    return { discoveredNodes, userPrompt };
  }

  /**
   * Generate configuration for a single node using essentials
   */
  private async generateAndValidateNodeConfig(
    node: DiscoveredNode,
    userPrompt: string,
    sessionId: string,
    nodeEssentials: Map<string, any>
  ) {
    const reasoning: string[] = [];
    const operations: WorkflowOperation[] = [];

    this.deps.loggers.orchestrator.debug(
      `      → generateAndValidateNodeConfig called for ${node.type} (${node.id})`
    );

    try {
      // Handle pre-configured task nodes (detected from discovery)
      if (node.isPreConfigured && node.config) {
        this.deps.loggers.orchestrator.debug(
          `      → ${node.type} is pre-configured, customizing task template`
        );
        
        // Step 1: Restructure the flat config from MCP into proper n8n format
        this.deps.loggers.orchestrator.debug(
          `Original task template from MCP:`, JSON.stringify(node.config, null, 2)
        );
        const restructuredTemplate = this.restructureTaskConfig(node.config);
        this.deps.loggers.orchestrator.debug(
          `Restructured template:`, JSON.stringify(restructuredTemplate, null, 2)
        );
        
        // Apply preconfiguration patches to fix known issues
        const { config: patchedTemplate, patchesApplied } = 
          this.applyPreconfigurationPatches(node.type, restructuredTemplate);
        
        if (patchesApplied.length > 0) {
          this.deps.loggers.orchestrator.debug(
            `Applied ${patchesApplied.length} patches to task template: ${patchesApplied.join(', ')}`
          );
        }
        
        // Log customization step
        this.deps.loggers.orchestrator.debug(
          `   Applying user requirements to ${node.type} template`
        );
        
        // Step 2: Build targeted prompt using task template and rules
        const prompt = this.promptBuilder.buildPrompt({
          node,
          essentials: patchedTemplate, // Pass patched template as "essentials"
          workflowContext: {
            description: userPrompt,
            userPrompt: userPrompt
          }
        });

        // Log that a task customization prompt was created
        this.deps.loggers.orchestrator.debug(
          `Task customization prompt created for ${node.type}`
        );

        // Step 3: Get customized configuration from Claude
        this.deps.loggers.orchestrator.debug(
          `Customizing task template for ${node.type} based on user requirements`
        );
        
        const claudeResult = await this.deps.claudeService.execute(
          {
            prompt: prompt,
            selectedNodes: [node.id],
            context: {
              discoveredNodes: [node],
              nodeSchemas: { [node.type]: patchedTemplate }, // Pass patched template as schema
              nodeProperties: {},
              nodeTemplates: { [node.type]: patchedTemplate }, // Also as template
              nodeDocumentation: {},
              enrichedContext: { 
                optimized: true, 
                taskTemplate: true, 
                customPrompt: true,
                preConfigured: true 
              }
            }
          },
          { sessionId }
        );
        
        if (!claudeResult.success || !claudeResult.data) {
          throw new Error(`Failed to customize task template for ${node.type}`);
        }

        // Extract configuration from response
        let nodeConfig: any = {};
        let configFound = false;
        
        for (const operation of claudeResult.data.operations) {
          if (operation.type === "configureNode" && operation.nodeId === node.id) {
            nodeConfig = operation.config;
            configFound = true;
            operations.push({
              ...operation,
              nodeType: node.type,
              purpose: node.purpose,
              customizedFromTemplate: true
            });
            break;
          }
        }
        
        if (!configFound) {
          throw new Error(`No configuration generated for task node ${node.id}`);
        }

        if (claudeResult.data.reasoning) {
          reasoning.push(...claudeResult.data.reasoning);
        }

        // Step 4: Merge Claude's config with the patched template
        // This preserves node-level properties while applying Claude's customizations
        const mergedConfig = this.mergeTaskConfig(patchedTemplate, nodeConfig);
        
        // Apply patches again after merge to ensure fixes are preserved
        const { config: finalPatchedConfig, patchesApplied: postMergePatches } = 
          this.applyPreconfigurationPatches(node.type, mergedConfig);
        
        if (postMergePatches.length > 0) {
          this.deps.loggers.orchestrator.debug(
            `Applied ${postMergePatches.length} post-merge patches: ${postMergePatches.join(', ')}`
          );
        }
        
        this.deps.loggers.orchestrator.debug(
          `Final patched config for ${node.type}:`, 
          JSON.stringify(finalPatchedConfig, null, 2)
        );

        // Step 5: Validate and attempt to fix the merged configuration
        let validation = await this.validateConfig(node.type, finalPatchedConfig);
        
        // Debug log to understand validation result
        this.deps.loggers.orchestrator.info(
          `   🔍 Validation result for ${node.type}: isValid=${validation.isValid}, errors=${validation.validationErrors?.length || 0}`
        );
        if (validation.validationErrors?.length > 0) {
          this.deps.loggers.orchestrator.info(
            `      Errors: ${validation.validationErrors.join(', ')}`
          );
        }
        
        // Use the shared fix method
        const fixResult = await this.attemptToFixValidationErrors(
          node,
          finalPatchedConfig,
          validation,
          reasoning
        );

        return {
          finalConfig: fixResult.finalConfig,
          isValid: fixResult.validation.isValid,
          validationErrors: fixResult.validation.validationErrors,
          nodeReasoning: reasoning,
          configOperations: operations,
        };
      }

      // Step 1: Get node essentials from cache (already fetched at start)
      this.deps.loggers.orchestrator.debug(
        `      → Configuring search node: ${node.type}`
      );
      
      // Get cached essentials from the passed Map
      let essentials = nodeEssentials.get(node.type);
      
      if (!essentials) {
        // Fallback: fetch if not in cache (shouldn't happen)
        this.deps.loggers.orchestrator.warn(
          `      → No cached essentials for ${node.type}, fetching...`
        );
        essentials = await this.getNodeEssentials(node.type);
      } else {
        this.deps.loggers.orchestrator.debug(
          `      → Using cached essentials for ${node.type}`
        );
      }
      
      if (!essentials) {
        this.deps.loggers.orchestrator.warn(
          `      → No essentials available for ${node.type}, using basic config`
        );
      }

      // Step 2: Build targeted prompt using essentials and rules
      const prompt = this.promptBuilder.buildPrompt({
        node,
        essentials: essentials || {},
        workflowContext: {
          description: userPrompt,
          userPrompt: userPrompt
        }
      });

      // Log that a prompt was created (without showing the full content)
      this.deps.loggers.orchestrator.debug(
        `Configuration prompt created for ${node.type}`
      );

      // Step 3: Get configuration from Claude (single call, no retries)
      this.deps.loggers.orchestrator.debug(
        `Generating configuration for ${node.type} with essentials-based prompt`
      );
      
      const claudeResult = await this.deps.claudeService.execute(
        {
          prompt: prompt, // Use the built prompt instead of userPrompt
          selectedNodes: [node.id],
          context: {
            discoveredNodes: [node],
            nodeSchemas: nodeEssentials ? { [node.type]: nodeEssentials } : {},
            // No property searches or additional context needed!
            nodeProperties: {},
            nodeTemplates: {},
            nodeDocumentation: {},
            enrichedContext: { optimized: true, essentialsOnly: true, customPrompt: true }
          }
        },
        { sessionId }
      );
      
      if (!claudeResult.success || !claudeResult.data) {
        throw new Error(`Failed to generate configuration for ${node.type}`);
      }

      // Log what operations Claude returned to debug node ID mismatches
      if (claudeResult.data?.operations) {
        this.deps.loggers.orchestrator.info(
          `   📥 Claude returned ${claudeResult.data.operations.length} operations for ${node.id}`
        );
        claudeResult.data.operations.forEach((op: any) => {
          if (op.type === 'configureNode') {
            this.deps.loggers.orchestrator.info(
              `      - configureNode for nodeId: ${op.nodeId} (expected: ${node.id})`
            );
          }
        });
      }

      // Extract configuration from response
      // Note: We're flexible with node IDs - Claude might generate different IDs
      // We'll take the first configureNode operation since we only asked for one node
      let nodeConfig: any = {};
      let configFound = false;
      
      for (const operation of claudeResult.data.operations) {
        if (operation.type === "configureNode") {
          // Accept any configureNode operation since we're configuring one node at a time
          nodeConfig = operation.config;
          configFound = true;
          
          // Log if there's a mismatch but still use the config
          if (operation.nodeId !== node.id) {
            this.deps.loggers.orchestrator.info(
              `      Note: Using config for nodeId ${operation.nodeId} (requested ${node.id})`
            );
          }
          
          operations.push({
            ...operation,
            nodeId: node.id, // Override with our expected ID
            nodeType: node.type,
            purpose: node.purpose
          });
          break;
        }
      }
      
      if (!configFound) {
        // Log the issue but don't throw - return an empty config that will fail validation
        this.deps.loggers.orchestrator.warn(
          `   ⚠️ Claude did not generate a configuration for ${node.type} (${node.id})`
        );
        this.deps.loggers.orchestrator.info(
          `      This node will be marked as invalid and may need manual configuration`
        );
        
        // Return early with invalid configuration
        return {
          finalConfig: {},
          isValid: false,
          validationErrors: [`No configuration generated for node ${node.id}`],
          nodeReasoning: [`Failed to generate configuration for ${node.type}: Claude did not return a configureNode operation for this node`],
          configOperations: operations,
          allOperations: claudeResult.data.operations
        };
      }

      if (claudeResult.data.reasoning) {
        reasoning.push(...claudeResult.data.reasoning);
      }

      // Apply preconfiguration patches to fix known issues
      const { config: patchedConfig, patchesApplied } = 
        this.applyPreconfigurationPatches(node.type, nodeConfig);
      
      if (patchesApplied.length > 0) {
        this.deps.loggers.orchestrator.debug(
          `Applied ${patchesApplied.length} patches to ${node.type}: ${patchesApplied.join(', ')}`
        );
      }

      // Step 4: Validate and attempt to fix the configuration
      let validation = await this.validateConfig(node.type, patchedConfig);
      
      // Use the shared fix method
      const fixResult = await this.attemptToFixValidationErrors(
        node,
        patchedConfig,
        validation,
        reasoning
      );

      return {
        finalConfig: fixResult.finalConfig,
        isValid: fixResult.validation.isValid,
        validationErrors: fixResult.validation.validationErrors,
        nodeReasoning: reasoning,
        configOperations: operations,
      };
      
    } catch (error) {
      this.deps.loggers.orchestrator.error(
        `Failed to configure ${node.type}:`,
        error
      );
      return {
        finalConfig: {},
        isValid: false,
        validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
        nodeReasoning: [`Failed to configure ${node.type}: ${error instanceof Error ? error.message : 'Unknown error'}`],
        configOperations: []
      };
    }
  }

  /**
   * Get node essentials (schema information)
   */
  private async getNodeEssentials(nodeType: string): Promise<any> {
    try {
      this.deps.loggers.orchestrator.debug(`Getting essentials for ${nodeType}`);
      const essentialsResult = await this.deps.nodeContextService.getNodeEssentials(nodeType);
      return essentialsResult;
    } catch (error) {
      this.deps.loggers.orchestrator.error(
        `Failed to get essentials for ${nodeType}:`,
        error
      );
    }
    return null;
  }


  /**
   * Validate node configuration and return FULL validation details
   * Note: The NodeContextService will extract just the parameters object for MCP validation
   * since validate_node_operation expects only parameters, not the full node config structure
   */
  private async validateConfig(nodeType: string, config: any) {
    const validation = await this.deps.nodeContextService.validateNodeConfig(nodeType, config);
    
    // Log validation details at debug level for troubleshooting
    if (!validation.isValid) {
      this.deps.loggers.orchestrator.debug(
        `Validation details for ${nodeType}:`,
        { 
          isValid: validation.isValid,
          errors: validation.validationErrors,
          errorCount: validation.validationErrors?.length || 0,
          hasAutofix: !!validation.autofix,
          hasSuggestions: !!validation.suggestions,
          fixableErrors: validation.errors?.filter((e: any) => e.fix).length || 0
        }
      );
    }
    
    // Return the FULL validation result, not just isValid/errors
    // This includes autofix, suggestions, examples, etc.
    return {
      isValid: validation.isValid,
      validationErrors: validation.validationErrors || [],
      fullValidation: validation.fullValidation, // Pass through the MCP response directly, not the wrapper
    };
  }

  /**
   * Attempt to fix validation errors for a node configuration
   * This is a shared method used by both task nodes and regular nodes
   * 
   * @returns The fixed configuration and validation result
   */
  private async attemptToFixValidationErrors(
    node: DiscoveredNode,
    initialConfig: any,
    validation: any,
    reasoning: string[]
  ): Promise<{
    finalConfig: any;
    validation: any;
    fixAttempts: number;
  }> {
    let finalConfig = initialConfig;
    let currentValidation = validation;
    
    // If already valid, return immediately
    if (currentValidation.isValid) {
      return {
        finalConfig,
        validation: currentValidation,
        fixAttempts: 0
      };
    }
    
    // Check if we have missingRequiredFields that we can auto-fix FIRST
    if (currentValidation.fullValidation?.missingRequiredFields?.length > 0) {
      const missingFields = currentValidation.fullValidation.missingRequiredFields;
      
      this.deps.loggers.orchestrator.info(
        `   🔧 Attempting automatic fix for missing fields: ${missingFields.join(', ')}`
      );
      
      // Get cached essentials from session (need to get sessionId from somewhere)
      // For now, we'll try to get it from the node essentials we cached
      const { fixedConfig, fixes } = this.autoFixMissingFields(
        finalConfig,
        missingFields,
        currentValidation.fullValidation // Pass the validation result which might have essentials
      );
      
      if (fixes.length > 0) {
        this.deps.loggers.orchestrator.info(
          `   ✅ Auto-fixed ${fixes.length} missing fields`
        );
        
        finalConfig = fixedConfig;
        reasoning.push(`Auto-fixed missing fields: ${fixes.map(f => f.field).join(', ')}`);
        
        // Re-validate after auto-fix
        currentValidation = await this.validateConfig(node.type, finalConfig);
        
        if (currentValidation.isValid) {
          this.deps.loggers.orchestrator.info(
            `   ✅ Auto-fix successful! Configuration now valid for ${node.type}`
          );
          return {
            finalConfig,
            validation: currentValidation,
            fixAttempts: 0
          };
        }
      }
    }
    
    // Log initial validation result if not auto-fixed
    this.deps.loggers.orchestrator.info(
      `   ⚠️ Initial validation failed for ${node.type} (${node.id}):`
    );
    this.deps.loggers.orchestrator.info(
      `      Errors: ${currentValidation.validationErrors.join(", ")}`
    );
    
    // Try to fix validation errors with Claude
    const MAX_FIX_ATTEMPTS = 2;
    let fixAttempt = 0;
    let previousErrors = JSON.stringify(currentValidation.validationErrors);
    
    while (!currentValidation.isValid && fixAttempt < MAX_FIX_ATTEMPTS) {
      fixAttempt++;
      this.deps.loggers.orchestrator.info(
        `   🔧 Attempting to fix validation errors for ${node.type} (attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS})`
      );
      
      this.deps.loggers.orchestrator.info(
        `      Errors to fix: ${currentValidation.validationErrors.join(", ")}`
      );
      
      this.deps.loggers.orchestrator.info(
        `      🤖 Calling Claude to generate fixes...`
      );
      
      // Log what we have available for fixing
      if (currentValidation.fullValidation) {
        this.deps.loggers.orchestrator.info(
          `         Validation data available: ${Object.keys(currentValidation.fullValidation).join(', ')}`
        );
      } else {
        this.deps.loggers.orchestrator.info(
          `         No validation data available - using error messages only`
        );
      }
      
      const fixResult = await this.deps.claudeService.generateConfigurationFixes({
        nodeId: node.id,
        nodeType: node.type,
        currentConfig: finalConfig,
        validationResult: currentValidation.fullValidation
      });
      
      if (fixResult.success && fixResult.data) {
        finalConfig = fixResult.data.fixedConfig;
        reasoning.push(...fixResult.data.reasoning);
        
        this.deps.loggers.orchestrator.info(
          `      🤖 Claude generated fix with reasoning:`
        );
        this.deps.loggers.orchestrator.info(
          `         "${fixResult.data.reasoning.join('; ')}"`
        );
        
        // Re-validate the fixed configuration
        this.deps.loggers.orchestrator.info(
          `      📝 Re-validating fixed configuration...`
        );
        currentValidation = await this.validateConfig(node.type, finalConfig);
        
        if (currentValidation.isValid) {
          this.deps.loggers.orchestrator.info(
            `      ✅ Fix successful! Configuration now valid for ${node.type}`
          );
          reasoning.push(`✅ ${node.type} configured and fixed successfully`);
          break;
        } else {
          // Check if errors changed
          const currentErrors = JSON.stringify(currentValidation.validationErrors);
          this.deps.loggers.orchestrator.info(
            `      ❌ Fix attempt ${fixAttempt} failed. Remaining errors:`
          );
          this.deps.loggers.orchestrator.info(
            `         ${currentValidation.validationErrors.join(", ")}`
          );
          
          if (currentErrors === previousErrors) {
            this.deps.loggers.orchestrator.info(
              `      ⚠️ Errors unchanged after fix - stopping attempts`
            );
            break;
          }
          previousErrors = currentErrors;
        }
      } else {
        this.deps.loggers.orchestrator.info(
          `      ❌ Claude failed to generate fixes for ${node.type} on attempt ${fixAttempt}`
        );
        if (fixResult.error) {
          this.deps.loggers.orchestrator.info(
            `         Error: ${fixResult.error.message}`
          );
        }
        break;
      }
    }
    
    if (!currentValidation.isValid) {
      this.deps.loggers.orchestrator.info(
        `   ❌ Configuration still invalid after ${fixAttempt} fix attempt${fixAttempt !== 1 ? 's' : ''} for ${node.type}`
      );
      this.deps.loggers.orchestrator.info(
        `      Final errors: ${currentValidation.validationErrors.join(", ")}`
      );
      reasoning.push(
        `⚠️ ${node.type} configuration still has issues after ${fixAttempt} fix attempts: ${currentValidation.validationErrors.join(", ")}`
      );
    }
    
    return {
      finalConfig,
      validation: currentValidation,
      fixAttempts: fixAttempt
    };
  }

  /**
   * Restructure flat task config from MCP into proper n8n node format
   * Separates node-level properties from parameter-level properties
   */
  private restructureTaskConfig(flatConfig: any): any {
    // Define node-level properties that should NOT be in parameters
    // Based on N8nNode interface in types/n8n/node.ts
    const NODE_LEVEL_PROPERTIES = [
      'onError',
      'retryOnFail',
      'maxTries',
      'waitBetweenTries',
      'alwaysOutputData',
      'continueOnFail',
      'notes',
      'typeVersion',
      'disabled',
      'executeOnce',
      'credentials',
      'color',
      'issues'
    ];
    
    const restructured: any = {
      parameters: {}
    };
    
    // Separate node-level from parameter-level properties
    for (const [key, value] of Object.entries(flatConfig)) {
      if (NODE_LEVEL_PROPERTIES.includes(key)) {
        // Place at node level
        restructured[key] = value;
      } else {
        // Place in parameters  
        restructured.parameters[key] = value;
      }
    }
    
    return restructured;
  }

  /**
   * Merge Claude's customized config with the restructured template
   * This preserves node-level properties while applying Claude's customizations
   */
  private mergeTaskConfig(template: any, claudeConfig: any): any {
    const merged: any = {};
    
    // First, copy all node-level properties from template
    for (const [key, value] of Object.entries(template)) {
      if (key !== 'parameters') {
        merged[key] = value;
      }
    }
    
    // Then apply Claude's config, which may override some values
    for (const [key, value] of Object.entries(claudeConfig)) {
      if (key === 'parameters') {
        // Merge parameters objects
        merged.parameters = {
          ...template.parameters,
          ...claudeConfig.parameters
        };
      } else {
        // Override node-level properties if Claude specified them
        merged[key] = value;
      }
    }
    
    // Ensure we have a parameters object even if empty
    if (!merged.parameters) {
      merged.parameters = {};
    }
    
    return merged;
  }

  /**
   * Apply preconfiguration patches to fix known issues
   * @param nodeType The type of node being configured
   * @param config The configuration to patch
   * @returns The patched configuration and list of applied patches
   */
  private applyPreconfigurationPatches(
    nodeType: string,
    config: any
  ): { config: any; patchesApplied: string[] } {
    return patchRegistry.applyPatches(nodeType, config);
  }

  /**
   * Prefetch node essentials for all nodes at the start of configuration
   * This allows us to cache them and reuse throughout the phase
   */
  private async prefetchNodeEssentials(nodes: DiscoveredNode[]): Promise<Map<string, any>> {
    const essentialsMap = new Map<string, any>();
    
    this.deps.loggers.orchestrator.info(
      `   📚 Fetching node essentials for ${nodes.length} nodes...`
    );
    
    // Fetch all essentials in parallel for better performance
    const essentialPromises = nodes.map(async (node) => {
      try {
        const essentials = await this.deps.nodeContextService.getNodeEssentials(node.type);
        if (essentials) {
          this.deps.loggers.orchestrator.info(
            `      ✅ Fetched essentials for ${node.type}`
          );
          return { type: node.type, essentials };
        }
      } catch (error) {
        this.deps.loggers.orchestrator.warn(
          `      ⚠️ Failed to fetch essentials for ${node.type}: ${error}`
        );
      }
      return null;
    });
    
    const results = await Promise.all(essentialPromises);
    
    // Store in map
    for (const result of results) {
      if (result) {
        essentialsMap.set(result.type, result.essentials);
      }
    }
    
    this.deps.loggers.orchestrator.info(
      `   ✅ Fetched essentials for ${essentialsMap.size}/${nodes.length} nodes`
    );
    
    return essentialsMap;
  }

  /**
   * Automatically fix missing required fields using node essentials
   * This avoids calling Claude for simple field additions
   */
  private autoFixMissingFields(
    config: any,
    missingFields: string[],
    nodeEssentials: any
  ): { fixedConfig: any; fixes: MissingFieldFix[] } {
    const fixedConfig = JSON.parse(JSON.stringify(config)); // Deep clone
    const fixes: MissingFieldFix[] = [];
    
    if (!fixedConfig.parameters) {
      fixedConfig.parameters = {};
    }
    
    for (const fieldDisplayName of missingFields) {
      // Special case for common fields
      if (fieldDisplayName.toLowerCase() === 'schema') {
        fixedConfig.parameters.schema = 'public';
        fixes.push({
          field: fieldDisplayName,
          parameterName: 'schema',
          defaultValue: 'public',
          source: 'default'
        });
        this.deps.loggers.orchestrator.info(
          `         ➕ Added default: schema = "public"`
        );
        continue;
      }
      
      // Try to find the field in node essentials
      if (nodeEssentials?.properties) {
        for (const [paramName, paramDef] of Object.entries(nodeEssentials.properties)) {
          const def = paramDef as any;
          if (def.displayName === fieldDisplayName || 
              def.name === fieldDisplayName ||
              paramName === fieldDisplayName) {
            // Found the field! Add default value
            const defaultValue = def.default || 
                                this.getDefaultForType(def.type) || 
                                '';
            
            fixedConfig.parameters[paramName] = defaultValue;
            fixes.push({
              field: fieldDisplayName,
              parameterName: paramName,
              defaultValue,
              source: 'essentials'
            });
            this.deps.loggers.orchestrator.info(
              `         ➕ Added from essentials: ${paramName} = ${JSON.stringify(defaultValue)}`
            );
            break;
          }
        }
      }
    }
    
    return { fixedConfig, fixes };
  }

  /**
   * Get default value for a parameter type
   */
  private getDefaultForType(type: string): any {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'options': return '';
      case 'collection': return {};
      case 'fixedCollection': return {};
      default: return '';
    }
  }

}