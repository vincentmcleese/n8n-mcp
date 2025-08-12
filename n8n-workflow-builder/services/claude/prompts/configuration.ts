/**
 * Configuration Phase Prompts
 * 
 * @deprecated This file is deprecated. Use ConfigurationPromptBuilder with configureprompt.md instead.
 * The new system provides better structure with proper node-level vs parameter-level property separation.
 * 
 * Migration path:
 * - Configuration prompts now come from ConfigurationPromptBuilder in /services/claude/config/prompt-builder.ts
 * - Template is in /services/claude/prompts/configureprompt.md
 * 
 * This file is kept temporarily for reference but will be removed in a future update.
 */

import { 
  PromptParts,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  addVersionMetadata
} from './common';
import { PREFILLS } from '../constants';

/**
 * Generate prompt for configuration phase
 */
export function getConfigurationPrompt(
  userIntent: string,
  selectedNodes: any[],
  nodeSchemas: any,
  nodeTemplates: any,
  nodeProperties: any,
  nodeDocumentation: any,
  enrichedContext: any,
  discoveredNodes: any[]
): PromptParts {
  const systemPrompt = `You are an n8n workflow configuration expert.

Your task: Configure the selected nodes based on the user's requirements.

You have:
1. The user's original request with their specific requirements
2. Node essentials showing the CORE properties and their structure
3. Task templates (when available) showing COMPLETE WORKING configurations
4. Property search results for any additional properties
5. Documentation excerpts (when available) explaining exact property formats
6. The purpose of each selected node

## Code Node Configuration
When working with Code nodes, always start by calling the relevant guide:
- tools_documentation({topic: "javascript_code_node_guide"}) for JavaScript Code nodes
- tools_documentation({topic: "python_code_node_guide"}) for Python Code nodes


CONFIGURATION PRIORITY ORDER:
1. If a task template is provided → Use it as your BASE configuration
2. If no template → Use the structure from node essentials
3. Only use property search results for properties NOT in template/essentials

CRITICAL RULES:
- Task templates are WORKING CONFIGURATIONS - trust their structure completely
- Node essentials show the REAL property names and nesting - follow them exactly
- NEVER invent or guess property names
- NEVER search for properties already shown in essentials or templates
- If essentials show nested structure (e.g., conditions.conditions), use that exact nesting. 
-Each field can only have ONE ={{ }} expression block. If you need multiple dynamic values in a string, wrap the ENTIRE string in a single ={{ }} block and use JavaScript template literals or concatenation inside.
- Properties with type: "fixedCollection" must have their data as: { "optionValue": [array] }
  where optionValue comes from options[].value in the essentials
- You must complete the JSON structure that has been started for you

Configuration Strategy:
1. START with task template if provided (it's already correct!)
2. Or START with essentials structure if no template
3. Fill in user-specific values (channels, messages, URLs, etc.)
4. Only add additional properties if explicitly needed and found in searches

Common Patterns to Follow:
- Task templates already have error handling (onError, retryOnFail) configured
- Essentials show if properties are nested (rules.values, conditions.conditions)
- Resource/operation pattern determines available sub-properties
- Some nodes use "text", others use "message" - check the template/essentials

Examples:
- Slack template shows: resource:"message", operation:"post", text:"" → Use "text" not "message"
- If essentials shows conditions.conditions[] → Put condition properties in that array
- HTTP template has complete auth/header structure → Don't recreate it

IMPORTANT: Trust the templates and essentials - they show WORKING configurations.

CRITICAL: Your entire response must be ONLY the JSON object below. Do not include any explanatory text, reasoning, or commentary outside the JSON:
{
  "operations": [
    {
      "type": "configureNode",
      "nodeId": "node_1",
      "config": {
        // Use EXACT structure from template/essentials, fill in user values
      }
    }
  ],
  "reasoning": ["Used task template as base", "Filled in user's channel: #general", "Template already had retry logic"]
}`;

  const userMessage = `User intent: "${userIntent}"
    
Selected nodes to configure:
${selectedNodes
  .map((nodeId) => {
    const node = discoveredNodes?.find((n: any) => n.id === nodeId);
    const schema = nodeSchemas[node?.type];
    const template = nodeTemplates[node?.type];
    const enriched = enrichedContext;

    let nodeInfo = `- ${nodeId}: ${node?.type || "unknown"} - ${
      node?.purpose || "no description"
    }`;

    // Add schema information if available
    if (schema) {
      nodeInfo += `\n  Schema/Required params: ${JSON.stringify(
        schema,
        null,
        2
      )}`;
    }

    // Add enriched context from hybrid approach
    if (enriched) {
      // Add all property search results dynamically
      Object.keys(enriched).forEach((key) => {
        if (key.endsWith("Properties") && enriched[key]) {
          const propertyType = key.replace("Properties", "");
          nodeInfo += `\n  ${
            propertyType.charAt(0).toUpperCase() + propertyType.slice(1)
          } properties found:`;
          nodeInfo += `\n    ${JSON.stringify(enriched[key], null, 4)}`;

          // Add specific guidance for common property types
          if (propertyType === "channel" || propertyType === "recipient") {
            nodeInfo += `\n    Note: These properties define where/to whom the message is sent`;
          } else if (
            propertyType === "message" ||
            propertyType === "content" ||
            propertyType === "text"
          ) {
            nodeInfo += `\n    Note: These properties define the message content`;
          } else if (propertyType === "auth") {
            nodeInfo += `\n    Note: Authentication is required for this node`;
          }
        }
      });

      if (enriched.taskTemplate) {
        nodeInfo += `\n  Task template available:`;
        nodeInfo += `\n    ${JSON.stringify(
          enriched.taskTemplate,
          null,
          4
        )}`;
        nodeInfo += `\n  IMPORTANT: Use this template as a starting point - it shows the exact field names and structure needed.`;
      }

      if (enriched.documentation) {
        const docPreview =
          enriched.documentation.length > 800
            ? enriched.documentation.substring(0, 800) + "..."
            : enriched.documentation;
        nodeInfo += `\n  Documentation excerpt:\n    ${docPreview}`;
      }
    }

    // Add property search results if available (legacy support)
    const props = nodeProperties[node?.type];
    if (props && Object.keys(props).length > 0) {
      nodeInfo += `\n  Additional discovered properties:`;
      for (const [keyword, properties] of Object.entries(props)) {
        nodeInfo += `\n    - ${keyword}: ${JSON.stringify(properties)}`;
      }
    }

    // Add documentation if available (legacy support)
    const docs = nodeDocumentation[node?.type];
    if (docs && !enriched?.documentation) {
      const docPreview =
        typeof docs === "string" && docs.length > 500
          ? docs.substring(0, 500) + "..."
          : docs;
      nodeInfo += `\n  Documentation: ${docPreview}`;
    }

    // Add template information if available (legacy support)
    if (template && !enriched?.taskTemplate) {
      nodeInfo += `\n  Pre-configured template available: ${JSON.stringify(
        template,
        null,
        2
      )}`;
      nodeInfo += `\n  You can use this template as a starting point and modify based on user's specific requirements.`;
    }

    return nodeInfo;
  })
  .join("\n")}
    
Configure each node based on:
1. The user's specific requirements in their original request
2. The node's purpose in this workflow
3. The schema/essentials provided above

Generate a configureNode operation for EACH selected node.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.CONFIGURATION
  }, 'configuration');
}

/**
 * Analyze what MCP information is needed for a node
 */
export function getNodeRequirementsPrompt(
  node: any,
  userPrompt: string,
  nodeEssentials: any
): PromptParts {
  const systemPrompt = `You are an n8n workflow configuration expert analyzing what information is needed to properly configure a node.

Given:
1. The node type and purpose
2. The user's original request
3. The node essentials (basic properties)

CRITICAL RULES:
- CAREFULLY READ the node essentials to understand the ACTUAL property structure
- NEVER guess property names - use ONLY properties shown in essentials
- Look for nested structures (e.g., conditions.conditions, rules.values)
- If a property has options/choices, note the exact option values
- Task templates show WORKING configurations - suggest them when appropriate

Analyze the essentials to determine:
1. What properties are already available in essentials (DON'T search for these)
2. What SPECIFIC additional properties might be needed (based on essentials structure)
3. Whether a task template would provide a good starting configuration

Key Analysis Points:
1. Authentication: Does this node need credentials? (check essentials for auth indicators)
2. Required Properties: What properties are marked as required in essentials?
3. Operation Structure: Does the node use resource/operation pattern? What are the options?
4. Nested Properties: Are there nested structures like conditions, rules, filters?
5. Task Templates: Is there a pre-configured template that matches the use case?

IMPORTANT: 
- If essentials show nested properties (e.g., conditions.conditions), that's the structure
- If essentials show a property with options, use those exact option values
- DON'T search for properties that are already in essentials
- DON'T invent property names that aren't referenced in essentials
- DO suggest task templates when they match the user's intent

Available MCP tools:
- search_node_properties(nodeType, query) - ONLY for properties NOT in essentials
- get_node_for_task(taskName) - Get complete working configurations
- get_node_documentation(nodeType) - For complex nodes needing usage examples

Example good analysis:
- Essentials shows "conditions" with nested "conditions" array → use that structure
- Essentials shows "resource" with options ["message", "channel"] → use those values
- User wants to send Slack message → suggest "send_slack_message" task

Example bad analysis:
- Searching for "operator" when essentials shows it's inside conditions.conditions[].operator
- Searching for "message" when essentials already shows a "text" property
- Guessing property names like "leftValue" without checking essentials structure

You need to complete the JSON structure that has been started for you.
The JSON should contain:
- needsAuth: boolean indicating if node needs authentication
- needsProperties: Array of properties NOT in essentials that need to be searched
- suggestedTask: Task name if a template matches the use case, or null
- needsDocumentation: boolean, only true for very complex nodes
- reasoning: Array of analysis reasoning`;

  const userMessage = `Node: ${node.type} (${node.id})
Purpose: ${node.purpose}
User's request: "${userPrompt}"

Node essentials:
${JSON.stringify(nodeEssentials, null, 2)}

What additional MCP information would help configure this node properly?`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.NODE_REQUIREMENTS
  }, 'configuration');
}

/**
 * Fix node configuration based on validation errors
 */
export function getFixNodeConfigPrompt(
  node: any,
  config: any,
  validationErrors: string[],
  nodeContext: any
): PromptParts {
  const systemPrompt = `You are an n8n workflow configuration expert.

A node configuration has validation errors that need to be fixed.

You have:
1. The node information and its purpose
2. The current configuration that failed validation
3. The validation errors
4. The node essentials and any additional context

Your task:
- Analyze the validation errors carefully
- Fix the configuration to resolve all errors
- If a field name in the error doesn't match what you see in the configuration, it might be a display name
- Look at the node properties and essentials to find the correct field name
- Ensure the fixed configuration still meets the user's requirements
- Only change what's necessary to fix the errors

Common field name mappings:
- "Send Message To" in Slack: use "select" field with value "channel" or "user", then provide "channelId" for the channel
- "Message" might be "text" or "message"  
- Display names often have spaces, actual field names typically use camelCase

Example for Slack message:
{
  "resource": "message",
  "operation": "post",
  "select": "channel",  // This satisfies "Send Message To"
  "channelId": "#general",  // The actual channel
  "text": "Your message here"
}

IMPORTANT: You must complete the JSON configuration object that has been started for you. Return ONLY the fixed configuration object, no explanations.`;

  // Build context information
  let contextInfo = "";

  if (nodeContext.essentials) {
    contextInfo += `Node essentials (available options):\n${JSON.stringify(
      nodeContext.essentials,
      null,
      2
    )}\n\n`;
  }

  if (nodeContext.authProperties) {
    contextInfo += `Authentication properties:\n${JSON.stringify(
      nodeContext.authProperties,
      null,
      2
    )}\n\n`;
  }

  if (nodeContext.taskTemplate) {
    contextInfo += `Task template (reference):\n${JSON.stringify(
      nodeContext.taskTemplate,
      null,
      2
    )}\n\n`;
  }

  if (nodeContext.documentation) {
    const docPreview =
      nodeContext.documentation.length > 1000
        ? nodeContext.documentation.substring(0, 1000) + "..."
        : nodeContext.documentation;
    contextInfo += `Documentation excerpt:\n${docPreview}\n\n`;
  }

  const userMessage = `Node: ${node.type} (${node.id})
Purpose: ${node.purpose}

Current configuration that failed:
${JSON.stringify(config, null, 2)}

Validation errors:
${validationErrors.map((err, idx) => `${idx + 1}. ${err}`).join("\n")}

${contextInfo}

Generate the fixed configuration:`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.NODE_CONFIG
  }, 'configuration');
}

/**
 * Generate prompt for configuration fixes based on validation errors
 * PRIORITIZES the validation's own fix suggestions and autofix objects
 */
export function getConfigurationFixesPrompt(
  nodeId: string,
  nodeType: string,
  currentConfig: any,
  validationResult: any
): PromptParts {
  const systemPrompt = `You are an n8n workflow configuration expert fixing validation errors.

CRITICAL: The validation result contains SPECIFIC FIX INSTRUCTIONS that you MUST follow!

Priority order for fixes:
1. If "autofix" object exists → Apply those exact property values
2. If error has "fix" field → Follow that instruction exactly
3. If "suggestions" exist → Consider those improvements
4. If "examples" exist → Use as reference for correct structure
5. ONLY use MCP tools if the fix requires discovering new information

The validation tells you EXACTLY what's wrong and how to fix it. Don't overthink it!

Common fix patterns from validation:
- "Invalid value for 'operation'. Must be one of: X" → Change operation to X
- "Property 'X' is configured but won't be used" → Remove property X
- "Missing required property 'X'" → Add property X with appropriate value
- "Outdated typeVersion: X. Latest is Y" → Update typeVersion to Y

Response format:
{
  "fixedConfig": {
    // The complete CORRECTED configuration
    // Apply ALL fixes from validation
    // Include all original valid properties
  },
  "reasoning": [
    "Applied autofix for onError property",
    "Changed operation from 'message' to 'complete' as instructed",
    "Removed unused modelId property as suggested",
    "Updated typeVersion from 1 to 2"
  ]
}

IMPORTANT:
- Return the COMPLETE fixed configuration, not just changes
- Each reasoning entry should explain which validation fix was applied
- Trust the validation's fix suggestions - they are correct!`;

  const userMessage = `Fix configuration for ${nodeType} (${nodeId})

Current configuration:
${JSON.stringify(currentConfig, null, 2)}

Validation result with fix instructions:
${JSON.stringify(validationResult, null, 2)}

${validationResult.autofix ? `
AUTOFIX PROVIDED - Apply these exact values:
${JSON.stringify(validationResult.autofix, null, 2)}
` : ''}

${validationResult.errors?.length > 0 ? `
ERRORS TO FIX (${validationResult.errors.length}):
${validationResult.errors.map((e: any, i: number) => 
  `${i + 1}. ${e.message}${e.fix ? `\n   FIX: ${e.fix}` : ''}`
).join('\n')}
` : ''}

${validationResult.suggestions?.length > 0 ? `
SUGGESTIONS TO CONSIDER:
${validationResult.suggestions.map((s: any, i: number) => 
  `${i + 1}. ${s.message || s}`
).join('\n')}
` : ''}

${validationResult.examples?.length > 0 ? `
WORKING EXAMPLES FOR REFERENCE:
${JSON.stringify(validationResult.examples[0], null, 2)}
` : ''}

Apply ALL the fixes suggested by the validation and return the complete corrected configuration.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: '{"fixedConfig":'
  }, 'configuration');
}

export const ConfigurationPrompts = {
  getConfigurationPrompt,
  getNodeRequirementsPrompt,
  getFixNodeConfigPrompt,
  getConfigurationFixesPrompt,
};