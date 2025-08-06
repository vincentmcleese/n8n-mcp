/**
 * Building Phase Prompts
 * 
 * Prompts for building workflow structure and connections.
 */

import { 
  PromptParts,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  ERROR_HANDLING_RULES,
  NODE_NAMING_RULES,
  addVersionMetadata
} from './common';
import { PREFILLS } from '../constants';

/**
 * Generate prompt for building phase
 */
export function getBuildingPrompt(
  userIntent: string,
  configuredNodes: any[]
): PromptParts {
  const systemPrompt = `You are an n8n workflow building expert. Your task is to BUILD a workflow structure from configured nodes.

You have:
1. Validated, configured nodes with all parameters set
2. The user's original intent/request
3. Each node's purpose in the workflow

Your task:
- Connect the nodes in logical flow based on their purposes
- Add appropriate error handling using onError property (NOT continueOnFail)
- Use n8n expressions where needed ($json, $node["NodeName"].json)
- Position nodes for clear visual layout
- Create a workflow that fulfills the user's intent
- You must complete the JSON structure that has been started for you (workflow name)

IMPORTANT: This is the BUILDING phase only. DO NOT validate the workflow - just build the structure.

Node positioning guidelines:
- Start triggers/webhooks on the left (x=250)
- Space nodes 300px apart horizontally
- Align nodes vertically for clarity
- Keep related nodes close together

Connection guidelines:
- Connect nodes based on data flow logic
- Triggers/webhooks connect to processing nodes
- Processing nodes connect to output/action nodes
- Consider the purpose of each node when connecting
- CRITICAL: Connection format uses node NAMES as both keys AND targets:
  connections: {
    "Webhook Trigger": { main: [[{ node: "Send to Slack", type: "main", index: 0 }]] },
    "Send to Slack": { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] }
  }
  The connection object MUST be properly formatted with "node", "type", and "index" properties

Error handling (use onError property, NOT continueOnFail):
- Webhooks/triggers: onError="stopWorkflow" (stop on error)
- Data processing: onError="continueRegularOutput" (continue on error)
- External APIs: onError="continueErrorOutput" with retryOnFail=true
- Critical operations: onError="stopWorkflow" (stop workflow)
- NEVER use both continueOnFail and onError together!

Return a complete n8n workflow JSON following this EXACT format:
{
  "name": "Descriptive Workflow Name",
  "nodes": [
    {
      "id": "node_1",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "webhook-endpoint"
      },
      "onError": "stopWorkflow"
    },
    {
      "id": "node_2",
      "name": "AI Chat",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1,
      "position": [550, 300],
      "parameters": {
        "model": "gpt-4",
        "options": {}
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "AI Chat", "type": "main", "index": 0}]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveDataSuccessExecution": "all",
    "saveDataErrorExecution": "all",
    "saveManualExecutions": true
  },
  "reasoning": ["Connected webhook to AI for processing", "..."]
}

CRITICAL FORMAT RULES:
- Node types MUST use the EXACT type from the configured nodes - DO NOT modify the type!
- The configured nodes already have the correct prefixes:
  * Regular nodes: "n8n-nodes-base." (e.g., "n8n-nodes-base.webhook", "n8n-nodes-base.slack")
  * Langchain nodes: "@n8n/n8n-nodes-langchain." (e.g., "@n8n/n8n-nodes-langchain.lmChatOpenAi")
- Connections MUST use node NAMES as keys (e.g., "Webhook" not "node_1")
- saveDataSuccessExecution and saveDataErrorExecution MUST be "all" (string) not true (boolean)
- Each node MUST have a typeVersion field (usually 1 or 2)
- The workflow MUST have a descriptive "name" field at the top level`;

  const userMessage = `User's intent: "${userIntent}"
    
Validated nodes to connect:
${configuredNodes
  .map(
    (node: any, index: number) =>
      `${index + 1}. ${node.type} (${node.id})
   Purpose: ${node.purpose}
   Configuration: ${JSON.stringify(node.config, null, 2)}`
  )
  .join("\n\n")}

Build a complete n8n workflow that:
1. Connects these nodes in logical order
2. Fulfills the user's original intent
3. Includes proper error handling
4. Uses clear node positioning`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.BUILDING
  }, 'building');
}

export const BuildingPrompts = {
  getBuildingPrompt,
};