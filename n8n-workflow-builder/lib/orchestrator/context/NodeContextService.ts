// lib/orchestrator/context/NodeContextService.ts

import { MCPClient } from "@/lib/mcp-client";
import { loggers } from "@/lib/utils/logger";

export interface NodeSearchResult {
  nodeType: string;
  displayName: string;
  description: string;
  category?: string;
}

export interface NodeValidationResult {
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Service for node-related context operations
 * Encapsulates MCP client calls for node discovery, validation, and information retrieval
 */
export class NodeContextService {
  constructor(private mcpClient: MCPClient) {}
  
  /**
   * Get the MCP client instance
   * Useful for passing to other services that need MCP access
   */
  getMCPClient(): MCPClient {
    return this.mcpClient;
  }

  /**
   * Search for nodes based on a query
   */
  async searchNodes(query: string, limit: number = 5): Promise<NodeSearchResult[]> {
    try {
      loggers.orchestrator.debug(`Searching for nodes: "${query}"`);
      const searchResult = await this.mcpClient.searchNodes({ query, limit });

      if (searchResult?.content?.[0]?.type === "text") {
        try {
          const searchData = JSON.parse(searchResult.content[0].text);
          if (searchData.results && Array.isArray(searchData.results)) {
            return searchData.results.map((node: any) => ({
              nodeType: node.nodeType,
              displayName: node.displayName,
              description: node.description,
              category: node.category
            }));
          }
        } catch (e) {
          loggers.orchestrator.debug(`Could not parse search results for "${query}"`);
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Error searching nodes for "${query}":`, error);
    }
    return [];
  }

  /**
   * Get detailed information about a node
   */
  async getNodeInfo(nodeType: string): Promise<any> {
    try {
      loggers.orchestrator.debug(`Getting info for ${nodeType}`);
      const infoResult = await this.mcpClient.getNodeInfo(nodeType);

      if (infoResult?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(infoResult.content[0].text);
        } catch (e) {
          loggers.orchestrator.debug(`Could not parse info for ${nodeType}`);
          return { raw: infoResult.content[0].text };
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Failed to get info for ${nodeType}:`, error);
    }
    return null;
  }

  /**
   * Get node essentials (simplified schema)
   */
  async getNodeEssentials(nodeType: string): Promise<any> {
    try {
      loggers.orchestrator.debug(`Getting essentials for ${nodeType}`);
      const essentialsResult = await this.mcpClient.getNodeEssentials(nodeType);

      if (essentialsResult?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(essentialsResult.content[0].text);
        } catch (e) {
          loggers.orchestrator.debug(`Could not parse essentials for ${nodeType}`);
          return { raw: essentialsResult.content[0].text };
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Failed to get essentials for ${nodeType}:`, error);
    }
    return null;
  }

  /**
   * Search for node properties
   */
  async searchNodeProperties(nodeType: string, property: string): Promise<any> {
    try {
      loggers.orchestrator.debug(`Searching for ${property} properties in ${nodeType}`);
      const result = await this.mcpClient.searchNodeProperties(nodeType, property);
      
      if (result?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return { raw: result.content[0].text };
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Failed to search ${property} properties:`, error);
    }
    return null;
  }

  /**
   * Get task template for a node
   */
  async getNodeForTask(task: string): Promise<any> {
    try {
      loggers.orchestrator.debug(`Getting task template: ${task}`);
      const result = await this.mcpClient.getNodeForTask(task);
      
      if (result?.content?.[0]?.type === "text") {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return { raw: result.content[0].text };
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Failed to get task template:`, error);
    }
    return null;
  }

  /**
   * Get node documentation
   */
  async getNodeDocumentation(nodeType: string): Promise<string | null> {
    try {
      loggers.orchestrator.debug(`Getting documentation for ${nodeType}`);
      const result = await this.mcpClient.getNodeDocumentation(nodeType);
      
      if (result?.content?.[0]?.type === "text") {
        return result.content[0].text;
      }
    } catch (error) {
      loggers.orchestrator.error(`Failed to get documentation:`, error);
    }
    return null;
  }

  /**
   * Validate node configuration
   */
  async validateNodeConfig(nodeType: string, config: any): Promise<NodeValidationResult> {
    let validationErrors: string[] = [];
    let isValid = false;

    try {
      loggers.orchestrator.debug(`Validating configuration for ${nodeType}`);
      const validationResult = await this.mcpClient.validateNodeMinimal(nodeType, config);

      if (validationResult?.content?.[0]?.type === "text") {
        try {
          const validation = JSON.parse(validationResult.content[0].text);
          isValid = validation.valid || validation.isValid || false;
          
          if (!isValid) {
            if (validation.errors) {
              validationErrors = Array.isArray(validation.errors)
                ? validation.errors
                : [validation.errors];
            } else if (validation.missingFields) {
              validationErrors = validation.missingFields.map(
                (field: string) => `Missing required field: ${field}`
              );
            } else if (validation.missingRequiredFields) {
              validationErrors = validation.missingRequiredFields.map(
                (field: string) =>
                  `Missing required field: "${field}" (this might be a display name - check the node properties for the actual field name)`
              );
            }
          }
        } catch (e) {
          loggers.orchestrator.debug(`Could not parse validation result`);
          isValid = true; // Assume valid if we can't parse
        }
      }
    } catch (error) {
      loggers.orchestrator.error(`Validation failed for ${nodeType}:`, error);
      isValid = true; // Assume valid if validation service fails
    }

    return { isValid, validationErrors };
  }

  /**
   * Validate complete workflow
   */
  async validateWorkflow(workflow: any, options: any = {}): Promise<any> {
    try {
      loggers.orchestrator.debug("Running comprehensive workflow validation...");
      
      const validationResult = await this.mcpClient.callTool("validate_workflow", {
        workflow,
        options: {
          validateNodes: true,
          validateConnections: true,
          validateExpressions: true,
          profile: "runtime",
          ...options
        }
      });

      if (validationResult?.content?.[0]?.type === "text") {
        return JSON.parse(validationResult.content[0].text);
      }
    } catch (error) {
      loggers.orchestrator.error("Workflow validation failed:", error);
    }

    return { valid: false, errors: [], warnings: [] };
  }
}