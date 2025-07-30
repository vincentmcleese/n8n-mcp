import { createAnthropicClient } from "@/lib/config/anthropic";
import type { WorkflowOperation, WorkflowPhase } from "@/types/workflow";
import { Anthropic } from "@anthropic-ai/sdk";

interface ClaudeResult {
  operations: WorkflowOperation[];
  reasoning: string[];
  [key: string]: any; // Allow for additional properties for now
}

export interface ClaudeBuildingResult extends ClaudeResult {
  name: string;
  nodes: any[];
  connections: any;
  settings: any;
}

export interface ClaudeValidationResult extends ClaudeResult {
  workflow: any;
  validationReport: any;
}

export interface ClaudeAnalysis {
  intent: string;
  requiredCapabilities: string[];
  suggestedSearchTerms: string[];
  nodeRecommendations: Array<{
    type: string;
    purpose: string;
    priority: "essential" | "recommended" | "optional";
  }>;
  reasoning: string[];
}

export interface NodeInfoRequirements {
  needsAuth: boolean;
  needsProperties: string[];
  suggestedTask?: string;
  needsDocumentation: boolean;
  reasoning: string[];
}

export class ClaudeService {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Analyze user intent to determine what to search for in MCP
   */
  async analyzeWorkflowIntent(prompt: string): Promise<ClaudeAnalysis> {
    console.log("[Claude] Analyzing workflow intent with trust-based approach");

    // Handle empty or whitespace-only prompts
    if (!prompt || !prompt.trim()) {
      console.log("[Claude] Empty prompt detected, returning minimal analysis");
      return {
        intent: "No workflow intent provided",
        requiredCapabilities: [],
        suggestedSearchTerms: [],
        nodeRecommendations: [],
        reasoning: ["Empty or invalid prompt provided"],
      };
    }

    const systemPrompt = `You are an n8n workflow automation expert.

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

Respond with JSON:
{
  "intent": "What the user wants to achieve",
  "requiredCapabilities": ["capabilities needed"],
  "suggestedSearchTerms": ["terms to search for - BE SPECIFIC with tool names"],
  "nodeRecommendations": [{
    "type": "node-type",
    "purpose": "why this node is needed",
    "priority": "essential|recommended|optional"
  }],
  "reasoning": ["Your step-by-step reasoning"]
}`;

    const userMessage = `User request: "${prompt}"

Think through what nodes would be needed to build this workflow.`;

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse response
      let analysis: ClaudeAnalysis;
      try {
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          analysis = JSON.parse(jsonStr);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (e) {
        console.error(
          "[Claude] Failed to parse analysis response, using fallback"
        );
        // Fallback
        analysis = {
          intent: "Process workflow",
          requiredCapabilities: ["data-processing"],
          suggestedSearchTerms: prompt
            .toLowerCase()
            .split(" ")
            .filter((w) => w.length > 3),
          nodeRecommendations: [],
          reasoning: ["Failed to parse Claude response"],
        };
      }

      return analysis;
    } catch (error) {
      console.error("[Claude] Error analyzing intent:", error);
      // Return basic analysis as fallback
      return {
        intent: "Process workflow",
        requiredCapabilities: ["data-processing"],
        suggestedSearchTerms: prompt
          .toLowerCase()
          .split(" ")
          .filter((w) => w.length > 3),
        nodeRecommendations: [],
        reasoning: ["Error occurred during analysis"],
      };
    }
  }

  processWorkflowPhase(
    phase: "discovery",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeResult>;
  processWorkflowPhase(
    phase: "configuration",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeResult>;
  processWorkflowPhase(
    phase: "building",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeBuildingResult>;
  processWorkflowPhase(
    phase: "validation",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeValidationResult>;
  processWorkflowPhase(
    phase: WorkflowPhase,
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeResult | ClaudeBuildingResult | ClaudeValidationResult> {
    switch (phase) {
      case "discovery":
        return this.analyzeDiscoveryIntent(prompt, context);
      case "configuration":
        return this.generateConfiguration(prompt, selectedNodes || [], context);
      case "validation":
        return this.validateWorkflow(context);
      case "building":
        return this.buildWorkflow(context);
      default:
        throw new Error(`Unsupported phase: ${phase}`);
    }
  }

  /**
   * Analyze user intent for discovery phase
   */
  private async analyzeDiscoveryIntent(
    prompt: string,
    context?: any
  ): Promise<ClaudeResult> {
    // Extract MCP discovered nodes from context
    const mcpNodes = context?.mcpDiscoveredNodes || [];
    const searchKeywords = context?.searchKeywords || [];

    // Check if this is an incremental discovery (clarification response)
    const isIncremental = context?.mode === "incremental";
    const existingNodes = context?.existingDiscoveredNodes || [];
    const existingSelectedIds = context?.existingSelectedNodeIds || [];
    const newNodes = context?.newlyDiscoveredNodes || [];
    const clarificationResponse = context?.clarificationResponse || "";

    console.log(
      isIncremental
        ? "[Claude] Processing incremental discovery for clarification..."
        : "[Claude] Starting discovery intent analysis..."
    );

    const systemPrompt = `You are an n8n workflow expert helping users build automation workflows.
    
    Your task is to THINK DEEPLY about the user's request and generate WorkflowOperation objects for the discovery phase.
    ${
      isIncremental
        ? `
    IMPORTANT: This is an INCREMENTAL discovery based on a clarification response.
    - The user has already discovered ${existingNodes.length} nodes and selected ${existingSelectedIds.length} of them
    - The user provided this clarification: "${clarificationResponse}"
    - You should ONLY suggest NEW nodes that aren't already discovered
    - DO NOT re-discover or re-select existing nodes
    - Focus only on what the clarification adds to the workflow
    `
        : `
    CRITICAL: Before selecting nodes, analyze:
    1. What is the user trying to achieve? (end goal)
    2. What data flow is needed? (input → processing → output)
    3. What triggers or conditions are required?
    4. Are there any implicit requirements not explicitly stated?
    5. Would this workflow need error handling or conditional logic?
    `
    }
    
    IMPORTANT: You have been provided with a list of actual n8n nodes discovered from the MCP database.
    ${
      isIncremental
        ? `Existing nodes already discovered: ${existingNodes
            .map((n: any) => n.type)
            .join(", ")}
    New nodes found based on clarification: ${newNodes
      .map((n: any) => n.nodeType)
      .join(", ")}`
        : `These nodes were found by searching for: ${searchKeywords.join(
            ", "
          )}`
    }
    
    You should:
    ${
      isIncremental
        ? `
    1. Review the NEW nodes found based on the clarification
    2. Only generate 'discoverNode' operations for NEW nodes not already discovered
    3. Only generate 'selectNode' operations for nodes that should be added based on the clarification
    4. DO NOT re-discover existing nodes: ${existingNodes
      .map((n: any) => n.id)
      .join(", ")}
    `
        : `
    1. Review ALL the MCP-discovered nodes carefully - read their descriptions to understand their capabilities
    2. Look beyond just the node names - many nodes have multiple features (e.g., OpenAI nodes often include Whisper transcription)
    3. Generate 'discoverNode' operations for EACH relevant node that matches the user's intent
    4. Generate 'selectNode' operations for EACH node that should be included in the workflow
    5. IMPORTANT: Always create both discoverNode AND selectNode operations for nodes you want to use
    6. If critical functionality is truly missing after reviewing all nodes, use 'requestClarification' operations
    `
    }
    
    Remember: ANY node can be used as an AI tool in n8n by connecting it to an AI Agent node!
    
    Available operation types for discovery phase:
    - discoverNode: Suggest a node from the MCP-discovered list
    - selectNode: Select a discovered node for the workflow
    - deselectNode: Remove a previously selected node
    - requestClarification: Ask the user for more information when details are unclear
    
    When to request clarification (ONLY ABOUT INTENT, NOT TOOL CHOICE):
    - User's workflow intent/outcome is unclear (e.g., "process some data" - what data? what processing?)
    - Missing critical information about WHAT they want to achieve (not HOW)
    - The workflow's purpose or end goal is ambiguous
    - You cannot determine what the user is trying to accomplish
    
    When NOT to request clarification (MAKE ASSUMPTIONS):
    - User says "database" → Pick PostgreSQL, MySQL, or another common choice
    - User says "email" → Pick Gmail, SendGrid, or another email service
    - User says "notification" → Pick Slack, email, or another notification method
    - The intent is clear but specific tools aren't mentioned → Make reasonable assumptions
    - Multiple valid tool options exist → Pick the most common/reasonable one
    
    Example response with clarification:
    {
      "operations": [
        {
          "type": "requestClarification",
          "questionId": "q1",
          "question": "What kind of data do you want to process and what should be done with it?",
          "context": {
            "reason": "The workflow intent is unclear - need to understand what data and what processing is required"
          }
        }
      ],
      "reasoning": [
        "User said 'process some data' but didn't specify what data",
        "The processing requirements and end goal are unclear",
        "Need to understand the workflow's purpose before selecting nodes"
      ]
    }
    
    Example response without clarification (making tool assumptions):
    {
      "operations": [
        {
          "type": "discoverNode",
          "node": {
            "id": "node_1",
            "type": "nodes-base.httpRequest",
            "purpose": "Fetch data from API endpoint"
          }
        },
        {
          "type": "discoverNode",
          "node": {
            "id": "node_2",
            "type": "nodes-base.postgres",
            "purpose": "Store the fetched data in PostgreSQL database"
          }
        },
        {
          "type": "selectNode",
          "nodeId": "node_1"
        },
        {
          "type": "selectNode",
          "nodeId": "node_2"
        }
      ],
      "reasoning": [
        "User wants to fetch data from API and store in database",
        "Intent is clear: get data from external source and persist it",
        "Made assumption: PostgreSQL for database (common choice)",
        "Selected HTTP Request node for API calls and Postgres node for storage"
      ]
    }`;

    // Build node list information for Claude
    let nodeListInfo = "";
    if (isIncremental) {
      // For incremental mode, show existing and new nodes separately
      nodeListInfo = `\n\nEXISTING discovered nodes (DO NOT re-discover these):\n`;
      existingNodes.forEach((node: any, index: number) => {
        const isSelected = existingSelectedIds.includes(node.id);
        nodeListInfo += `${index + 1}. ${node.type} - ${
          node.displayName
        } (ID: ${node.id})${isSelected ? " [ALREADY SELECTED]" : ""}\n`;
      });

      if (newNodes.length > 0) {
        nodeListInfo += `\n\nNEW nodes found based on clarification "${clarificationResponse}":\n`;
        newNodes.forEach((node: any, index: number) => {
          // Handle both 'type' and 'nodeType' field names
          const nodeType = node.type || node.nodeType;
          nodeListInfo += `${index + 1}. ${nodeType} - ${node.displayName}: ${
            node.description
          } (Category: ${node.category})\n`;
        });
      } else {
        nodeListInfo += `\n\nNo new nodes were found based on the clarification. You may need to work with existing nodes.`;
      }
    } else {
      // Regular discovery mode
      if (mcpNodes.length > 0) {
        nodeListInfo = `\n\nMCP-Discovered Nodes (based on keywords: ${searchKeywords.join(
          ", "
        )}):\n`;
        mcpNodes.forEach((node: any, index: number) => {
          nodeListInfo += `${index + 1}. ${node.type} - ${node.displayName}: ${
            node.description
          } (Category: ${node.category})\n`;
        });
      } else {
        nodeListInfo =
          "\n\nNOTE: No nodes were discovered from MCP. You may need to request clarification or suggest the user refines their request.";
      }
    }

    const userMessage = isIncremental
      ? `Original request: "${prompt}"
      Clarification provided: "${clarificationResponse}"
      ${nodeListInfo}
      
      Based on the clarification, generate ONLY the additional operations needed:
      1. Only discover NEW nodes that help address the clarification
      2. Only select additional nodes if needed based on the clarification
      3. Use sequential node IDs starting from node_${existingNodes.length + 1}
      4. DO NOT re-discover or re-select existing nodes
      
      Remember: Focus only on what the clarification adds to the workflow.`
      : `User wants to: "${prompt}"
      ${nodeListInfo}
      
      Generate the discovery phase operations to:
      1. Select relevant nodes from the MCP-discovered list above
      2. Create discoverNode operations for each selected node
      3. Create selectNode operations for nodes to include in the workflow
      4. Request clarification if the discovered nodes don't match the user's intent
      
      IMPORTANT: Only use nodes from the MCP-discovered list. Do NOT invent node types.
      Remember to use sequential node IDs (node_1, node_2, etc.) and include clear purpose descriptions.`;

    try {
      // Use faster model for tests
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1500,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      // Parse Claude's response
      const content =
        response.content[0].type === "text" ? response.content[0].text : "";
      console.log("[Claude] Raw response:", content);

      // Try to parse JSON response
      let parsedResponse: any;
      try {
        // Look for JSON in markdown code block first
        const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          const jsonStr = codeBlockMatch[1].trim();
          parsedResponse = JSON.parse(jsonStr);
          console.log("[Claude] Parsed JSON from code block");
        } else {
          // Try to find raw JSON
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[0]);
            console.log("[Claude] Parsed raw JSON");
          } else {
            throw new Error("No JSON found in response");
          }
        }
      } catch (e) {
        console.log(
          "[Claude] Failed to parse JSON:",
          e instanceof Error ? e.message : String(e)
        );
        console.log("[Claude] Response was:", content);

        // For empty/invalid prompts, return a clarification request
        if (
          prompt.trim() === "" ||
          content.toLowerCase().includes("empty") ||
          content.toLowerCase().includes("no context")
        ) {
          return {
            operations: [
              {
                type: "requestClarification",
                questionId: "q1",
                question:
                  "Could you please describe what workflow you would like to create?",
                context: { reason: "No prompt provided" },
              },
            ],
            reasoning: ["No workflow prompt was provided"],
          };
        }

        throw new Error("Invalid response format from Claude");
      }

      // Handle the new standard response format
      const operations: WorkflowOperation[] = parsedResponse.operations || [];
      const reasoning: string[] = parsedResponse.reasoning || [];

      // Validate operations are in correct format
      const validOperations = operations.filter((op: any) => {
        if (op.type === "discoverNode") {
          return op.node && op.node.id && op.node.type && op.node.purpose;
        } else if (op.type === "selectNode") {
          return op.nodeId;
        }
        return true; // Allow other operation types
      });

      if (isIncremental) {
        const newDiscoverOps = validOperations.filter(
          (op) => op.type === "discoverNode"
        ).length;
        const newSelectOps = validOperations.filter(
          (op) => op.type === "selectNode"
        ).length;
        console.log(
          `[Claude] Incremental discovery complete: ${newDiscoverOps} new nodes discovered, ${newSelectOps} additional nodes selected`
        );
      } else {
        console.log(
          "[Claude] Generated",
          validOperations.length,
          "operations with",
          reasoning.length,
          "reasoning steps"
        );
      }

      return { operations: validOperations, reasoning };
    } catch (error) {
      console.error("[Claude] Error in discovery analysis:", error);
      throw error;
    }
  }

  /**
   * Generate configuration for selected nodes
   */
  private async generateConfiguration(
    prompt: string,
    selectedNodes: string[],
    context: any
  ): Promise<ClaudeResult> {
    console.log(
      "[Claude] Starting configuration generation for",
      selectedNodes.length,
      "nodes"
    );

    // Node schemas, templates, properties, and documentation will be passed in context if available
    const nodeSchemas = context?.nodeSchemas || {};
    const nodeTemplates = context?.nodeTemplates || {};
    const nodeProperties = context?.nodeProperties || {};
    const nodeDocumentation = context?.nodeDocumentation || {};

    const systemPrompt = `You are an n8n workflow configuration expert.

Your task: Configure the selected nodes based on the user's requirements.

You have:
1. The user's original request with their specific requirements
2. Node essentials showing available configuration options
3. Property search results showing EXACT field names and structures
4. Task templates (when available) showing pre-configured examples
5. The purpose of each selected node

CRITICAL RULES:
- NEVER guess field names - use ONLY the properties shown in the search results
- If a task template is provided, use it as your base and modify for the user's needs
- Pay attention to the exact field names and structures in the property search results
- For any "display name" shown, look for the corresponding actual field name in the properties

Configure each node by:
- Using the EXACT field names from the property search results
- Following the structure shown in task templates (if available)
- Extracting specific values from the user's request
- Using the discovered properties to build a valid configuration
- NEVER inventing field names or structures

Common patterns:
- Display names like "Send Message To" often map to different field structures
- Always check the property search results for the actual field names
- Task templates show the exact working configuration structure

IMPORTANT: Focus only on configuration using the discovered properties. Validation will happen in the next phase.

CRITICAL: Your entire response must be ONLY the JSON object below. Do not include any explanatory text, reasoning, or commentary outside the JSON:
{
  "operations": [
    {
      "type": "configureNode",
      "nodeId": "node_1",
      "config": {
        // Configuration using EXACT field names from property searches
      }
    }
  ],
  "reasoning": ["Your configuration decisions based on discovered properties"]
}`;

    const userMessage = `User intent: "${prompt}"
    
    Selected nodes to configure:
    ${selectedNodes
      .map((nodeId) => {
        const node = context?.discoveredNodes?.find(
          (n: any) => n.id === nodeId
        );
        const schema = nodeSchemas[node?.type];
        const template = nodeTemplates[node?.type];
        const enriched = context?.enrichedContext;

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

    try {
      // Use faster model for tests
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse response
      let parsedResponse: any;
      try {
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          parsedResponse = JSON.parse(jsonStr);
        } else {
          console.error(
            "[Claude] No JSON found in response:",
            content.substring(0, 500)
          );
          throw new Error("No JSON found in response");
        }
      } catch (e) {
        console.error("[Claude] Failed to parse response:", e);
        console.error("[Claude] Content was:", content.substring(0, 500));
        throw new Error("Invalid response format from Claude");
      }

      return {
        operations: parsedResponse.operations || [],
        reasoning: parsedResponse.reasoning || [],
      };
    } catch (error) {
      console.error("[Claude] Error in configuration generation:", error);
      throw error;
    }
  }

  /**
   * Generate fixes for validation errors (delta-based approach)
   */
  async generateValidationFixes(errors: any[], workflow: any): Promise<any[]> {
    console.log("[Claude] Generating fixes for validation errors");

    const systemPrompt = `You are an n8n workflow validation expert. Your job is to analyze validation errors and generate fix operations.

IMPORTANT: You must ONLY return a JSON array of fix operations. Do not return the full workflow.

When you see errors about node-level properties being in the wrong location:
- Properties like onError, retryOnFail, maxTries, waitBetweenTries MUST be at the node level, NOT inside parameters
- The error message tells you exactly which properties need to be moved
- Since our applyFixes function handles moving them automatically, you should generate updateField operations for these properties
- The applyFixes function will place them at the correct level based on the property name

Fix operation types:
- addField: Add a missing field to a node
  { type: "addField", nodeId: "node_id", field: "fieldName", value: "fieldValue" }
  
- updateField: Update an existing field
  { type: "updateField", nodeId: "node_id", field: "fieldName", value: "newValue" }
  
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

CRITICAL: For each error, generate the minimal fix needed. Use the actual field names from the error messages, not display names.`;

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

Generate fix operations for these errors. Return ONLY a JSON array of fix operations.`;

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse response to extract fix operations
      try {
        // Try to find JSON array in the response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const fixes = JSON.parse(jsonMatch[0]);
          console.log(
            `[Claude] Generated ${fixes.length} fix operations:`,
            JSON.stringify(fixes, null, 2)
          );
          return fixes;
        } else {
          console.error("[Claude] No JSON array found in response");
          return [];
        }
      } catch (e) {
        console.error("[Claude] Failed to parse fix operations:", e);
        console.error("[Claude] Response:", content);
        return [];
      }
    } catch (error) {
      console.error("[Claude] Error generating validation fixes:", error);
      return [];
    }
  }

  /**
   * Validate and fix workflow using MCP validation tools
   */
  private async validateWorkflow(
    context: any
  ): Promise<ClaudeValidationResult> {
    console.log("[Claude] Validating workflow with MCP tools");

    const draftWorkflow = context?.draftWorkflow;
    if (!draftWorkflow) {
      throw new Error("No draft workflow provided for validation");
    }

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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 8000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      const responseText = response.content[0];
      if (responseText.type !== "text") {
        throw new Error("Expected text response from Claude");
      }

      console.log(
        "[Claude] Validation response length:",
        responseText.text.length
      );

      // Log where tool invocations end
      const lastInvokeIndex = responseText.text.lastIndexOf("</invoke>");
      if (lastInvokeIndex !== -1) {
        const afterTools = responseText.text.substring(
          lastInvokeIndex + "</invoke>".length
        );
        console.log(
          "[Claude] Content after last tool invocation:",
          afterTools.substring(0, 500)
        );
      }

      // Check if markers exist
      const hasBeginMarker = responseText.text.includes("=== BEGIN RESULT ===");
      const hasEndMarker = responseText.text.includes("=== END RESULT ===");
      console.log(
        "[Claude] Has BEGIN marker:",
        hasBeginMarker,
        "Has END marker:",
        hasEndMarker
      );

      // Parse the response
      try {
        const text = responseText.text.trim();

        // Try to parse as clean JSON first
        let result = null;

        // Strategy 1: Look for JSON between === markers
        const markerMatch = text.match(
          /=== BEGIN RESULT ===\s*([\s\S]*?)\s*=== END RESULT ===/
        );
        if (markerMatch) {
          try {
            const jsonStr = markerMatch[1].trim();
            console.log(
              "[Claude] Found JSON between markers, length:",
              jsonStr.length
            );
            console.log("[Claude] JSON preview:", jsonStr.substring(0, 100));
            result = JSON.parse(jsonStr);
            console.log(
              "[Claude] Successfully parsed result with markers strategy"
            );
          } catch (e) {
            console.error("[Claude] Failed to parse JSON between markers:", e);
            console.error(
              "[Claude] JSON that failed:",
              markerMatch[1].substring(0, 200)
            );
          }
        }

        // Strategy 2: Look for JSON after all tool invocations
        if (!result) {
          const lastInvokeIndex = text.lastIndexOf("</invoke>");
          if (lastInvokeIndex !== -1) {
            const afterTools = text
              .substring(lastInvokeIndex + "</invoke>".length)
              .trim();
            // Try to parse what comes after tools
            try {
              // Look for JSON in the remaining text
              const jsonMatch = afterTools.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
              }
            } catch (e) {
              // Continue to next strategy
            }
          }
        }

        // Strategy 3: Look for JSON in code blocks
        if (!result) {
          const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            try {
              result = JSON.parse(codeBlockMatch[1]);
            } catch (e) {
              // Continue to next strategy
            }
          }
        }

        // Strategy 4: Find the largest JSON object that contains workflow
        if (!result) {
          // Use a more sophisticated regex to find complete JSON objects
          const jsonRegex =
            /\{(?:[^{}]|(?:\{[^{}]*\}))*"workflow"(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
          const matches = text.match(jsonRegex);
          if (matches) {
            // Try each match, prefer the largest one
            let largestMatch = null;
            let largestSize = 0;
            for (const match of matches) {
              try {
                const parsed = JSON.parse(match);
                if (parsed.workflow && match.length > largestSize) {
                  result = parsed;
                  largestSize = match.length;
                }
              } catch (e) {
                // Continue to next match
              }
            }
          }
        }

        // Strategy 5: Try direct parsing as last resort
        if (!result) {
          try {
            result = JSON.parse(text);
          } catch (e) {
            throw new Error("No valid workflow JSON found in response");
          }
        }

        if (!result || !result.workflow) {
          throw new Error("Claude response missing workflow");
        }

        // Ensure the workflow has a valid flag
        if (result.workflow && typeof result.workflow.valid === "undefined") {
          result.workflow.valid = true; // Default to valid if all validations passed
        }

        // Return the result in the expected format
        return {
          operations: [], // Validation phase doesn't use operations
          reasoning: result.reasoning || ["Workflow validated and fixed"],
          workflow: result.workflow,
          validationReport: result.validationReport,
        };
      } catch (parseError) {
        console.error(
          "[Claude] Failed to parse validation response:",
          parseError
        );
        console.error(
          "[Claude] Raw response (first 1000 chars):",
          responseText.text.substring(0, 1000)
        );

        // Return a minimal valid response to avoid breaking the flow
        return {
          operations: [],
          reasoning: [
            "Failed to parse validation response - workflow unchanged",
          ],
          workflow: draftWorkflow,
          validationReport: {
            initial: { workflow: { errors: ["Failed to validate"] } },
            fixesApplied: [],
            final: { workflow: { errors: ["Failed to validate"] } },
          },
        };
      }
    } catch (error) {
      console.error("[Claude] Validation error:", error);
      throw error;
    }
  }

  /**
   * Analyze what MCP information is needed for a node
   */
  async analyzeNodeRequirements(
    node: any,
    userPrompt: string,
    nodeEssentials: any
  ): Promise<NodeInfoRequirements> {
    console.log(`[Claude] Analyzing information requirements for ${node.type}`);

    const systemPrompt = `You are an n8n workflow configuration expert analyzing what information is needed to properly configure a node.

Given:
1. The node type and purpose
2. The user's original request
3. The node essentials (basic properties)

Determine what additional MCP information would be helpful. BE COMPREHENSIVE - search for ALL properties needed to fulfill the node's purpose, not just authentication.

Key Analysis Points:
1. Authentication: Does this node need credentials? (OAuth, API keys, etc.)
2. Core Operation Properties: What are the MAIN properties for the node's purpose?
   - For Slack: channel/recipient selection, message content, attachments
   - For HTTP: URL, method, headers, body
   - For Database: query/operation, table, fields
   - For Email: recipient, subject, body
3. Configuration Properties: Settings that control how the node operates
4. Optional Enhancements: Additional features that might be useful

IMPORTANT: 
- For the node's stated purpose, identify ALL properties that need to be configured
- Don't just focus on auth - think about what fields are needed to accomplish the task
- If sending a message, search for message/content/text properties
- If selecting a destination, search for channel/recipient/target properties
- Consider the node's category and typical use cases

Available MCP tools:
- search_node_properties(nodeType, query) - Find specific properties
- get_node_for_task(taskName) - Get pre-configured templates
- get_node_documentation(nodeType) - Get detailed usage documentation

Example property searches:
- For messaging nodes: "message", "channel", "recipient", "content", "text"
- For database nodes: "query", "table", "operation", "fields"
- For HTTP nodes: "url", "method", "headers", "body"
- For file nodes: "path", "filename", "content", "encoding"

CRITICAL: Respond with ONLY this JSON structure, no other text:
{
  "needsAuth": true/false,
  "needsProperties": ["channel", "message", "recipient"], // ALL relevant properties
  "suggestedTask": "send_slack_message", // optional, if a task template matches
  "needsDocumentation": true/false,
  "reasoning": ["Why each piece of info is needed"]
}`;

    const userMessage = `Node: ${node.type} (${node.id})
Purpose: ${node.purpose}
User's request: "${userPrompt}"

Node essentials:
${JSON.stringify(nodeEssentials, null, 2)}

What additional MCP information would help configure this node properly?`;

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse the requirements
      try {
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (e) {
        console.error("[Claude] Failed to parse requirements analysis:", e);
        // Return minimal requirements on error
        return {
          needsAuth: false,
          needsProperties: [],
          needsDocumentation: false,
          reasoning: ["Failed to analyze requirements"],
        };
      }
    } catch (error) {
      console.error("[Claude] Error analyzing node requirements:", error);
      return {
        needsAuth: false,
        needsProperties: [],
        needsDocumentation: false,
        reasoning: ["Error occurred during analysis"],
      };
    }
  }

  /**
   * Fix node configuration based on validation errors
   */
  async fixNodeConfig(
    node: any,
    config: any,
    validationErrors: string[],
    nodeContext: any
  ): Promise<any> {
    console.log(
      `[Claude] Fixing configuration for ${node.type} with ${validationErrors.length} errors`
    );

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

IMPORTANT: Return ONLY the fixed configuration object, no explanations.`;

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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse the fixed configuration
      try {
        // Look for JSON in various formats
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/```\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        } else {
          throw new Error("No JSON configuration found in response");
        }
      } catch (e) {
        console.error("[Claude] Failed to parse fixed configuration:", e);
        // Return original config if we can't parse the fix
        return config;
      }
    } catch (error) {
      console.error("[Claude] Error fixing node configuration:", error);
      // Return original config on error
      return config;
    }
  }

  /**
   * Build workflow structure from configured nodes
   */
  private async buildWorkflow(context: any): Promise<ClaudeBuildingResult> {
    console.log("[Claude] Building workflow structure from configured nodes");

    const configuredNodes = context?.configuredNodes || [];
    const userIntent = context?.userIntent || "";

    const systemPrompt = `You are an n8n workflow building expert. Your task is to BUILD a workflow structure from configured nodes.

You have:
1. Validated, configured nodes with all parameters set
2. The user's original intent/request
3. Each node's purpose in the workflow

Your task:
- Connect the nodes in logical flow based on their purposes
- Add appropriate error handling (continueOnFail, onError settings)
- Use n8n expressions where needed ($json, $node["NodeName"].json)
- Position nodes for clear visual layout
- Create a workflow that fulfills the user's intent

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
- CRITICAL: Connection format uses node IDs as keys but node NAMES as targets:
  connections: {
    "node_1": { main: [[{ node: "Send to Slack", type: "main", index: 0 }]] },
    "node_2": { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] }
  }
  Where node_1 has name "Webhook Trigger" and node_2 has name "Send to Slack"

Error handling:
- Webhooks/triggers: continueOnFail=false, stop on error
- Data processing: continueOnFail=true, continue on error
- External APIs: continueOnFail=true, handle errors gracefully
- Critical operations: continueOnFail=false, stop workflow

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
      "continueOnFail": false
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "Send to Slack", "type": "main", "index": 0}]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "saveDataSuccessExecution": "all",
    "saveDataErrorExecution": "all",
    "saveManualExecutions": true
  },
  "reasoning": ["Connected webhook to Slack for message sending", "..."]
}

CRITICAL FORMAT RULES:
- Node types MUST have "n8n-nodes-base." prefix (e.g., "n8n-nodes-base.webhook" not "nodes-base.webhook")
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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 3000,
        temperature: 0.2,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse response
      let parsedResponse: any;
      try {
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          parsedResponse = JSON.parse(jsonStr);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (e) {
        console.error("[Claude] Failed to parse building response:", e);
        throw new Error("Invalid response format from Claude");
      }

      // Return the complete workflow
      return {
        name: parsedResponse.name || "n8n Workflow",
        nodes: parsedResponse.nodes || [],
        connections: parsedResponse.connections || {},
        settings: parsedResponse.settings || {
          executionOrder: "v1",
          saveDataSuccessExecution: "all",
          saveDataErrorExecution: "all",
          saveManualExecutions: true,
        },
        operations: [], // No operations needed - we return the complete workflow
        reasoning: parsedResponse.reasoning || [],
      };
    } catch (error) {
      console.error("[Claude] Error in workflow building:", error);
      throw error;
    }
  }
}

// Keep the original factory function for backward compatibility
export function createClaudeService() {
  const service = new ClaudeService();
  return {
    analyzeDiscoveryIntent: (prompt: string, context?: any) =>
      service.processWorkflowPhase(
        "discovery",
        prompt,
        "legacy",
        undefined,
        context
      ),
    generateConfiguration: (
      prompt: string,
      selectedNodes: string[],
      context: any
    ) =>
      service.processWorkflowPhase(
        "configuration",
        prompt,
        "legacy",
        selectedNodes,
        context
      ),
    validateWorkflow: (context: any) =>
      service.processWorkflowPhase(
        "validation",
        "",
        "legacy",
        undefined,
        context
      ),
    buildWorkflow: (context: any) =>
      service.processWorkflowPhase(
        "building",
        "",
        "legacy",
        undefined,
        context
      ),
  };
}
