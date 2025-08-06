/**
 * Common Prompt Fragments and Utilities
 * 
 * Shared prompt components used across different phases.
 * Helps maintain consistency and reduce duplication.
 */

// ==========================================
// Type Definitions
// ==========================================

export interface PromptParts {
  system: string;
  user: string;
  prefill?: string;
  version?: string;
  metadata?: {
    phase: string;
    timestamp?: number;
    sessionId?: string;
  };
}

export interface PromptContext {
  userIntent: string;
  sessionId?: string;
  [key: string]: any;
}

// ==========================================
// Common System Prompt Fragments
// ==========================================

/**
 * Base instructions for all n8n workflow operations
 */
export const BASE_N8N_CONTEXT = `You are an n8n workflow automation expert with deep knowledge of:
- n8n node types and their capabilities
- Workflow design patterns and best practices
- Node configuration and parameter structures
- Connection logic and data flow
- Error handling and retry strategies`;

/**
 * JSON output instructions
 */
export const JSON_OUTPUT_RULES = `CRITICAL: Your entire response must be ONLY valid JSON. 
Do not include any explanatory text, reasoning, or commentary outside the JSON structure.
The JSON must be complete and properly formatted.
Do not add any text after the closing bracket/brace.`;

/**
 * Error handling instructions
 */
export const ERROR_HANDLING_RULES = `Error handling best practices:
- Webhooks/triggers: use onError="stopWorkflow" to halt on errors
- Data processing: use onError="continueRegularOutput" to continue with regular output
- External APIs: use onError="continueErrorOutput" with retryOnFail=true for resilience
- Critical operations: use onError="stopWorkflow" to prevent data corruption
- NEVER use both continueOnFail and onError properties together`;

/**
 * Node naming conventions
 */
export const NODE_NAMING_RULES = `Node naming conventions:
- Use descriptive, action-oriented names (e.g., "Send Slack Message", "Transform Data")
- Avoid generic names like "Node1" or "HTTP Request"
- Use title case for consistency
- Keep names concise but clear`;

/**
 * MCP tool instructions
 */
export const MCP_TOOL_CONTEXT = `Available MCP tools for n8n operations:
- search_nodes({query}) - Search for nodes by functionality
- get_node_essentials(nodeType) - Get core properties and structure
- get_node_for_task(taskName) - Get complete working configurations
- search_node_properties(nodeType, query) - Find specific properties
- validate_workflow() - Validate overall workflow structure
- validate_node_operation(node, operation) - Validate node configuration`;

// ==========================================
// Common User Message Templates
// ==========================================

/**
 * Format user intent for analysis
 */
export function formatUserIntent(intent: string, context?: string): string {
  let message = `User wants to: "${intent}"`;
  
  if (context) {
    message += `\n\nAdditional context:\n${context}`;
  }
  
  return message;
}

/**
 * Format node list for Claude
 */
export function formatNodeList(nodes: any[], title: string = "Available nodes"): string {
  if (!nodes || nodes.length === 0) {
    return `${title}: No nodes available`;
  }
  
  let formatted = `${title}:\n`;
  nodes.forEach((node, index) => {
    formatted += `${index + 1}. ${node.type || node.nodeType} - ${node.displayName || node.name}`;
    if (node.description) {
      formatted += `: ${node.description}`;
    }
    if (node.category) {
      formatted += ` (Category: ${node.category})`;
    }
    formatted += '\n';
  });
  
  return formatted;
}

/**
 * Format validation errors for fixing
 */
export function formatValidationErrors(errors: any[]): string {
  if (!errors || errors.length === 0) {
    return 'No validation errors found';
  }
  
  return errors.map((err, idx) => 
    `${idx + 1}. ${err.message || err}`
  ).join('\n');
}

// ==========================================
// Prompt Enhancement Utilities
// ==========================================

/**
 * Add examples to a prompt
 */
export function addExamples(basePrompt: string, examples: string[]): string {
  if (!examples || examples.length === 0) {
    return basePrompt;
  }
  
  return `${basePrompt}

Examples:
${examples.map((ex, idx) => `${idx + 1}. ${ex}`).join('\n')}`;
}

/**
 * Add constraints to a prompt
 */
export function addConstraints(basePrompt: string, constraints: string[]): string {
  if (!constraints || constraints.length === 0) {
    return basePrompt;
  }
  
  return `${basePrompt}

Constraints:
${constraints.map(c => `- ${c}`).join('\n')}`;
}

/**
 * Add expected output format
 */
export function addOutputFormat(basePrompt: string, format: string): string {
  return `${basePrompt}

Expected output format:
${format}`;
}

// ==========================================
// Common Reasoning Patterns
// ==========================================

/**
 * Generate reasoning steps for workflow operations
 */
export function generateReasoningSteps(operations: any[]): string[] {
  return operations.map(op => {
    switch (op.type) {
      case 'discoverNode':
        return `Discovered ${op.node.type} for ${op.node.purpose}`;
      case 'selectNode':
        return `Selected node ${op.nodeId} for the workflow`;
      case 'configureNode':
        return `Configured ${op.nodeId} with required parameters`;
      case 'addConnection':
        return `Connected ${op.from} to ${op.to}`;
      case 'addStickyNote':
        return `Added documentation for workflow section`;
      default:
        return `Performed ${op.type} operation`;
    }
  });
}

// ==========================================
// Prompt Versioning
// ==========================================

/**
 * Version tracking for prompts
 */
export const PROMPT_VERSIONS = {
  discovery: '1.0.0',
  configuration: '1.0.0',
  building: '1.0.0',
  validation: '1.0.0',
  documentation: '1.0.0',
} as const;

/**
 * Add version metadata to prompt
 */
export function addVersionMetadata(
  prompt: PromptParts, 
  phase: keyof typeof PROMPT_VERSIONS
): PromptParts {
  return {
    ...prompt,
    version: PROMPT_VERSIONS[phase],
    metadata: {
      ...prompt.metadata,
      phase,
      timestamp: Date.now(),
    }
  };
}

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate that a prompt has all required parts
 */
export function validatePrompt(prompt: PromptParts): boolean {
  return !!(
    prompt.system && 
    prompt.user && 
    typeof prompt.system === 'string' && 
    typeof prompt.user === 'string'
  );
}

/**
 * Sanitize user input for inclusion in prompts
 */
export function sanitizeUserInput(input: string): string {
  // Remove any potential prompt injection attempts
  return input
    .replace(/system:/gi, 'user-input-system:')
    .replace(/assistant:/gi, 'user-input-assistant:')
    .replace(/human:/gi, 'user-input-human:')
    .trim();
}

// ==========================================
// Export Common Prompt Utilities
// ==========================================

export const CommonPrompts = {
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  ERROR_HANDLING_RULES,
  NODE_NAMING_RULES,
  MCP_TOOL_CONTEXT,
  formatUserIntent,
  formatNodeList,
  formatValidationErrors,
  addExamples,
  addConstraints,
  addOutputFormat,
  generateReasoningSteps,
  addVersionMetadata,
  validatePrompt,
  sanitizeUserInput,
};