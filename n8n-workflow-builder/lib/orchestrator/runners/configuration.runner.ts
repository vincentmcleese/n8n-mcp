// lib/orchestrator/runners/configuration.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  ConfigurationInput,
  ConfigurationOutput,
  ConfiguredNode,
  ConfigurationRunnerDeps,
} from "@/lib/orchestrator/contracts/configuration.types";
import { DiscoveredNode, WorkflowOperation } from "@/types/workflow";
import { ConfigurationPromptBuilder } from "@/services/claude/config/prompt-builder";
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
    
    try {
      // Get session to build context for configuration
      const { discoveredNodes, selectedNodeIds, userPrompt } =
        await this.getConfigurationContext(sessionId);

      // Validate we have selected nodes to configure
      if (selectedNodeIds.length === 0) {
        return {
          success: false,
          operations: [],
          phase: "configuration",
          configured: [],
          error: {
            type: "validation",
            code: "NO_NODES_SELECTED",
            message: "No nodes selected for configuration",
            userMessage:
              "Please complete discovery phase with selected nodes first",
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

      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'configuration' });

      // Create concurrency limiter (max 3 parallel configurations for essentials)
      const limit = pLimit(3);
      
      const startTime = Date.now();
      this.deps.loggers.orchestrator.debug(
        `Configuring ${selectedNodeIds.length} nodes (max 3 concurrent) with essentials`
      );
      
      // Process nodes in parallel with concurrency control
      const configurationTasks = selectedNodeIds.map(nodeId => 
        limit(async () => {
          const node = discoveredNodes.find((n) => n.id === nodeId);
          if (!node) {
            this.deps.loggers.orchestrator.warn(
              `Node ${nodeId} not found in discovered nodes`
            );
            return null;
          }

          this.deps.loggers.orchestrator.debug(
            `Configuring ${node.type} (${node.id}) with hybrid approach`
          );

          try {
            const result = await this.generateAndValidateNodeConfig(
              node,
              userPrompt,
              sessionId
            );
            
            return {
              node,
              ...result
            };
          } catch (error) {
            this.deps.loggers.orchestrator.error(
              `Failed to configure node ${node.id}:`,
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
      const results = await Promise.allSettled(configurationTasks);
      
      // Process results in order
      for (const result of results) {
        if (result.status === 'rejected' || !result.value) {
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
        });

        // Add validation operation for tracking
        operations.push({
          type: "validateNode",
          nodeId: node.id,
          result: {
            valid: isValid,
            errors: validationErrors.map(error => ({
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
          this.deps.loggers.orchestrator.debug(
            `⚠️  ${node.type} configured but validation failed`
          );
          reasoning.push(
            `${
              node.type
            } configured but validation failed: ${validationErrors.join(", ")}`
          );
        }
      }

      // Check if all nodes were successfully configured
      const allValid = configured.every((n) => n.validated);
      const validCount = configured.filter((n) => n.validated).length;
      const elapsedTime = Date.now() - startTime;

      this.deps.loggers.orchestrator.info(
        `OPTIMIZED configuration completed in ${elapsedTime}ms: ${validCount}/${configured.length} nodes valid`
      );
      
      // Log node types configured
      if (configured.length > 0) {
        // Count pre-configured task nodes based on discovery flag
        const taskNodes = discoveredNodes
          .filter(n => selectedNodeIds.includes(n.id))
          .filter(n => n.isPreConfigured && !!n.config).length;
        const searchNodes = configured.length - taskNodes;
        this.deps.loggers.orchestrator.info(
          `   Task nodes: ${taskNodes} (pre-configured), Search nodes: ${searchNodes} (essentials-based)`
        );
      }

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
    let selectedNodeIds: string[] = [];
    let userPrompt = "Configure selected nodes";

    const session = await this.deps.sessionRepo.load(sessionId);
    if (session) {
      discoveredNodes = session.state.discovered || [];
      selectedNodeIds = session.state.selected || [];
      userPrompt = session.state.userPrompt || userPrompt;
    }

    return { discoveredNodes, selectedNodeIds, userPrompt };
  }

  /**
   * Generate configuration for a single node using essentials
   */
  private async generateAndValidateNodeConfig(
    node: DiscoveredNode,
    userPrompt: string,
    sessionId: string
  ) {
    const reasoning: string[] = [];
    const operations: WorkflowOperation[] = [];

    try {
          // Skip pre-configured task nodes (detected from discovery)
          if (node.isPreConfigured && node.config) {
        this.deps.loggers.orchestrator.debug(
          `Skipping pre-configured task node: ${node.type}`
        );
        return {
          finalConfig: node.config,
          isValid: true,
          validationErrors: [],
          nodeReasoning: [`${node.type} was pre-configured from task template`],
          configOperations: [{
                type: "configureNode",
                nodeId: node.id,
                nodeType: node.type,
                config: node.config,
                purpose: node.purpose,
                preConfigured: true
              }]
        };
      }

      // Step 1: Get node essentials (5KB instead of 100KB+)
      this.deps.loggers.orchestrator.debug(
        `Getting essentials for ${node.type} (optimized data fetch)`
      );
      const nodeEssentials = await this.getNodeEssentials(node.type);
      
      if (!nodeEssentials) {
        this.deps.loggers.orchestrator.warn(
          `No essentials available for ${node.type}, using basic config`
        );
      }

      // Step 2: Build targeted prompt using essentials and rules
      const prompt = this.promptBuilder.buildPrompt({
        node,
        essentials: nodeEssentials || {},
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
            purpose: node.purpose
          });
          break;
        }
      }
      
      if (!configFound) {
        throw new Error(`No configuration generated for node ${node.id}`);
      }

      if (claudeResult.data.reasoning) {
        reasoning.push(...claudeResult.data.reasoning);
      }

      // Step 4: Simple validation (no retry loop)
      // Extract parameters from nested structure if present
      const configToValidate = nodeConfig.parameters || nodeConfig;
      const validation = await this.validateConfig(node.type, configToValidate);
      
      if (validation.isValid) {
        reasoning.push(`✅ ${node.type} configured successfully with essentials`);
      } else {
        reasoning.push(
          `⚠️ ${node.type} configuration may need adjustments: ${validation.validationErrors.join(", ")}`
        );
      }

      return {
        finalConfig: nodeConfig,
        isValid: validation.isValid,
        validationErrors: validation.validationErrors,
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
   * Validate node configuration
   */
  private async validateConfig(nodeType: string, config: any) {
    const validation = await this.deps.nodeContextService.validateNodeConfig(nodeType, config);
    return {
      isValid: validation.isValid,
      validationErrors: validation.validationErrors,
    };
  }


}