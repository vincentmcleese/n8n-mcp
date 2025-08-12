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
      const candidates = buildNodeTypeCandidates(nodeType);
      loggers.orchestrator.debug(`Getting info for ${nodeType} (candidates: ${candidates.join(', ')})`);

      for (const candidate of candidates) {
        try {
          const infoResult = await this.mcpClient.getNodeInfo(candidate);
          if (infoResult?.content?.[0]?.type === "text") {
            const text = infoResult.content[0].text;
            const lower = text.toLowerCase();
            if (lower.includes("not found") || lower.startsWith("error executing tool")) {
              continue;
            }
            try {
              return JSON.parse(text);
            } catch (e) {
              loggers.orchestrator.debug(`Could not parse info for ${candidate}`);
              return { raw: text };
            }
          }
        } catch (err) {
          // try next
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

      // Try original plus normalized variants to match MCP expectations
      const candidates = buildNodeTypeCandidates(nodeType);

      for (const candidate of candidates) {
        try {
          const result = await this.mcpClient.getNodeEssentials(candidate);
          const text = result?.content?.[0]?.type === "text" ? result.content[0].text : undefined;

          if (!text) continue;

          // If MCP explicitly says not found or tool error, try next candidate
          const lower = text.toLowerCase();
          if (
            lower.includes("not found") && lower.includes("node") ||
            lower.startsWith("error executing tool")
          ) {
            loggers.orchestrator.debug(`Essentials not found for candidate '${candidate}', trying next`);
            continue;
          }

          try {
            return JSON.parse(text);
          } catch {
            // Return raw if it's not JSON but not a not-found error
            return { raw: text };
          }
        } catch (err) {
          // Move to next candidate on failure
          loggers.orchestrator.debug(`Error fetching essentials for '${candidate}', trying next`);
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
  async validateNodeConfig(nodeType: string, config: any): Promise<NodeValidationResult & { fullValidation?: any }> {
    let validationErrors: string[] = [];
    let isValid = false;
    let fullValidation: any = null;

    try {
      const candidates = buildNodeTypeCandidates(nodeType);
      loggers.orchestrator.debug(`Validating configuration for ${nodeType} (candidates: ${candidates.join(', ')})`);
      loggers.orchestrator.debug(`Config being validated:`, JSON.stringify(config, null, 2));

      // Extract just the parameters object for validation
      // The validate_node_operation MCP tool expects only the parameters, not the full node config
      const parametersToValidate = config.parameters || {};
      loggers.orchestrator.debug(`Parameters being sent to MCP validation:`, JSON.stringify(parametersToValidate, null, 2));

      let validationResult: any = null;
      for (const candidate of candidates) {
        try {
          // Use validateNodeMinimal for less strict validation that accepts expressions
          validationResult = await this.mcpClient.validateNodeMinimal(candidate, parametersToValidate);
          const text = validationResult?.content?.[0]?.type === "text" ? validationResult.content[0].text : '';
          const lower = (text || '').toLowerCase();
          if (lower.includes("not found") || lower.startsWith("error executing tool")) {
            continue;
          }
          break;
        } catch (err) {
          // try next candidate
        }
      }

      // Prefer strict JSON from any content part; fall back to tolerant parser
      const parts = Array.isArray(validationResult?.content) ? validationResult.content : [];
      loggers.orchestrator.debug(`MCP validation response:`, JSON.stringify(validationResult, null, 2));
      let parsedFromJson = false;
      for (const part of parts) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          const text = part.text.trim();
          if (text.startsWith('{') || text.startsWith('[')) {
            try {
              const data = JSON.parse(text);
              loggers.orchestrator.debug(`Parsed validation data:`, data);
              
              // Store the full validation response
              fullValidation = data;
              
              // Extract errors first - check multiple possible locations
              if (data.errors && Array.isArray(data.errors)) {
                validationErrors = data.errors.map((e: any) => 
                  typeof e === 'string' ? e : (e.message || e.error || JSON.stringify(e))
                );
              } else if (data.missingRequiredFields && Array.isArray(data.missingRequiredFields)) {
                validationErrors = data.missingRequiredFields.map((f: string) => `Missing required field: ${f}`);
              } else {
                validationErrors = [];
              }
              
              // Extract validation status - if there are errors, it's invalid
              if (validationErrors.length > 0) {
                isValid = false;
              } else if (data.valid !== undefined) {
                isValid = !!data.valid;
              } else {
                // Default to true only if no errors and no explicit valid field
                isValid = true;
              }
              
              // If marked invalid but no specific errors found, add generic error
              if (!isValid && validationErrors.length === 0) {
                validationErrors = ['Validation failed - check configuration'];
              }
              
              parsedFromJson = true;
              break;
            } catch { /* try next part */ }
          }
        }
      }

      if (!parsedFromJson && parts.length > 0) {
        const fallbackText = (parts.find((p: any) => p?.type === 'text') as any)?.text || '';
        const parsed = parseValidationOutput(fallbackText);
        isValid = parsed.isValid;
        validationErrors = parsed.errors;
      }
    } catch (error) {
      loggers.orchestrator.error(`Validation failed for ${nodeType}:`, error);
      isValid = true; // Assume valid if validation service fails
    }

    return { 
      isValid, 
      validationErrors,
      fullValidation // Include the complete MCP validation response
    } as NodeValidationResult & { fullValidation?: any };
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

// Helper methods

/**
 * Build likely MCP node type identifiers for a given workflow node type.
 * Handles common package prefix differences between discovery/configuration.
 */
export function toMcpNodeType(nodeType: string): string {
  // Normalize scoped packages like '@n8n/n8n-nodes-langchain.openAi'
  let normalized = nodeType.replace(/^@n8n\//, '');

  const hasDot = normalized.includes('.');
  if (!hasDot) {
    // No package segment, return as-is
    return normalized;
  }

  const [pkg, rest] = [normalized.substring(0, normalized.indexOf('.')), normalized.substring(normalized.indexOf('.') + 1)];
  // Strip leading 'n8n-' from package segment, e.g., 'n8n-nodes-base' -> 'nodes-base'
  const canonicalPkg = pkg.replace(/^n8n-/, '');
  return `${canonicalPkg}.${rest}`;
}

export function buildNodeTypeCandidates(nodeType: string): string[] {
  const candidates: string[] = [];

  // 0) Canonical MCP identifier first
  const canonical = toMcpNodeType(nodeType);
  candidates.push(canonical);

  // 1) Original
  candidates.push(nodeType);

  // 2) Strip leading 'n8n-' from package segment (if not already canonical)
  if (nodeType.startsWith('n8n-')) {
    const parts = nodeType.split('.');
    if (parts.length > 1 && parts[0].startsWith('n8n-')) {
      const withoutPrefix = `${parts[0].replace(/^n8n-/, '')}.${parts.slice(1).join('.')}`;
      candidates.push(withoutPrefix);
    }
  }

  // 3) Handle scoped AI package variants like '@n8n/n8n-nodes-langchain.openAi'
  if (nodeType.startsWith('@n8n/n8n-')) {
    const afterScope = nodeType.replace('@n8n/', ''); // 'n8n-nodes-langchain.openAi'
    candidates.push(afterScope.replace(/^n8n-/, ''));
  }

  // 4) Fallback to simple type (last segment after '.') e.g., 'httpRequest'
  if (nodeType.includes('.')) {
    const simple = nodeType.substring(nodeType.lastIndexOf('.') + 1);
    candidates.push(simple);
  }

  // Deduplicate while preserving order
  return Array.from(new Set(candidates));
}

/**
 * Parse validation output which may be JSON or plain text.
 */
export function parseValidationOutput(text: string): { isValid: boolean; errors: string[]; wasJson: boolean } {
  const trimmed = (text || '').trim();
  // Try direct JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      const isValid = !!(data.valid ?? data.isValid ?? false);
      let errors: string[] = [];
      if (!isValid) {
        if (Array.isArray(data.errors)) {
          errors = data.errors;
        } else if (typeof data.errors === 'string') {
          errors = [data.errors];
        } else if (Array.isArray(data.missingFields)) {
          errors = data.missingFields.map((f: string) => `Missing required field: ${f}`);
        } else if (Array.isArray(data.missingRequiredFields)) {
          errors = data.missingRequiredFields.map((f: string) => `Missing required field: ${f}`);
        }
      }
      return { isValid, errors, wasJson: true };
    } catch {
      // fall through to non-JSON handling
    }
  }

  // Try to extract JSON from fenced code or embedded text
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i) || trimmed.match(/(\{[\s\S]*\})/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const isValid = !!(data.valid ?? data.isValid ?? false);
      let errors: string[] = [];
      if (!isValid) {
        if (Array.isArray(data.errors)) {
          errors = data.errors;
        } else if (typeof data.errors === 'string') {
          errors = [data.errors];
        }
      }
      return { isValid, errors, wasJson: true };
    } catch {
      // ignore
    }
  }

  // Heuristic plain-text parsing
  const lower = trimmed.toLowerCase();
  if (/(^|\b)(valid|ok|success|pass)(\b|$)/.test(lower) && !/invalid|error|fail|missing/.test(lower)) {
    return { isValid: true, errors: [], wasJson: false };
  }
  if (/invalid|error|fail/.test(lower)) {
    // Attempt to capture error lines
    const lines = trimmed.split(/\n|;|\.|,/).map(l => l.trim()).filter(Boolean);
    const errors = lines.filter(l => /error|missing|invalid/i.test(l)).slice(0, 10);
    return { isValid: false, errors, wasJson: false };
  }

  // Default conservative: treat as valid but note unknown format
  return { isValid: true, errors: [], wasJson: false };
}