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
  sanitizeUserInput
} from './common';
import { PREFILLS } from '../constants';

// ==========================================
// Intent Analysis Prompts
// ==========================================

/**
 * Generate prompt for analyzing user intent
 */
export function getIntentAnalysisPrompt(userPrompt: string): PromptParts {
  const systemPrompt = `${BASE_N8N_CONTEXT}

Discovery Phase - Find the right nodes:
- Think deeply about the user's request and the logic you need to build to fulfill it
- Consider all the steps and transformations needed
- IMPORTANT: Only ask for clarification if the user's INTENT/OUTCOME is unclear
- If the intent is clear but tools aren't specified, MAKE REASONABLE ASSUMPTIONS

Tool Selection Philosophy:
- User says "database" without specifics → Suggest common options like PostgreSQL, MySQL
- User says "email" without provider → Suggest Gmail, SendGrid, AWS SES
- User says "notify" without channel → Suggest Slack, email, webhook
- Always prefer common/popular tools when making assumptions

Then determine what n8n nodes to search for using these MCP tools:
- search_nodes({query: 'keyword'}) - Search by functionality
- list_nodes({category: 'trigger'}) - Browse by category  
- list_ai_tools() - See AI-capable nodes (remember: ANY node can be an AI tool!)

Examples:
- search_nodes({query: "slack"}) - Search by keyword
- search_nodes({query: "gmail"}) - For email functionality
- search_nodes({query: "postgres"}) - For database operations
- list_nodes({category: "communication"}) - List by category

You need to complete the JSON structure that has been started for you.
The JSON should contain:
- intent: What the user wants to achieve
- requiredCapabilities: Array of capabilities needed
- suggestedSearchTerms: Array of terms to search for - BE SPECIFIC with tool names
- nodeRecommendations: Array of recommended nodes with type, purpose, and priority
- reasoning: Array of your step-by-step reasoning

${JSON_OUTPUT_RULES}`;

  const userMessage = `User request: "${sanitizeUserInput(userPrompt)}"

Think through what nodes would be needed to build this workflow.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.INTENT_ANALYSIS
  }, 'discovery');
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
}

/**
 * Generate prompt for discovery phase operations
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
    clarificationResponse = ""
  } = context;

  const systemPrompt = `${BASE_N8N_CONTEXT}

Continue the started JSON: {"operations":[...complete array...],"reasoning":[...steps...]}

${isIncremental 
  ? `INCREMENTAL MODE: User clarified: "${clarificationResponse}"
Existing: ${existingNodes.length} nodes discovered, ${existingSelectedIds.length} selected
Only add NEW nodes based on clarification.`
  : `FRESH DISCOVERY: Analyze the user's goal, data flow (input→process→output), and requirements.`}

Available nodes from MCP: ${isIncremental 
  ? `New: ${newNodes.map((n: any) => n.nodeType).join(", ")}`
  : `Found by searching: ${searchKeywords.join(", ")}`}

OPERATIONS:
- discoverNode: {"type":"discoverNode","node":{"id":"node_X","type":"nodes-base.nodeName","purpose":"why needed"}}
- selectNode: {"type":"selectNode","nodeId":"node_X"} 
- requestClarification: {"type":"requestClarification","questionId":"qX","question":"text","context":{"reason":"why"}}

RULES:
1. Always pair discoverNode + selectNode for nodes you want
2. Read node descriptions - they often have multiple capabilities
3. Any node can connect to AI Agent nodes as tools

CLARIFICATION POLICY:
ASK when intent unclear: "process data" → What data? What processing?
ASSUME when tool unspecified: "database" → PostgreSQL, "email" → Gmail, "notify" → Slack

${isIncremental 
  ? `Skip existing nodes: ${existingNodes.map((n: any) => n.id).join(", ")}`
  : `If critical functionality missing after reviewing all nodes, request clarification.`}

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
    searchKeywords
  );

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.DISCOVERY
  }, 'discovery');
}

/**
 * Build the user message for discovery phase
 */
function buildDiscoveryUserMessage(
  userIntent: string,
  isIncremental: boolean,
  mcpDiscoveredNodes: any[],
  newNodes: any[],
  existingNodes: any[],
  existingSelectedIds: string[],
  clarificationResponse: string,
  searchKeywords: string[]
): string {
  let nodeListInfo = "";
  
  if (isIncremental) {
    // For incremental mode, show existing and new nodes separately
    nodeListInfo = `\n\nEXISTING discovered nodes (DO NOT re-discover these):\n`;
    existingNodes.forEach((node: any, index: number) => {
      const isSelected = existingSelectedIds.includes(node.id);
      nodeListInfo += `${index + 1}. ${node.type} - ${node.displayName} (ID: ${node.id})${
        isSelected ? " [ALREADY SELECTED]" : ""
      }\n`;
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
    // Regular discovery mode
    if (mcpDiscoveredNodes.length > 0) {
      nodeListInfo = `\n\nMCP-Discovered Nodes (based on keywords: ${searchKeywords.join(", ")}):\n`;
      nodeListInfo += formatNodeList(mcpDiscoveredNodes);
    } else {
      nodeListInfo = "\n\nNOTE: No nodes were discovered from MCP. You may need to request clarification or suggest the user refines their request.";
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

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.DISCOVERY
  }, 'discovery');
}

// ==========================================
// Export Discovery Prompts
// ==========================================

export const DiscoveryPrompts = {
  getIntentAnalysisPrompt,
  getDiscoveryPrompt,
  getClarificationHandlingPrompt,
};