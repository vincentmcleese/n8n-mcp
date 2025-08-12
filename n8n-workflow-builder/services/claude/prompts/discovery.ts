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
- transform_data - Transform data using JavaScript Code node (ONLY when standard nodes/expressions insufficient)
- filter_data - Filter arrays/lists to keep only items matching conditions 
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

## CRITICAL: Control Flow Nodes
**IF, Switch, Merge nodes are NOT in the task list - add them to unmatched_capabilities when needed**

## CRITICAL: Code Node (transform_data) - Use Only When Necessary

### Use transform_data when:
- Complex logic requiring 5+ standard nodes
- Custom algorithms or business rules
- Multi-condition validation
- Batch operations with loops

### "Scraping or Scrape" means GETTING data, often through httpRequest node, such as Firecrawl API or Apify API.

### DON'T use transform_data for:
- Simple expressions: \`{{ $json.field.toLowerCase() }}\`
- Basic math: \`{{ $json.price * 1.2 }}\`
- HTTP requests → Use get_api_data/post_json_request
- Filtering arrays → Use filter_data\`
- Conditional routing → Use IF/Switch nodes

**Always prefer standard nodes and expressions over Code nodes**

### Distinguish Filtering vs Branching

Analyze conditional logic carefully:

### Use filter_data task when:
- Processing arrays/lists to keep/remove items
- Output is a filtered subset of the input array

Examples:
"filter orders where amount > 100"
"get only active users"
"remove invalid entries"

### Use IF node when:

- Routing workflow to different paths based on conditions
- Different actions based on conditions (if/then/else)
- Output goes to different nodes/branches

Examples:
"if amount > 100 send to Slack, else send email"
"check if user exists, then update or create"
"when status is approved, do X, otherwise do Y"

###   Use Switch node when:

- Need 3+ different output paths
- Category-based routing (department, priority, type)

Examples:
- Route by department: Sales, Marketing, Support
- Priority: High → Immediate, Medium → Queue, Low → Batch

### Quick Decision Tree
- Working with array/list? → Filter (filter_data)
- Need 2 workflow paths? → IF node  
- Need 3+ workflow paths? → Switch node

### Key Recognition Patterns
Filter: "only", "where", "keep items that..." → Data reduction
IF: "if...then...else", "when...do" → Two-path branching
Switch: "route by", "depending on category" → Multi-path branching

## When to Ask for Clarification
ASK only when the END GOAL is unclear:
- "Process data" → ASK: "What should happen to the processed data?"
- "Handle webhooks" → ASK: "What should be done with webhook data?"

DO NOT ASK when implementation details are missing:
- "Send to database" → ASSUME: PostgreSQL, use "insert_postgres_data"
- "Notify team" → ASSUME: Slack, use "send_slack_message"
- "Call API" → ASSUME: HTTP POST, use "post_json_request"

## Search Term Guidelines
When generating searchTerms for unmatched_capabilities, use SIMPLE terms:
- For MongoDB operations → searchTerms: ["mongodb", "mongo", "database"]
- For schema validation → searchTerms: ["schema", "validate", "validation", "json"]
- For Stripe payments → searchTerms: ["stripe", "payment", "checkout"]
- For calendar sync → searchTerms: ["calendar", "google", "outlook"]
- For FTP operations → searchTerms: ["ftp", "sftp", "file"]
- For compression → searchTerms: ["zip", "compress", "archive"]

AVOID compound terms like "mongodb_operations", "schema_validation", "json_schema_validator"
PREFER simple node names that actually exist in n8n

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
      "searchTerms": ["simple_node_name", "alternative1", "alternative2"]
    }
  ],
  "search_suggestions": [
    {
      "capability": "what we're looking for",
      "primary": "simple single-word search term (e.g., 'mongodb' not 'mongodb_operations')",
      "alternatives": ["simpler_term1", "simpler_term2"]
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
// Export Discovery Prompts
// ==========================================

// Export for use by DiscoveryRunner and DiscoveryPhaseService
export const DiscoveryPrompts = {
  getIntentAnalysisPrompt,
};
