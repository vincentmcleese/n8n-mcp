/**
 * Discovery Phase Prompts
 *
 * Prompts for discovering and selecting n8n nodes based on user intent.
 */

import {
  PromptParts,
  PromptContext,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  formatUserIntent,
  formatNodeList,
  addVersionMetadata,
  sanitizeUserInput,
} from "./common";
import { PREFILLS } from "../constants";

// ==========================================
// Intent Analysis Prompts
// ==========================================

/**
 * Generate prompt for analyzing user intent
 */
export function getIntentAnalysisPrompt(userPrompt: string): PromptParts {
  const systemPrompt = `${BASE_N8N_CONTEXT}

You are an n8n workflow intent and logic analyzer.

## Your Task
1. Understand the complete outcome the user wants
2. Map out the logical flow required to achieve it
3. Match capabilities to EXACT task names from the list below
4. For unmatched capabilities, provide optimized search terms
5. ONLY ask for clarification if the END GOAL is unclear

## Available n8n Task Templates (use these EXACT names in matched_tasks)
These pre-configured tasks cover common workflow patterns:

### Webhooks (3 tasks)
- receive_webhook - Set up a webhook to receive data from external services
- webhook_with_response - Receive webhook and send custom response
- webhook_with_error_handling - Webhook that gracefully handles processing errors

### Communication (2 tasks)
- send_slack_message - Send a message to Slack channel
- send_email - Send an email notification

### Database/PostgreSQL (3 tasks)
- query_postgres - Query data from PostgreSQL database
- insert_postgres_data - Insert data into PostgreSQL table
- database_transaction_safety - Database operations with proper error handling

### API/HTTP (4 tasks)
- get_api_data - Make a simple GET request to retrieve data from an API
- post_json_request - Send JSON data to an API endpoint
- call_api_with_auth - Make an authenticated API request
- api_call_with_retry - Resilient API call with automatic retry on failure

### AI/LLM (4 tasks)
- chat_with_ai - Send a message to an AI model and get response
- ai_agent_workflow - Create an AI agent that can use tools
- multi_tool_ai_agent - AI agent with multiple tools for complex automation
- ai_rate_limit_handling - AI API calls with rate limit handling

### Data Processing (4 tasks)
- transform_data - Transform/modify data structure or format using JavaScript
- filter_data - Filter items based on conditions - ALWAYS use this for "if", "when", "only if", conditional logic
- process_webhook_data - Process incoming webhook data with Code node
- fault_tolerant_processing - Data processing that continues despite individual item failures

### Error Handling (1 task)
- modern_error_handling_patterns - Examples of modern error handling using onError property

### Tool Usage (2 tasks)
- use_google_sheets_as_tool - Use Google Sheets as an AI tool for reading/writing data
- use_slack_as_tool - Use Slack as an AI tool for sending notifications

## Logic Flow Analysis
Before identifying capabilities, trace through:
- What triggers the workflow?
- What data is received/fetched?
- What decisions/conditions are needed?
- What transformations must occur?
- What is the final output/action?
- What error handling is required?

## When to Ask for Clarification
ASK only when the END GOAL is unclear:
- "Process data" → ASK: "What should happen to the processed data?"
- "Handle webhooks" → ASK: "What should be done with webhook data?"

DO NOT ASK when implementation details are missing:
- "Send to database" → ASSUME: PostgreSQL, use "insert_postgres_data"
- "Notify team" → ASSUME: Slack, use "send_slack_message"
- "Call API" → ASSUME: HTTP POST, use "post_json_request"

## Output JSON Structure

### Normal Case - Clear Intent
You must complete this JSON structure:
{
  "intent": "Clear description of what the user wants to achieve",
  "logic_flow": [
    {
      "step": 1,
      "action": "What happens at this step",
      "type": "trigger|process|condition|output",
      "task": "exact_task_name if applicable (from list above)",
      "nodeType": "for non-task nodes like If, Merge, Wait"
    }
  ],
  "matched_tasks": ["array of EXACT task names from the list above"],
  "task_selection_reasoning": [
    {
      "task": "exact_task_name",
      "reason": "Why this task was selected for this specific use case"
    }
  ],
  "unmatched_capabilities": [
    {
      "name": "capability needed but not in task list",
      "description": "why it's needed",
      "searchTerms": ["primary_search", "alternative1", "alternative2"]
    }
  ],
  "search_suggestions": [
    {
      "capability": "what we're looking for",
      "primary": "best search term",
      "alternatives": ["fallback1", "fallback2"]
    }
  ],
  "workflow_pattern": "e.g., trigger-validate-process-notify",
  "complexity": "simple|medium|complex",
  "clarification_needed": false,
  "reasoning": ["Step-by-step reasoning about the workflow logic"]
}

### Clarification Case - Unclear Intent
ONLY when the end goal is genuinely unclear:
{
  "intent": "unclear",
  "logic_flow": [],
  "matched_tasks": [],
  "unmatched_capabilities": [],
  "search_suggestions": [],
  "workflow_pattern": "unknown",
  "complexity": "unknown",
  "clarification_needed": true,
  "clarification": {
    "question": "What specific outcome are you trying to achieve?",
    "context": "I understand you want to [partial understanding], but I need to know [what's missing]",
    "suggestions": ["Example workflow 1", "Example workflow 2"]
  },
  "reasoning": ["Why clarification is needed"]
}

${JSON_OUTPUT_RULES}`;

  const userMessage = `User request: "${sanitizeUserInput(userPrompt)}"

Analyze this request:
1. Identify the logical flow from trigger to completion
2. Match each step to an EXACT task name if possible
3. For steps that don't match tasks, provide search terms
4. Only ask for clarification if the end goal is unclear`;

  return addVersionMetadata(
    {
      system: systemPrompt,
      user: userMessage,
      prefill: '{"intent":"',
    },
    "discovery"
  );
}

// ==========================================
// Discovery Phase Main Prompts
// ==========================================

interface DiscoveryContext extends PromptContext {
  mcpDiscoveredNodes?: any[];
  searchKeywords?: string[];
  isIncremental?: boolean;
  existingNodes?: any[];
  existingSelectedIds?: string[];
  newNodes?: any[];
  clarificationResponse?: string;
  // New fields for task-based discovery
  taskNodes?: any[]; // Pre-configured nodes from tasks
  searchedNodes?: any[]; // Nodes found via search for gaps
  matchedTasks?: string[]; // Tasks already fetched
  unmatchedCapabilities?: any[]; // Capabilities that need searching
}

/**
 * Generate prompt for discovery phase operations (optimized for task-based flow)
 */
export function getDiscoveryPrompt(context: DiscoveryContext): PromptParts {
  const {
    userIntent,
    mcpDiscoveredNodes = [],
    searchKeywords = [],
    isIncremental = false,
    existingNodes = [],
    existingSelectedIds = [],
    newNodes = [],
    clarificationResponse = "",
    taskNodes = [],
    searchedNodes = [],
    matchedTasks = [],
    unmatchedCapabilities = [],
  } = context;

  const systemPrompt = `${BASE_N8N_CONTEXT}

Continue the started JSON: {"operations":[...complete array...],"reasoning":[...steps...]}

${
  isIncremental
    ? `INCREMENTAL MODE: User clarified: "${clarificationResponse}"
Existing: ${existingNodes.length} nodes discovered, ${existingSelectedIds.length} selected
Only add NEW nodes based on clarification.`
    : `TASK-BASED DISCOVERY: Converting pre-configured tasks and searched nodes into operations.`
}

${
  taskNodes.length > 0
    ? `PRE-CONFIGURED TASK NODES (already fetched from MCP):
${taskNodes
  .map(
    (n: any, i: number) => `- ${n.taskName} → ${n.nodeType} (ID: ${n.nodeId})`
  )
  .join("\n")}`
    : ""
}

${
  searchedNodes.length > 0
    ? `SEARCHED NODES (found for unmatched capabilities):
${searchedNodes
  .map((n: any) => `- ${n.nodeType}: ${n.displayName} (ID: ${n.nodeId})`)
  .join("\n")}`
    : ""
}

OPERATIONS TO GENERATE:
1. For EACH task node: Create discoverNode + selectNode operations
2. For SEARCHED nodes: Only select the ones you need
3. If still missing critical functionality: requestClarification

OPERATION FORMATS:
- discoverNode: {"type":"discoverNode","node":{"id":"node_X","type":"nodes-base.nodeName","purpose":"why needed"}}
- selectNode: {"type":"selectNode","nodeId":"node_X"}
- requestClarification: {"type":"requestClarification","questionId":"qX","question":"text","context":{"reason":"why"}}

RULES:
1. Task nodes are pre-configured - just discover and select them
2. Searched nodes need evaluation - select only what's needed
3. Preserve node IDs as provided
4. Only ask clarification if critical functionality is still missing

${JSON_OUTPUT_RULES}`;

  // Build the user message based on mode
  const userMessage = buildDiscoveryUserMessage(
    userIntent,
    isIncremental,
    mcpDiscoveredNodes,
    newNodes,
    existingNodes,
    existingSelectedIds,
    clarificationResponse,
    searchKeywords,
    taskNodes,
    searchedNodes
  );

  return addVersionMetadata(
    {
      system: systemPrompt,
      user: userMessage,
      prefill: PREFILLS.DISCOVERY,
    },
    "discovery"
  );
}

/**
 * Build the user message for discovery phase (task-based)
 */
function buildDiscoveryUserMessage(
  userIntent: string,
  isIncremental: boolean,
  mcpDiscoveredNodes: any[],
  newNodes: any[],
  existingNodes: any[],
  existingSelectedIds: string[],
  clarificationResponse: string,
  searchKeywords: string[],
  taskNodes?: any[],
  searchedNodes?: any[]
): string {
  let nodeListInfo = "";

  if (isIncremental) {
    // For incremental mode, show existing and new nodes separately
    nodeListInfo = `\n\nEXISTING discovered nodes (DO NOT re-discover these):\n`;
    existingNodes.forEach((node: any, index: number) => {
      const isSelected = existingSelectedIds.includes(node.id);
      nodeListInfo += `${index + 1}. ${node.type} - ${node.displayName} (ID: ${
        node.id
      })${isSelected ? " [ALREADY SELECTED]" : ""}\n`;
    });

    if (newNodes.length > 0) {
      nodeListInfo += `\n\nNEW nodes found based on clarification "${clarificationResponse}":\n`;
      nodeListInfo += formatNodeList(newNodes);
    } else {
      nodeListInfo += `\n\nNo new nodes were found based on the clarification. You may need to work with existing nodes.`;
    }

    return `Original request: "${userIntent}"
Clarification provided: "${clarificationResponse}"
${nodeListInfo}

Based on the clarification, generate ONLY the additional operations needed:
1. Only discover NEW nodes that help address the clarification
2. Only select additional nodes if needed based on the clarification
3. Use sequential node IDs starting from node_${existingNodes.length + 1}
4. DO NOT re-discover or re-select existing nodes

Remember: Focus only on what the clarification adds to the workflow.`;
  } else {
    // Task-based discovery mode
    if (taskNodes && taskNodes.length > 0) {
      nodeListInfo = `\n\nTASK-BASED NODES (pre-configured from MCP):\n`;
      taskNodes.forEach((node: any, index: number) => {
        nodeListInfo += `${index + 1}. ${node.taskName} → ${
          node.nodeType
        } (ID: ${node.nodeId})\n`;
        nodeListInfo += `   Purpose: ${
          node.purpose || "Pre-configured task"
        }\n`;
        nodeListInfo += `   Status: Ready to use (pre-configured)\n\n`;
      });
    }

    if (searchedNodes && searchedNodes.length > 0) {
      nodeListInfo += `\n\nSEARCHED NODES (found for gaps):\n`;
      searchedNodes.forEach((node: any, index: number) => {
        nodeListInfo += `${index + 1}. ${node.nodeType} - ${
          node.displayName
        } (ID: ${node.nodeId})\n`;
        nodeListInfo += `   Purpose: ${node.purpose}\n`;
        nodeListInfo += `   Needs configuration: Yes\n\n`;
      });
    }

    // @deprecated - Remove this fallback after Phase 5 complete
    // @removal-target After full migration to task-based discovery
    if (
      !taskNodes?.length &&
      !searchedNodes?.length &&
      mcpDiscoveredNodes.length > 0
    ) {
      // LEGACY: Fallback to old format if no task-based data
      nodeListInfo = `\n\nMCP-Discovered Nodes (based on keywords: ${searchKeywords.join(
        ", "
      )}):\n`;
      nodeListInfo += formatNodeList(mcpDiscoveredNodes);
    } else {
      nodeListInfo =
        "\n\nNOTE: No nodes were discovered from MCP. You may need to request clarification or suggest the user refines their request.";
    }

    return `User wants to: "${userIntent}"
${nodeListInfo}

Generate the discovery phase operations to:
1. Select relevant nodes from the MCP-discovered list above
2. Create discoverNode operations for each selected node
3. Create selectNode operations for nodes to include in the workflow
4. Request clarification if the discovered nodes don't match the user's intent

IMPORTANT: Only use nodes from the MCP-discovered list. Do NOT invent node types.
Remember to use sequential node IDs (node_1, node_2, etc.) and include clear purpose descriptions.`;
  }
}

// ==========================================
// Clarification Prompts
// ==========================================

/**
 * Generate prompt for handling clarification responses
 */
export function getClarificationHandlingPrompt(
  originalIntent: string,
  questionId: string,
  question: string,
  response: string,
  existingState: any
): PromptParts {
  const systemPrompt = `${BASE_N8N_CONTEXT}

You previously asked for clarification:
Question ID: ${questionId}
Question: "${question}"

The user has now provided a response. Based on this new information, continue building the workflow discovery.

Continue the started JSON: {"operations":[...complete array...],"reasoning":[...steps...]}

Remember:
- Only add NEW operations based on the clarification
- Don't repeat operations for nodes already discovered
- Use the clarification to refine or expand the workflow design
- Continue with sequential node IDs from where you left off

${JSON_OUTPUT_RULES}`;

  const userMessage = `Original request: "${originalIntent}"

Your question: "${question}"
User's response: "${sanitizeUserInput(response)}"

Current state:
- Nodes discovered: ${existingState.discovered || 0}
- Nodes selected: ${existingState.selected || 0}

Based on the clarification, generate additional discovery operations as needed.`;

  return addVersionMetadata(
    {
      system: systemPrompt,
      user: userMessage,
      prefill: PREFILLS.DISCOVERY,
    },
    "discovery"
  );
}

// ==========================================
// Export Discovery Prompts
// ==========================================

export const DiscoveryPrompts = {
  getIntentAnalysisPrompt,
  getDiscoveryPrompt,
  getClarificationHandlingPrompt,
};
