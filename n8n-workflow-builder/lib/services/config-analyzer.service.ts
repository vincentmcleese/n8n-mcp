// lib/services/config-analyzer.service.ts

import {
  WorkflowConfigAnalysis,
  NodeConfigStatus,
  ConfiguredField,
  CredentialRequirement,
  DecisionRequirement,
  WorkflowNode,
} from "@/types/workflow";
import { logger } from "@/lib/utils/logger";
import nodeAuthRequirements from "@/lib/data/node-auth-requirements.json";

/**
 * Service for analyzing workflow configuration status
 * Identifies what's configured, what needs credentials, and what needs decisions
 */
export class ConfigAnalyzer {
  private authRequirementsMap: Map<string, any>;
  private readonly placeholderPatterns = [
    'your-',
    'example.com',
    'placeholder',
    'TODO',
    'FIXME',
    'XXX',
    'https://api.',
    'test-',
    'demo-',
    'sample-',
    '<YOUR_',
    '[YOUR_',
    '{YOUR_'
  ];

  private readonly credentialPatterns = [
    /\{\{\s*\$vars\.[^}]+\}\}/,
    /\{\{\s*\$credentials\.[^}]+\}\}/,
    /\{\{\s*\$env\.[^}]+\}\}/
  ];

  constructor() {
    // Build map for O(1) lookups of authentication requirements
    this.authRequirementsMap = new Map();
    nodeAuthRequirements.forEach((node: any) => {
      // Store with nodes-base prefix (as in JSON)
      this.authRequirementsMap.set(node.nodeType, node);
      // Also store with n8n-nodes-base prefix (as used in workflows)
      const n8nNodeType = node.nodeType.replace('nodes-base.', 'n8n-nodes-base.');
      this.authRequirementsMap.set(n8nNodeType, node);
    });
  }

  /**
   * Analyze complete workflow configuration
   */
  analyzeWorkflow(workflow: { nodes: WorkflowNode[]; connections: any; settings: any }): WorkflowConfigAnalysis {
    const nodes = workflow.nodes
      .filter(node => !node.type?.includes('stickyNote')) // Skip sticky notes
      .map(node => this.analyzeNode(node));
    
    const configuredNodes = nodes.filter(n => n.status === 'configured');
    const allMissingCredentials = this.extractAllMissingCredentials(nodes);
    
    logger.debug(`Configuration analysis: ${configuredNodes.length}/${nodes.length} nodes configured`);
    
    return {
      timestamp: new Date().toISOString(),
      isComplete: nodes.every(n => n.isReady),
      totalNodes: nodes.length,
      configuredNodes: configuredNodes.length,
      missingCredentials: allMissingCredentials,
      nodes
    };
  }

  /**
   * Analyze individual node configuration
   */
  private analyzeNode(node: WorkflowNode): NodeConfigStatus {
    const configured: ConfiguredField[] = [];
    const needsCredentials: CredentialRequirement[] = [];
    const needsDecisions: DecisionRequirement[] = [];
    
    // Extract purpose from various possible locations
    const purpose = this.extractNodePurpose(node);
    
    // Check if this node type requires credentials from our auth requirements map
    const authReq = this.authRequirementsMap.get(node.type);
    
    if (authReq?.authenticationRequired) {
      const credTypes = authReq.authenticationDetails?.credentialTypes || ['credentials'];
      
      // List each credential type as a separate option
      credTypes.forEach((credType: string) => {
        needsCredentials.push({
          field: 'credentials',
          credentialType: credType,
          variable: credType.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
          description: credTypes.length > 1 
            ? `Option: ${credType}` 
            : `Requires ${credType}`,
          isAlternative: credTypes.length > 1
        } as CredentialRequirement);
      });
    }
    
    // Analyze parameters
    this.analyzeParameters(node, configured, needsCredentials, needsDecisions);
    
    // Determine overall status
    const status = this.determineNodeStatus(needsCredentials, needsDecisions, configured);
    
    return {
      id: node.id,
      name: node.name || node.id,
      type: node.type,
      purpose,
      status,
      configured,
      needsCredentials,
      needsDecisions,
      isReady: status === 'configured'
    };
  }

  /**
   * Extract node purpose from various fields
   */
  private extractNodePurpose(node: WorkflowNode): string {
    // Check various fields for purpose/description
    if (node.parameters?.notes) return node.parameters.notes;
    if (node.parameters?.description) return node.parameters.description;
    if ((node as any).purpose) return (node as any).purpose;
    if (node.notes) return node.notes;
    
    // Generate default based on node type
    return this.getDefaultPurpose(node.type);
  }

  /**
   * Analyze node parameters for configuration status
   */
  private analyzeParameters(
    node: WorkflowNode,
    configured: ConfiguredField[],
    needsCredentials: CredentialRequirement[],
    needsDecisions: DecisionRequirement[]
  ): void {
    const params = node.parameters || {};
    
    // Check authentication/credentials
    if (node.credentials) {
      Object.entries(node.credentials).forEach(([credType, credData]: [string, any]) => {
        if (!credData || !credData.id) {
          needsCredentials.push({
            field: 'credentials',
            credentialType: credType,
            variable: credType.toUpperCase(),
            description: `${credType} credentials required`
          });
        }
      });
    }
    
    // Analyze each parameter
    for (const [key, value] of Object.entries(params)) {
      // Skip metadata fields
      if (['notes', 'description'].includes(key)) continue;
      
      const valueStr = String(value);
      
      if (this.isPlaceholder(valueStr)) {
        needsDecisions.push({
          field: key,
          decision: 'Replace placeholder value',
          description: `Current value "${value}" appears to be a placeholder`
        });
      } else if (this.isCredentialExpression(valueStr)) {
        const variable = this.extractVariable(valueStr);
        needsCredentials.push({
          field: key,
          credentialType: this.getCredentialType(node.type, key),
          variable,
          description: `Credential or environment variable required`
        });
      } else if (this.isEmptyRequired(node.type, key, value)) {
        needsDecisions.push({
          field: key,
          decision: 'Provide required value',
          description: `Required field "${key}" is empty`
        });
      } else if (value !== "" && value !== null && value !== undefined) {
        configured.push({
          field: key,
          value: value,
          description: this.getFieldDescription(node.type, key)
        });
      }
    }
    
    // Check for common required fields based on node type
    this.checkRequiredFields(node, needsDecisions, params);
  }

  /**
   * Check if a value is a placeholder
   */
  private isPlaceholder(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    const lowerValue = value.toLowerCase();
    return this.placeholderPatterns.some(pattern => lowerValue.includes(pattern));
  }

  /**
   * Check if a value contains a credential expression
   */
  private isCredentialExpression(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    return this.credentialPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Extract variable name from expression
   */
  private extractVariable(value: string): string {
    const match = value.match(/\{\{\s*\$(?:vars|credentials|env)\.([^}]+)\}\}/);
    return match ? match[1] : 'UNKNOWN_VARIABLE';
  }

  /**
   * Check if a required field is empty
   */
  private isEmptyRequired(nodeType: string, field: string, value: any): boolean {
    const requiredFields = this.getRequiredFields(nodeType);
    return requiredFields.includes(field) && (!value || value === '');
  }

  /**
   * Get required fields for a node type
   */
  private getRequiredFields(nodeType: string): string[] {
    const requiredFieldsMap: Record<string, string[]> = {
      'n8n-nodes-base.httpRequest': ['url', 'method'],
      'n8n-nodes-base.webhook': ['path', 'httpMethod'],
      'n8n-nodes-base.googleSheets': ['documentId', 'sheetName'],
      'n8n-nodes-base.googleSheetsTrigger': ['documentId'],
      'n8n-nodes-base.postgres': ['database', 'table'],
      'n8n-nodes-base.mysql': ['database', 'table'],
      'n8n-nodes-base.mongodb': ['database', 'collection'],
    };
    
    return requiredFieldsMap[nodeType] || [];
  }

  /**
   * Check for required fields specific to node type
   */
  private checkRequiredFields(
    node: WorkflowNode,
    needsDecisions: DecisionRequirement[],
    params: Record<string, any>
  ): void {
    const requiredFields = this.getRequiredFields(node.type);
    
    for (const field of requiredFields) {
      if (!params[field] || params[field] === '') {
        // Check if not already marked as needing decision
        const alreadyMarked = needsDecisions.some(d => d.field === field);
        if (!alreadyMarked) {
          needsDecisions.push({
            field,
            decision: 'Provide required value',
            description: `Required field "${field}" is missing`,
            options: this.getFieldOptions(node.type, field)
          });
        }
      }
    }
  }

  /**
   * Get possible options for a field
   */
  private getFieldOptions(nodeType: string, field: string): string[] | undefined {
    if (field === 'method' || field === 'httpMethod') {
      return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    }
    if (field === 'operation') {
      // This would vary by node type
      return undefined;
    }
    return undefined;
  }

  /**
   * Determine overall node status
   */
  private determineNodeStatus(
    needsCredentials: CredentialRequirement[],
    needsDecisions: DecisionRequirement[],
    configured: ConfiguredField[]
  ): NodeConfigStatus['status'] {
    if (needsCredentials.length > 0 && needsDecisions.length > 0) {
      return 'partial';
    } else if (needsCredentials.length > 0) {
      return 'needs_credentials';
    } else if (needsDecisions.length > 0) {
      return 'needs_decisions';
    } else if (configured.length > 0) {
      return 'configured';
    } else {
      // Node has no configuration at all
      return 'needs_decisions';
    }
  }

  /**
   * Extract all missing credentials from nodes
   */
  private extractAllMissingCredentials(nodes: NodeConfigStatus[]): string[] {
    const credentials = new Set<string>();
    
    nodes.forEach(node => {
      node.needsCredentials.forEach(cred => {
        credentials.add(cred.variable);
      });
    });
    
    return Array.from(credentials);
  }

  /**
   * Get credential type based on node and field
   */
  private getCredentialType(nodeType: string, field: string): string {
    if (field.toLowerCase().includes('auth') || field.toLowerCase().includes('token')) {
      return 'API Key';
    }
    if (field.toLowerCase().includes('password')) {
      return 'Password';
    }
    if (field.toLowerCase().includes('secret')) {
      return 'Secret';
    }
    return 'Credential';
  }

  /**
   * Get field description
   */
  private getFieldDescription(nodeType: string, field: string): string {
    // This could be expanded with more detailed descriptions
    const descriptions: Record<string, string> = {
      url: 'API endpoint URL',
      method: 'HTTP method',
      path: 'Webhook path',
      documentId: 'Google Sheets document ID',
      sheetName: 'Sheet name',
      database: 'Database name',
      table: 'Table name',
      collection: 'Collection name',
    };
    
    return descriptions[field] || field;
  }

  /**
   * Get default purpose based on node type
   */
  private getDefaultPurpose(nodeType: string): string {
    const purposes: Record<string, string> = {
      'n8n-nodes-base.httpRequest': 'Make HTTP API request',
      'n8n-nodes-base.webhook': 'Receive webhook data',
      'n8n-nodes-base.code': 'Execute custom JavaScript code',
      'n8n-nodes-base.googleSheets': 'Read or write Google Sheets data',
      'n8n-nodes-base.googleSheetsTrigger': 'Monitor Google Sheets for changes',
      'n8n-nodes-base.postgres': 'Query PostgreSQL database',
      'n8n-nodes-base.mysql': 'Query MySQL database',
      'n8n-nodes-base.mongodb': 'Query MongoDB database',
      'n8n-nodes-base.merge': 'Merge data from multiple sources',
      'n8n-nodes-base.splitInBatches': 'Split data into batches',
      'n8n-nodes-base.if': 'Conditional branching',
      'n8n-nodes-base.switch': 'Multi-path branching',
      'n8n-nodes-base.xml': 'Convert between XML and JSON',
      'n8n-nodes-base.csv': 'Parse or generate CSV data',
      'n8n-nodes-base.emailSend': 'Send emails',
      'n8n-nodes-base.slack': 'Send messages to Slack',
    };
    
    return purposes[nodeType] || 'Process data';
  }
}

// Export singleton instance
let configAnalyzer: ConfigAnalyzer | null = null;

export function getConfigAnalyzer(): ConfigAnalyzer {
  if (!configAnalyzer) {
    configAnalyzer = new ConfigAnalyzer();
  }
  return configAnalyzer;
}