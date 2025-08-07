// lib/orchestrator/runners/configuration.runner.ts

import { PhaseRunner } from "@/lib/orchestrator/contracts/PhaseRunner";
import {
  ConfigurationInput,
  ConfigurationOutput,
  ConfiguredNode,
  ConfigurationRunnerDeps,
} from "@/lib/orchestrator/contracts/configuration.types";
import { DiscoveredNode, WorkflowOperation } from "@/types/workflow";
import { DiscoveryResult } from "@/lib/workflow-orchestrator";
import { NodeInfoRequirements } from "@/lib/services/claude-service";
import pLimit from "p-limit";

/**
 * Runner for the configuration phase
 * Handles node configuration with validation and auto-fixing
 */
export class ConfigurationRunner implements PhaseRunner<ConfigurationInput, ConfigurationOutput> {
  constructor(private deps: ConfigurationRunnerDeps) {}

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
        "Starting configuration phase with hybrid approach (configure + pre-validate)..."
      );

      const configured: ConfiguredNode[] = [];
      const operations: WorkflowOperation[] = [];
      const reasoning: string[] = [];

      // Add phase transition operation
      operations.push({ type: 'setPhase', phase: 'configuration' });

      // Create concurrency limiter (max 5 parallel configurations)
      const limit = pLimit(5);
      
      const startTime = Date.now();
      this.deps.loggers.orchestrator.debug(
        `Starting parallel configuration of ${selectedNodeIds.length} nodes (max 5 concurrent)`
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

      // Check if all nodes were successfully configured and validated
      const allValid = configured.every((n) => n.validated);
      const validCount = configured.filter((n) => n.validated).length;
      const elapsedTime = Date.now() - startTime;

      this.deps.loggers.orchestrator.debug(`Configuration phase completed in ${elapsedTime}ms:`);
      this.deps.loggers.orchestrator.debug(
        `  - Total nodes: ${configured.length}`
      );
      this.deps.loggers.orchestrator.debug(`  - Valid nodes: ${validCount}`);
      this.deps.loggers.orchestrator.debug(
        `  - Invalid nodes: ${
          configured.length - validCount
        }`
      );
      
      // Log validation summary
      const validationHistoryOps = operations.filter(op => op.type === 'validationHistory');
      if (validationHistoryOps.length > 0) {
        this.deps.loggers.orchestrator.debug('Validation Summary:');
        validationHistoryOps.forEach((op: any) => {
          this.deps.loggers.orchestrator.debug(
            `  - ${op.nodeType}: ${op.totalAttempts} attempt(s), ${op.finalValid ? 'VALID' : 'INVALID'}`
          );
        });
      }
      
      // Log summary at INFO level
      this.deps.loggers.orchestrator.info(
        `Configuration completed: ${validCount}/${configured.length} nodes validated`
      );
      
      // Log configured node types
      if (configured.length > 0 && configured.length <= 5) {
        const nodeInfo = configured.map(n => `${n.type} (${n.validated ? '✓' : '✗'})`).join(', ');
        this.deps.loggers.orchestrator.info(`   Configured nodes: ${nodeInfo}`);
      }
      
      // Log any nodes that needed fixes
      const fixedNodes = validationHistoryOps.filter((op: any) => op.totalAttempts > 1 && op.finalValid);
      if (fixedNodes.length > 0) {
        this.deps.loggers.orchestrator.info(`   Fixed ${fixedNodes.length} nodes with validation errors`);
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
   * Generate and validate configuration for a single node
   */
  private async generateAndValidateNodeConfig(
    node: DiscoveredNode,
    userPrompt: string,
    sessionId: string
  ) {
    const reasoning: string[] = [];
    const operations: WorkflowOperation[] = [];

    // Step 1: Get node essentials and analyze requirements
    const nodeEssentials = await this.getNodeEssentials(node.type);
    const analysisResponse = await this.deps.claudeService.analyzeNodeRequirements({
      node,
      userPrompt,
      nodeEssentials
    });
    if (!analysisResponse.success || !analysisResponse.data) {
      throw new Error(`Failed to analyze requirements for ${node.type}`);
    }
    const analysisResult = analysisResponse.data;

    this.deps.loggers.orchestrator.debug(`Claude analysis for ${node.type}:`, {
      needsAuth: analysisResult.needsAuth,
      needsProperties: analysisResult.needsProperties,
      suggestedTask: analysisResult.suggestedTask,
      needsDocumentation: analysisResult.needsDocumentation,
    });

    // Step 2: Fetch additional context
    const additionalContext = await this.fetchAdditionalNodeContext(
      node.type,
      analysisResult
    );

    // Track what additional info was fetched for reasoning
    const fetchedInfo: string[] = Object.entries(additionalContext)
      .map(([key, value]) => {
        if (value) {
          if (key === "taskTemplate" && analysisResult.suggestedTask)
            return `task template: ${analysisResult.suggestedTask}`;
          if (key.endsWith("Properties"))
            return key.replace("Properties", " properties");
          if (key === "documentation") return "node documentation";
        }
        return "";
      })
      .filter(Boolean);

    if (fetchedInfo.length > 0) {
      reasoning.push(
        `Fetched additional context for ${node.type}: ${fetchedInfo.join(", ")}`
      );
    }
    if (analysisResult.reasoning) {
      reasoning.push(
        `Analysis for ${node.type}: ${analysisResult.reasoning.join(", ")}`
      );
    }

    // Step 3: Generate initial configuration
    const claudeResult = await this.deps.claudeService.execute(
      {
        prompt: userPrompt,
        selectedNodes: [node.id],
        context: {
          discoveredNodes: [node],
          nodeSchemas: nodeEssentials ? { [node.type]: nodeEssentials } : {},
          nodeProperties:
            additionalContext.authProperties ||
            additionalContext.headerProperties ||
            additionalContext.connectionProperties ||
            {},
          nodeTemplates: additionalContext.taskTemplate
            ? { [node.type]: additionalContext.taskTemplate }
            : {},
          nodeDocumentation: additionalContext.documentation
            ? { [node.type]: additionalContext.documentation }
            : {},
          enrichedContext: additionalContext,
        }
      },
      { sessionId }
    );
    
    if (!claudeResult.success || !claudeResult.data) {
      throw new Error(`Failed to generate configuration for ${node.type}`);
    }
    const claudeResponse = claudeResult.data;

    this.deps.loggers.orchestrator.debug(
      `Configuration response for ${node.type}:`,
      JSON.stringify(claudeResponse, null, 2)
    );

    let nodeConfig: any = {};
    let configFound = false;
    
    for (const operation of claudeResponse.operations) {
      if (operation.type === "configureNode" && operation.nodeId === node.id) {
        nodeConfig = operation.config;
        configFound = true;
        // Enhance the operation with node metadata
        operations.push({
          ...operation,
          nodeType: node.type,
          purpose: node.purpose
        });
        break;
      }
    }
    
    if (!configFound) {
      this.deps.loggers.orchestrator.error(
        `No configuration operation found for node ${node.id} (${node.type})`
      );
      throw new Error(`No configuration generated for node ${node.id}`);
    }

    if (claudeResponse.reasoning) {
      reasoning.push(...claudeResponse.reasoning);
    }

    // Transform fixedCollection properties if needed
    if (nodeEssentials && nodeConfig) {
      nodeConfig = this.transformFixedCollections(nodeConfig, nodeEssentials);
    }
    
    // Ensure we have a config object
    if (!nodeConfig) {
      nodeConfig = {};
    }

    // Step 4: Validate and fix loop
    let finalConfig = nodeConfig;
    let isValid = false;
    let validationErrors: string[] = [];
    const maxAttempts = 3;
    const validationHistory: any[] = [];

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const validation = await this.validateConfig(node.type, finalConfig);
      isValid = validation.isValid;
      validationErrors = validation.validationErrors;

      // Log validation attempt
      const validationAttempt = {
        attempt: attempts + 1,
        nodeType: node.type,
        nodeId: node.id,
        valid: isValid,
        errors: validationErrors,
        configSnapshot: JSON.parse(JSON.stringify(finalConfig))
      };
      validationHistory.push(validationAttempt);

      this.deps.loggers.orchestrator.debug(
        `Validation attempt ${attempts + 1}/${maxAttempts} for ${node.type}:`,
        {
          valid: isValid,
          errors: validationErrors,
          config: finalConfig
        }
      );

      if (isValid) {
        reasoning.push(`✅ ${node.type} validation passed on attempt ${attempts + 1}`);
        break;
      }

      this.deps.loggers.orchestrator.debug(
        `Fixing configuration for ${
          node.type
        } (attempt ${attempts + 1}/${maxAttempts})`
      );
      
      reasoning.push(
        `⚠️ ${node.type} validation failed (attempt ${attempts + 1}): ${validationErrors.join(", ")}`
      );

      // Only try to fix if not the last attempt
      if (attempts < maxAttempts - 1) {
        const beforeConfig = JSON.parse(JSON.stringify(finalConfig));
        const fixResult = await this.deps.claudeService.fixNodeConfig({
          node,
          config: finalConfig,
          validationErrors,
          nodeContext: {
            essentials: nodeEssentials,
            ...additionalContext,
          }
        });
        
        if (!fixResult.success || !fixResult.data) {
          throw new Error(`Failed to fix configuration for ${node.type}`);
        }
        
        if (!fixResult.data || typeof fixResult.data !== 'object') {
          throw new Error(`Fix result for ${node.type} did not contain a valid configuration object`);
        }
        
        finalConfig = fixResult.data;
        
        // Log what changed
        const changes = this.detectConfigChanges(beforeConfig, finalConfig);
        if (changes.length > 0) {
          reasoning.push(`🔧 Applied fixes: ${changes.join(", ")}`);
          this.deps.loggers.orchestrator.debug(`Configuration changes for ${node.type}:`, changes);
        }
      }
    }

    // Add validation history to operations
    operations.push({
      type: "validationHistory",
      nodeId: node.id,
      nodeType: node.type,
      history: validationHistory,
      finalValid: isValid,
      totalAttempts: validationHistory.length
    });

    return {
      finalConfig,
      isValid,
      validationErrors,
      nodeReasoning: reasoning,
      configOperations: operations,
    };
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
   * Fetch additional context based on Claude's analysis
   */
  private async fetchAdditionalNodeContext(
    nodeType: string,
    analysis: NodeInfoRequirements
  ) {
    const context: any = {};
    const propertyFetches: Promise<void>[] = [];

    // OPTIMIZATION: If we have a task template, we likely don't need property searches
    const hasTaskTemplate = !!analysis.suggestedTask;
    
    const fetchProperty = async (property: string) => {
      try {
        this.deps.loggers.orchestrator.debug(
          `Searching for ${property} properties in ${nodeType}`
        );
        const result = await this.deps.nodeContextService.searchNodeProperties(
          nodeType,
          property
        );
        if (result) {
          // Only store if we found actual matches
          if (result.matches && result.matches.length > 0) {
            context[`${property}Properties`] = result;
            this.deps.loggers.orchestrator.debug(`Found ${result.matches.length} matches for ${property}`);
          } else {
            this.deps.loggers.orchestrator.debug(`No matches found for ${property} - skipping`);
          }
        }
      } catch (error) {
        this.deps.loggers.orchestrator.error(
          `Failed to search ${property} properties:`,
          error
        );
      }
    };

    // Only search for properties if:
    // 1. We don't have a task template (task templates are complete)
    // 2. The property was explicitly requested by Claude
    // 3. We're not searching for things already in essentials
    if (!hasTaskTemplate && analysis.needsProperties.length > 0) {
      // Remove duplicates and filter out common properties that are usually in essentials
      const propertiesToSearch = [...new Set(analysis.needsProperties)]
        .filter(prop => {
          // Skip common properties that are typically in essentials
          const skipProperties = ['resource', 'operation', 'method', 'type'];
          return !skipProperties.includes(prop.toLowerCase());
        });
      
      this.deps.loggers.orchestrator.debug(`Will search for ${propertiesToSearch.length} properties: ${propertiesToSearch.join(', ')}`);
      
      for (const property of propertiesToSearch) {
        propertyFetches.push(fetchProperty(property));
      }
    } else if (hasTaskTemplate) {
      this.deps.loggers.orchestrator.debug(`Skipping property searches - task template provides complete configuration`);
    }

    if (analysis.suggestedTask) {
      propertyFetches.push(
        (async () => {
          try {
            this.deps.loggers.orchestrator.debug(
              `Getting task template: ${analysis.suggestedTask}`
            );
            const result = await this.deps.nodeContextService.getNodeForTask(
              analysis.suggestedTask!
            );
            if (result) {
              context.taskTemplate = result;
            }
          } catch (error) {
            this.deps.loggers.orchestrator.error(
              `Failed to get task template:`,
              error
            );
          }
        })()
      );
    }

    if (analysis.needsDocumentation) {
      propertyFetches.push(
        (async () => {
          try {
            this.deps.loggers.orchestrator.debug(
              `Getting documentation for ${nodeType}`
            );
            const result = await this.deps.nodeContextService.getNodeDocumentation(nodeType);
            if (result) {
              context.documentation = result;
            }
          } catch (error) {
            this.deps.loggers.orchestrator.error(
              `Failed to get documentation:`,
              error
            );
          }
        })()
      );
    }

    await Promise.all(propertyFetches);
    return context;
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

  /**
   * Detect changes between two configurations
   */
  private detectConfigChanges(before: any, after: any): string[] {
    const changes: string[] = [];
    
    const detectChangesRecursive = (obj1: any, obj2: any, path: string = '') => {
      // Handle null/undefined cases
      if (obj1 === null || obj1 === undefined) {
        if (obj2 !== null && obj2 !== undefined) {
          changes.push(`Added ${path || 'config'}`);
        }
        return;
      }
      
      if (obj2 === null || obj2 === undefined) {
        changes.push(`Removed ${path || 'config'}`);
        return;
      }
      
      // Check for added properties
      for (const key in obj2) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj1)) {
          changes.push(`Added ${currentPath}`);
        } else if (typeof obj2[key] === 'object' && obj2[key] !== null && !Array.isArray(obj2[key])) {
          detectChangesRecursive(obj1[key], obj2[key], currentPath);
        } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
          changes.push(`Changed ${currentPath}: "${obj1[key]}" → "${obj2[key]}"`);
        }
      }
      
      // Check for removed properties
      for (const key in obj1) {
        if (!(key in obj2)) {
          const currentPath = path ? `${path}.${key}` : key;
          changes.push(`Removed ${currentPath}`);
        }
      }
    };
    
    detectChangesRecursive(before, after);
    return changes;
  }

  /**
   * Transform fixedCollection properties to correct format
   */
  private transformFixedCollections(config: any, essentials: any): any {
    if (!essentials || !config) return config;
    
    // Gather all properties from essentials
    const allProperties = [
      ...(essentials.commonProperties || []),
      ...(essentials.requiredProperties || [])
    ];
    
    // Find fixedCollection properties
    const fixedCollectionProps = allProperties.filter(p => p.type === 'fixedCollection');
    
    // Transform each fixedCollection property if needed
    for (const prop of fixedCollectionProps) {
      if (config[prop.name] && prop.options?.[0]?.value) {
        const optionKey = prop.options[0].value;
        
        // Check if the config doesn't have the correct structure
        if (!config[prop.name][optionKey]) {
          // Assume current structure is an object with direct properties
          // Transform to array format under the option key
          const currentValue = config[prop.name];
          
          // If it's already an array, wrap it properly
          if (Array.isArray(currentValue)) {
            config[prop.name] = { [optionKey]: currentValue };
          } else {
            // Convert object format to array format
            const values = Object.entries(currentValue).map(([key, value]: [string, any]) => {
              // Each entry should have a 'key' field and spread the rest
              if (typeof value === 'object' && !Array.isArray(value)) {
                return { key, ...value };
              } else {
                return { key, value };
              }
            });
            config[prop.name] = { [optionKey]: values };
          }
          
          this.deps.loggers.orchestrator.debug(
            `Transformed fixedCollection property '${prop.name}' to use '${optionKey}' wrapper`
          );
        }
      }
    }
    
    return config;
  }
}