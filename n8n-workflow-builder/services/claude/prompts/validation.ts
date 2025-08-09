/**
 * Validation Phase Prompts
 * 
 * Prompts for validating and fixing workflow configurations.
 */

import { 
  PromptParts,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  MCP_TOOL_CONTEXT,
  addVersionMetadata
} from './common';
import { PREFILLS } from '../constants';

/**
 * Generate prompt for validation phase
 */
export function getValidationPrompt(draftWorkflow: any): PromptParts {
  const systemPrompt = `You are an n8n workflow validation expert. Your job is to validate and fix workflows by calling MCP tools and reasoning through solutions.

You have:
1. A draft workflow that needs validation and fixing
2. Access to ALL n8n MCP tools to discover how to fix issues

PROCESS:
1. FIRST, call tools_documentation() to understand all available MCP tools and their purposes

2. Then run the three validation tools to find all issues:
   - validate_workflow() - for overall validation
   - validate_workflow_connections() - for connection structure
   - validate_workflow_expressions() - for expression syntax

3. For EACH error found, use MCP tools to discover the correct fix:
   - If a node is missing required fields: 
     * Call get_node_essentials(nodeType) to see all available properties
     * Call get_node_for_task() to get a working example configuration
     * Call validate_node_operation() with your proposed fix to verify it's correct
   - If an expression is wrong: Fix the syntax (e.g., $node["Name"].json)
   - If connections are invalid: Fix or remove them
   - If the workflow lacks a trigger: Call get_node_for_task("receive_webhook") to add one
   - For Slack specifically: Call get_node_for_task("send_slack_message") to see the correct properties
   - NEVER guess property names - always use MCP tools to find the correct ones

4. Apply all fixes to create a corrected workflow

5. Re-validate the fixed workflow with all three validation tools to ensure it's production-ready

6. After completing ALL tool calls and analysis, return your final result

RESPONSE FORMAT:
After you've completed ALL tool calls and analysis, return your response in this exact format:

=== BEGIN RESULT ===
{
  "workflow": { 
    "name": "string",
    "nodes": [...],
    "connections": {...},
    "settings": {...},
    "valid": true
  },
  "validationReport": {...},
  "reasoning": [...]
}
=== END RESULT ===

The JSON must be between the === markers. This ensures we can parse it correctly.`;

  const userMessage = `Here is the draft workflow to validate:

${JSON.stringify(draftWorkflow, null, 2)}

Please:
1. Run all three validation tools on this workflow
2. Fix any issues found
3. Re-validate after fixes
4. Return the final validated workflow with a complete report`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: undefined // No prefill for this phase
  }, 'validation');
}

/**
 * Generate prompt for validation fixes
 */
export function getValidationFixesPrompt(errors: any[], workflow: any): PromptParts {
  const systemPrompt = `You are an n8n workflow validation expert. Your job is to analyze validation errors and generate fix operations with clear reasoning.

IMPORTANT: You must return a JSON object with both fixes array and reasoning array explaining each fix.

When you see errors about node-level properties being in the wrong location:
- Properties like onError, retryOnFail, maxTries, waitBetweenTries, alwaysOutputData, executeOnce, continueOnFail MUST be at the node level, NOT inside parameters
- The error message tells you exactly which properties need to be moved
- Generate updateField operations for these properties (not updateParameter)
- The applyFixes function will place them at the correct level based on the property name

Example: If error says "Node-level properties onError, retryOnFail are in the wrong location", generate:
{
  "fixes": [
    { "type": "updateField", "nodeId": "node_id", "field": "onError", "value": "continueErrorOutput" },
    { "type": "updateField", "nodeId": "node_id", "field": "retryOnFail", "value": true }
  ],
  "reasoning": [
    "Moving onError property to node level for proper error handling",
    "Enabling retry on fail with default retry settings for resilience"
  ]
}

Fix operation types:
- addField: Add a missing field to a node
  { type: "addField", nodeId: "node_id", field: "fieldName", value: "fieldValue" }
  
- updateField: Update an existing field
  { type: "updateField", nodeId: "node_id", field: "fieldName", value: "newValue" }
  
- removeField: Remove a field from a node
  { type: "removeField", nodeId: "node_id", field: "fieldName" }
  
- addConnection: Add a missing connection
  { type: "addConnection", from: "sourceNodeName", to: "targetNodeName" }
  
- removeConnection: Remove an invalid connection
  { type: "removeConnection", from: "sourceNodeName", to: "targetNodeName" }
  
- addNode: Add a missing node (like a trigger)
  { type: "addNode", node: { id: "node_id", name: "Node Name", type: "node.type", ... } }
  
- updateWorkflowSettings: Update workflow settings
  { type: "updateWorkflowSettings", settings: { executionOrder: "v1", ... } }
  
- setWorkflowName: Set workflow name
  { type: "setWorkflowName", name: "Workflow Name" }

CRITICAL: 
- For each error, generate the minimal fix needed
- Use the actual field names from the error messages, not display names
- Provide clear reasoning for each fix explaining why it's necessary
- The reasoning array should have one entry per fix operation`;

  const userMessage = `Validation errors found:
${JSON.stringify(errors, null, 2)}

Current workflow structure:
- Nodes: ${workflow.nodes
  ?.map((n: any) => `${n.name} (id: ${n.id}, type: ${n.type})`)
  .join(", ")}
- Has connections: ${Object.keys(workflow.connections || {}).length > 0}
- Has name: ${!!workflow.name}

Important context:
- Look at the error messages carefully - they contain the exact field names needed
- The "property" field in the error often shows the actual field name to use
- If an error says a property is missing, use addField with that exact property name
- For operation errors, check the valid options listed in the error message

Generate fix operations for these errors with reasoning. Return a JSON object with "fixes" array and "reasoning" array.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: '{"fixes":['
  }, 'validation');
}

/**
 * Generate prompt for entity-based validation fixes
 */
export function getEntityFixesPrompt(
  errors: any[], 
  entities: { nodes?: any[]; connections?: any },
  workflow: any
): PromptParts {
  const systemPrompt = `You are an n8n workflow validation expert. Fix validation errors by returning COMPLETE, CORRECTED entities.

CRITICAL RULES:
1. When fixing nodes: Return the ENTIRE node object with ALL fields corrected
2. When fixing connections: Return the ENTIRE connections object with proper structure
3. Connections MUST use node NAMES as keys, NOT node IDs!

Connection structure example:
{
  "Webhook": {     // ← Use node NAME, not ID
    "main": [[{ 
      "node": "Code",  // ← Use target node NAME, not ID
      "type": "main", 
      "index": 0 
    }]]
  }
}

For missing connections:
- Connect nodes in logical flow (trigger → process → output)
- Webhook/Schedule should typically be first
- Connect each node to the next logical step

Expression syntax rules:
- n8n does NOT allow multiple {{ }} in one field
- Use a SINGLE {{ }} with template literals inside

WRONG: "Alert: {{ $json.category }} - {{ $json.status }}"
RIGHT: "{{ \`Alert: \${$json.category} - \${$json.status}\` }}"

WRONG: "Report for {{ new Date().toLocaleDateString() }}"
RIGHT: "{{ \`Report for \${new Date().toLocaleDateString()}\` }}"

Fix any "nested expression" errors by converting to single expression format.

Response format:
{
  "fixedNodes": [/* complete fixed node objects */],
  "fixedConnections": {/* complete fixed connections object if needed */},
  "reasoning": ["explanation for each major fix"]
}`;

  const userMessage = `Validation errors found:
${JSON.stringify(errors, null, 2)}

${entities.nodes ? `Nodes to fix (${entities.nodes.length}):
${entities.nodes.map(n => `- ${n.name} (id: ${n.id}, type: ${n.type})`).join('\n')}

Full node objects:
${JSON.stringify(entities.nodes, null, 2)}` : ''}

${entities.connections ? `Current connections object (needs fixing):
${JSON.stringify(entities.connections, null, 2)}

Remember: Connection keys must use node NAMES, not IDs!
Available nodes in workflow:
${workflow.nodes?.map((n: any) => `- Name: "${n.name}", ID: "${n.id}"`).join('\n')}` : ''}

Fix the reported issues in these entities.
Return complete, corrected versions.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: '{"'
  }, 'validation');
}

export const ValidationPrompts = {
  getValidationPrompt,
  getValidationFixesPrompt,
  getEntityFixesPrompt,
};