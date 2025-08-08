/**
 * Configuration Rules Engine
 * 
 * Category-specific rules for node configuration
 */

export interface CategoryRule {
  priority: number;
  prompt: string;
  examples?: Record<string, any>;
  contextNeeded?: string[];
}

export const CONFIGURATION_RULES: Record<string, CategoryRule> = {
  code: {
    priority: 1,
    prompt: `For Code nodes:
- Use JavaScript mode by default
- Access input data via: $input.all() for all items, $input.item for single item
- Return data as: return [{json: yourData}] for single output
- Use return items array for multiple outputs
- Handle errors with try/catch blocks`,
    examples: {
      basic: `return [{
  json: {
    result: $input.all()[0].json.value * 2
  }
}];`
    }
  },
  
  ai: {
    priority: 2,
    prompt: `For AI/LangChain nodes:
- Select appropriate model based on task complexity
- Use temperature 0.3 for factual/structured tasks
- Use temperature 0.7 for creative tasks
- Map variables using {{ }} syntax: {{$json.fieldName}}
- Include system prompts for consistent behavior`,
    contextNeeded: ['modelPreference', 'taskType']
  },
  
  database: {
    priority: 3,
    prompt: `For Database nodes:
- Use parameterized queries to prevent SQL injection
- Specify only needed columns for performance
- Handle transactions appropriately
- Use proper error handling for connection issues
- Consider connection pooling settings`
  },
  
  webhook: {
    priority: 4,
    prompt: `For Webhook nodes:
- Set appropriate response mode (immediately, last node, etc.)
- Use unique webhook paths
- Configure authentication if needed
- Set proper HTTP methods
- Handle response codes correctly`
  },
  
  trigger: {
    priority: 5,
    prompt: `For Trigger nodes:
- Configure activation conditions
- Set polling intervals appropriately
- Handle authentication for external services
- Consider rate limits and quotas
- Implement proper error handling`
  },
  
  transform: {
    priority: 6,
    prompt: `For Transform nodes:
- Map input fields to output structure
- Handle data type conversions
- Implement validation logic
- Consider null/undefined handling
- Use expressions for dynamic values: {{$json.field}}`
  },
  
  output: {
    priority: 7,
    prompt: `For Output nodes (Slack, Email, etc.):
- Set recipient/channel correctly
- Format messages with variables: {{$json.fieldName}}
- Configure authentication credentials
- Handle rate limits
- Implement retry logic for failures`
  },
  
  condition: {
    priority: 8,
    prompt: `For Condition/IF nodes:
- Use expressions: {{$json.field}} for field access
- Define clear branch conditions
- Add fallback/else branch
- Handle type coercion properly
- Consider null/undefined cases`
  },
  
  http: {
    priority: 9,
    prompt: `For HTTP Request nodes:
- Set correct HTTP method (GET, POST, etc.)
- Configure headers properly
- Handle authentication (Bearer, Basic, etc.)
- Set appropriate timeouts
- Parse response format correctly`
  }
};

/**
 * Get configuration rules for a node category
 */
export function getCategoryRules(category: string, nodeType?: string): string {
  // First check for specific node type rules
  if (nodeType) {
    // Special handling for specific node types
    if (nodeType.includes('code')) return CONFIGURATION_RULES.code.prompt;
    if (nodeType.includes('webhook')) return CONFIGURATION_RULES.webhook.prompt;
    if (nodeType.includes('httpRequest')) return CONFIGURATION_RULES.http.prompt;
    if (nodeType.includes('if') || nodeType.includes('switch')) return CONFIGURATION_RULES.condition.prompt;
    if (nodeType.includes('agent') || nodeType.includes('chain')) return CONFIGURATION_RULES.ai.prompt;
    if (nodeType.includes('postgres') || nodeType.includes('mysql')) return CONFIGURATION_RULES.database.prompt;
  }
  
  // Fall back to category-based rules
  const categoryLower = category?.toLowerCase() || '';
  
  if (categoryLower === 'trigger') return CONFIGURATION_RULES.trigger.prompt;
  if (categoryLower === 'transform') return CONFIGURATION_RULES.transform.prompt;
  if (categoryLower === 'output') return CONFIGURATION_RULES.output.prompt;
  if (categoryLower === 'input') return CONFIGURATION_RULES.trigger.prompt;
  
  // Default rules
  return `For ${category || 'this'} node:
- Configure all required properties
- Use appropriate authentication
- Handle errors gracefully
- Follow n8n best practices`;
}

/**
 * Get examples for a category if available
 */
export function getCategoryExamples(category: string): Record<string, any> | undefined {
  const rule = CONFIGURATION_RULES[category];
  return rule?.examples;
}

/**
 * Check if additional context is needed for a category
 */
export function needsAdditionalContext(category: string): string[] {
  const rule = CONFIGURATION_RULES[category];
  return rule?.contextNeeded || [];
}