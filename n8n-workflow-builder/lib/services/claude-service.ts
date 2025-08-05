import { createAnthropicClient } from "@/lib/config/anthropic";
import type { WorkflowOperation, WorkflowPhase } from "@/types/workflow";
import { Anthropic } from "@anthropic-ai/sdk";
import type {
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse,
  NodeRequirementsResponse,
  ConfigurationOperationsResponse,
  WorkflowBuildResponse,
  ValidatedWorkflowResponse,
  ValidationFixesResponse,
  ClaudeOperationsResponse,
  ClaudeBuildingResponse,
  ClaudeValidationResponse,
  DocumentationOperationsResponse,
} from "@/lib/types/claude-response-types";
import { loggers } from "@/lib/utils/logger";

// Re-export types for backward compatibility
export type ClaudeAnalysis = ClaudeAnalysisResponse;
export type NodeInfoRequirements = NodeRequirementsResponse;
export type ClaudeResult = ClaudeOperationsResponse;
export type ClaudeBuildingResult = ClaudeBuildingResponse;
export type ClaudeValidationResult = ClaudeValidationResponse;

// Prefill constants for consistent JSON output
const PREFILLS = {
  DISCOVERY: '{"operations":[',
  CONFIGURATION: '{"operations":[',
  BUILDING: '{"name":"',
  VALIDATION: '[{"type":"', // For validation fixes array
  DOCUMENTATION: '{"operations":[', // For sticky note operations
  // New prefills for methods currently using regex
  INTENT_ANALYSIS: '{"intent":"', // For analyzeWorkflowIntent
  NODE_REQUIREMENTS: '{"needsAuth":', // For analyzeNodeRequirements
  NODE_CONFIG: "{", // For fixNodeConfig
} as const;

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
   * Shared error handler for prefill-based JSON parsing
   */
  private handlePrefillParseError(
    error: any,
    prefill: string,
    fullContent: string,
    methodName: string
  ): never {
    loggers.claude.error(`Failed to parse ${methodName} response:`, error);
    loggers.claude.error("Prefill was:", prefill);
    loggers.claude.error(
      "Full content preview:",
      fullContent.substring(0, 500)
    );
    // For debugging: show the end of the content to see if it's truncated
    loggers.claude.error(
      "Content end:",
      fullContent.substring(fullContent.length - 100)
    );
    loggers.claude.error("Total length:", fullContent.length);
    // Show the area around the error position
    if (error.message?.includes("position")) {
      const match = error.message.match(/position (\d+)/);
      if (match) {
        const errorPos = parseInt(match[1]);
        loggers.claude.error(
          "Content around error position:",
          fullContent.substring(Math.max(0, errorPos - 50), errorPos + 50)
        );
      }
    }
    throw new Error(`Invalid JSON response from Claude in ${methodName}`);
  }

  /**
   * Extract JSON from a prefilled response that might have extra text
   */
  private extractJsonFromPrefillResponse(fullContent: string): string {
    // The prefill approach should give us valid JSON
    // This is just a safety net for edge cases
    let content = fullContent;

    // Count opening and closing braces/brackets
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;

    // Add missing closing braces
    if (openBraces > closeBraces) {
      const missing = openBraces - closeBraces;
      content += "}".repeat(missing);
      loggers.claude.debug(`Added ${missing} missing closing brace(s)`);
    }

    // Add missing closing brackets
    if (openBrackets > closeBrackets) {
      const missing = openBrackets - closeBrackets;
      content += "]".repeat(missing);
      loggers.claude.debug(`Added ${missing} missing closing bracket(s)`);
    }

    return content;
  }

  /**
   * Parse JSON from prefilled response with error handling
   */
  private parsePrefillJsonResponse(
    fullContent: string,
    prefill: string,
    methodName: string
  ): any {
    try {
      // First attempt: try parsing as-is
      return JSON.parse(fullContent);
    } catch (firstError: any) {
      // If it fails due to extra text after JSON, try to extract just the JSON part
      if (
        firstError.message?.includes("after JSON") ||
        firstError.message?.includes("after array element") ||
        firstError.message?.includes("Unexpected")
      ) {
        try {
          const jsonContent = this.extractJsonFromPrefillResponse(fullContent);
          return JSON.parse(jsonContent);
        } catch (secondError) {
          // If extraction still fails, use the original error
          this.handlePrefillParseError(
            firstError,
            prefill,
            fullContent,
            methodName
          );
        }
      } else {
        // For other errors, fail immediately
        this.handlePrefillParseError(
          firstError,
          prefill,
          fullContent,
          methodName
        );
      }
    }
  }

  /**
   * Analyze user intent to determine what to search for in MCP
   */
  async analyzeWorkflowIntent(prompt: string): Promise<ClaudeAnalysisResponse> {
    loggers.claude.debug("Analyzing workflow intent with trust-based approach");

    // Handle empty or whitespace-only prompts
    if (!prompt || !prompt.trim()) {
      loggers.claude.debug("Empty prompt detected, returning minimal analysis");
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

You need to complete the JSON structure that has been started for you.
The JSON should contain:
- intent: What the user wants to achieve
- requiredCapabilities: Array of capabilities needed
- suggestedSearchTerms: Array of terms to search for - BE SPECIFIC with tool names
- nodeRecommendations: Array of recommended nodes with type, purpose, and priority
- reasoning: Array of your step-by-step reasoning

CRITICAL: Return ONLY the JSON object. Do not add any text, explanation, or commentary after the closing }. The response must be valid JSON that can be parsed directly.`;

    const userMessage = `User request: "${prompt}"

Think through what nodes would be needed to build this workflow.`;

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      // Use the prefill constant for intent analysis
      const prefill = PREFILLS.INTENT_ANALYSIS;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Intent analysis response with prefill");

      // Try to parse JSON response
      try {
        // First attempt: try parsing as-is
        const analysis = JSON.parse(fullContent);
        loggers.claude.verbose("Successfully parsed intent analysis response");
        return analysis as ClaudeAnalysisResponse;
      } catch (firstError: any) {
        // If it fails due to extra text after JSON, try to extract just the JSON part
        if (firstError.message?.includes("after JSON")) {
          try {
            const jsonContent =
              this.extractJsonFromPrefillResponse(fullContent);
            const analysis = JSON.parse(jsonContent);
            loggers.claude.verbose(
              "Successfully parsed intent analysis response after extraction"
            );
            return analysis as ClaudeAnalysisResponse;
          } catch (secondError) {
            // If extraction still fails, use the original error
            this.handlePrefillParseError(
              firstError,
              prefill,
              fullContent,
              "analyzeWorkflowIntent"
            );
          }
        } else {
          // For other errors, fail immediately
          this.handlePrefillParseError(
            firstError,
            prefill,
            fullContent,
            "analyzeWorkflowIntent"
          );
        }
      }
    } catch (error) {
      loggers.claude.error("Error analyzing intent:", error);
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
  ): Promise<DiscoveryOperationsResponse>;
  processWorkflowPhase(
    phase: "configuration",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ConfigurationOperationsResponse>;
  processWorkflowPhase(
    phase: "building",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeBuildingResponse>;
  processWorkflowPhase(
    phase: "validation",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<ClaudeValidationResponse>;
  processWorkflowPhase(
    phase: "documentation",
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<DocumentationOperationsResponse>;
  processWorkflowPhase(
    phase: WorkflowPhase,
    prompt: string,
    sessionId: string,
    selectedNodes?: string[],
    context?: any
  ): Promise<
    | DiscoveryOperationsResponse
    | ConfigurationOperationsResponse
    | ClaudeBuildingResponse
    | ClaudeValidationResponse
    | DocumentationOperationsResponse
  > {
    switch (phase) {
      case "discovery":
        return this.analyzeDiscoveryIntent(prompt, context);
      case "configuration":
        return this.generateConfiguration(prompt, selectedNodes || [], context);
      case "validation":
        return this.validateWorkflow(context);
      case "building":
        return this.buildWorkflow(context);
      case "documentation":
        return this.generateDocumentation(prompt, context);
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
  ): Promise<DiscoveryOperationsResponse> {
    // Extract MCP discovered nodes from context
    const mcpNodes = context?.mcpDiscoveredNodes || [];
    const searchKeywords = context?.searchKeywords || [];

    // Check if this is an incremental discovery (clarification response)
    const isIncremental = context?.mode === "incremental";
    const existingNodes = context?.existingDiscoveredNodes || [];
    const existingSelectedIds = context?.existingSelectedNodeIds || [];
    const newNodes = context?.newlyDiscoveredNodes || [];
    const clarificationResponse = context?.clarificationResponse || "";

    loggers.claude.debug(
      isIncremental
        ? "Processing incremental discovery for clarification..."
        : "Starting discovery intent analysis..."
    );

    const systemPrompt = `You are an n8n workflow expert helping users build automation workflows.
    
    CRITICAL: You must continue the JSON that has already been started. The response begins with: {"operations":[
    
    You need to:
    1. Add operation objects to the array (each must be valid JSON)
    2. Close the operations array with ]
    3. Add a comma and the "reasoning" field: ,"reasoning":["step1","step2"]
    4. Close the JSON object with }
    
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
    
    VALID OPERATION TYPES (use exact format):
    - discoverNode: {"type":"discoverNode","node":{"id":"node_X","type":"nodes-base.nodeName","purpose":"description"}}
    - selectNode: {"type":"selectNode","nodeId":"node_X"}
    - requestClarification: {"type":"requestClarification","questionId":"qX","question":"your question","context":{"reason":"why asking"}}
    
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
    
    Example of how to continue from {"operations":[ when requesting clarification:
    {"type":"requestClarification","questionId":"q1","question":"What kind of data do you want to process?","context":{"reason":"Need to understand data processing requirements"}}],"reasoning":["User intent is unclear","Need more information before selecting nodes"]}
    
    Example of how to continue from {"operations":[ when selecting nodes:
    {"type":"discoverNode","node":{"id":"node_1","type":"nodes-base.webhook","purpose":"Receive incoming webhooks"}},{"type":"selectNode","nodeId":"node_1"}],"reasoning":["User needs webhook to receive data","Selected webhook node for the workflow"]}`;

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

      // Use the prefill constant for discovery phase
      const prefill = PREFILLS.DISCOVERY;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 8000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Full response with prefill:", fullContent);

      // Try to parse JSON response
      let parsedResponse: any;
      try {
        // Since we're using prefill, the response should be valid JSON
        parsedResponse = JSON.parse(fullContent);
        loggers.claude.verbose("Successfully parsed prefilled JSON response");
      } catch (e) {
        loggers.claude.error(
          "Failed to parse JSON:",
          e instanceof Error ? e.message : String(e)
        );
        loggers.claude.verbose("Full content was:", fullContent);
        loggers.claude.verbose("Claude's continuation was:", claudeResponse);

        // For empty/invalid prompts, return a clarification request
        if (prompt.trim() === "") {
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

        // If parsing failed, it means Claude didn't complete the JSON properly
        throw new Error(
          `Invalid JSON response from Claude. The response was incomplete or malformed: ${
            e instanceof Error ? e.message : "Unknown error"
          }`
        );
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

      // Enhance operations with reasoning for narrative
      const enhancedOperations = this.attachReasoningToOperations(validOperations, reasoning);

      if (isIncremental) {
        const newDiscoverOps = enhancedOperations.filter(
          (op) => op.type === "discoverNode"
        ).length;
        const newSelectOps = enhancedOperations.filter(
          (op) => op.type === "selectNode"
        ).length;
        console.log(
          `[Claude] Incremental discovery complete: ${newDiscoverOps} new nodes discovered, ${newSelectOps} additional nodes selected`
        );
      } else {
        console.log(
          "[Claude] Generated",
          enhancedOperations.length,
          "operations with",
          reasoning.length,
          "reasoning steps"
        );
      }

      return { operations: enhancedOperations, reasoning };
    } catch (error) {
      loggers.claude.error("Error in discovery analysis:", error);
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
  ): Promise<ConfigurationOperationsResponse> {
    loggers.claude.debug(
      `Starting configuration generation for ${selectedNodes.length} nodes`
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
2. Node essentials showing the CORE properties and their structure
3. Task templates (when available) showing COMPLETE WORKING configurations
4. Property search results for any additional properties
5. The purpose of each selected node

CONFIGURATION PRIORITY ORDER:
1. If a task template is provided → Use it as your BASE configuration
2. If no template → Use the structure from node essentials
3. Only use property search results for properties NOT in template/essentials

CRITICAL RULES:
- Task templates are WORKING CONFIGURATIONS - trust their structure completely
- Node essentials show the REAL property names and nesting - follow them exactly
- NEVER invent or guess property names
- NEVER search for properties already shown in essentials or templates
- If essentials show nested structure (e.g., conditions.conditions), use that exact nesting
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

      // Use the prefill constant for configuration phase
      const prefill = PREFILLS.CONFIGURATION;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Configuration response with prefill");

      // Try to parse JSON response
      let parsedResponse: any;
      try {
        // Since we're using prefill, the response should be valid JSON
        parsedResponse = JSON.parse(fullContent);
        loggers.claude.verbose("Successfully parsed prefilled JSON response");
      } catch (e) {
        loggers.claude.error("Failed to parse response:", e);
        loggers.claude.error(
          "Full content was:",
          fullContent.substring(0, 500)
        );
        throw new Error("Invalid response format from Claude");
      }

      // Enhance operations with reasoning for narrative
      const enhancedOperations = this.attachReasoningToOperations(
        parsedResponse.operations || [],
        parsedResponse.reasoning || []
      );

      return {
        operations: enhancedOperations,
        reasoning: parsedResponse.reasoning || [],
      };
    } catch (error) {
      loggers.claude.error("Error in configuration generation:", error);
      throw error;
    }
  }

  /**
   * Generate fixes for validation errors (delta-based approach)
   */
  async generateValidationFixes(
    errors: any[],
    workflow: any
  ): Promise<ValidationFixesResponse> {
    loggers.claude.verbose("Generating fixes for validation errors");

    const systemPrompt = `You are an n8n workflow validation expert. Your job is to analyze validation errors and generate fix operations.

IMPORTANT: You must ONLY return a JSON array of fix operations. Do not return the full workflow.

When you see errors about node-level properties being in the wrong location:
- Properties like onError, retryOnFail, maxTries, waitBetweenTries MUST be at the node level, NOT inside parameters
- The error message tells you exactly which properties need to be moved
- Since our applyFixes function handles moving them automatically, you should generate updateField operations for these properties
- The applyFixes function will place them at the correct level based on the property name

Example: If error says "Node-level properties onError, retryOnFail are in the wrong location", generate:
[
  { "type": "updateField", "nodeId": "node_id", "field": "onError", "value": "continueErrorOutput" },
  { "type": "updateField", "nodeId": "node_id", "field": "retryOnFail", "value": true }
]

Example: If error says "Cannot use both continueOnFail and onError", generate:
[
  { "type": "removeField", "nodeId": "node_id", "field": "continueOnFail" }
]

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

      // Use the prefill constant for validation fixes
      const prefill = PREFILLS.VALIDATION;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Validation fixes response with prefill");

      // Try to parse JSON response
      try {
        // Since we're using prefill, the response should be valid JSON
        const fixes = JSON.parse(fullContent);
        loggers.claude.info(`Generated ${fixes.length} fix operations:`, fixes);
        return fixes;
      } catch (e) {
        loggers.claude.error("Failed to parse fix operations:", e);
        loggers.claude.error(
          "Full content was:",
          fullContent.substring(0, 500)
        );
        return [];
      }
    } catch (error) {
      loggers.claude.error("Error generating validation fixes:", error);
      return [];
    }
  }

  /**
   * Validate and fix workflow using MCP validation tools
   */
  private async validateWorkflow(
    context: any
  ): Promise<ClaudeValidationResponse> {
    loggers.claude.verbose("Validating workflow with MCP tools");

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

        // Look for JSON between === markers (documented format)
        const markerMatch = text.match(
          /=== BEGIN RESULT ===\s*([\s\S]*?)\s*=== END RESULT ===/
        );

        if (!markerMatch) {
          loggers.claude.error("No result markers found in response");
          throw new Error("Invalid response format - missing result markers");
        }

        try {
          const jsonStr = markerMatch[1].trim();
          loggers.claude.verbose(
            `Found JSON between markers, length: ${jsonStr.length}`
          );
          loggers.claude.verbose("JSON preview:", jsonStr.substring(0, 100));
          const result = JSON.parse(jsonStr);
          loggers.claude.debug(
            "Successfully parsed result with markers strategy"
          );

          // Validate the parsed result
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
        } catch (e) {
          loggers.claude.error("Failed to parse JSON between markers:", e);
          loggers.claude.error(
            "JSON that failed:",
            markerMatch[1].substring(0, 200)
          );
          throw new Error("Failed to parse validation result JSON");
        }
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
      loggers.claude.error("Validation error:", error);
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
  ): Promise<NodeRequirementsResponse> {
    loggers.claude.debug(`Analyzing information requirements for ${node.type}`);

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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      // Use the prefill constant for node requirements
      const prefill = PREFILLS.NODE_REQUIREMENTS;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 500,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Node requirements response with prefill");

      // Try to parse JSON response
      try {
        // Since we're using prefill, the response should be valid JSON
        const requirements = JSON.parse(fullContent);
        loggers.claude.verbose(
          "Successfully parsed node requirements response"
        );
        return requirements as NodeRequirementsResponse;
      } catch (e) {
        this.handlePrefillParseError(
          e,
          prefill,
          fullContent,
          "analyzeNodeRequirements"
        );
      }
    } catch (error) {
      loggers.claude.error("Error analyzing node requirements:", error);
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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      // Use the prefill constant for node config
      const prefill = PREFILLS.NODE_CONFIG;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Fixed configuration response with prefill");

      // Try to parse JSON response
      try {
        // Since we're using prefill, the response should be valid JSON
        const fixedConfig = JSON.parse(fullContent);
        loggers.claude.verbose("Successfully parsed fixed configuration");
        return fixedConfig;
      } catch (e) {
        // For fixNodeConfig, we want to return the original config on error
        // rather than throwing, so we don't use the shared handler
        loggers.claude.error("Failed to parse fixed configuration:", e);
        loggers.claude.error(
          "Full content was:",
          fullContent.substring(0, 500)
        );
        // Return original config if we can't parse the fix
        return config;
      }
    } catch (error) {
      loggers.claude.error("Error fixing node configuration:", error);
      // Return original config on error
      return config;
    }
  }

  /**
   * Build workflow structure from configured nodes
   */
  private async buildWorkflow(context: any): Promise<ClaudeBuildingResponse> {
    loggers.claude.verbose("Building workflow structure from configured nodes");

    const configuredNodes = context?.configuredNodes || [];
    const userIntent = context?.userIntent || "";

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

    try {
      const model =
        process.env.NODE_ENV === "test"
          ? "claude-sonnet-4-20250514"
          : "claude-sonnet-4-20250514";

      // Use the prefill constant for building phase
      const prefill = PREFILLS.BUILDING;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 8000,
        temperature: 0, // Use 0 for maximum consistency
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill }, // Start Claude's response with the prefill
        ],
        system: systemPrompt,
      });

      // Parse Claude's response
      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Combine prefill with Claude's response to get complete JSON
      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Building response with prefill");
      loggers.claude.debug(`Response length: ${fullContent.length} characters`);

      // Try to parse JSON response
      const parsedResponse = this.parsePrefillJsonResponse(
        fullContent,
        prefill,
        "buildWorkflow"
      );
      loggers.claude.verbose("Successfully parsed building response");

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
      loggers.claude.error("Error in workflow building:", error);
      throw error;
    }
  }

  /**
   * Generate sticky note documentation for the workflow
   */
  private async generateDocumentation(
    userPrompt: string,
    context: any
  ): Promise<DocumentationOperationsResponse> {
    try {
      const { workflow, nodeMetadata } = context;

      loggers.claude.debug("Generating documentation for workflow");

      const systemPrompt = `You are an n8n workflow documentation expert.

Documentation Phase - Add helpful sticky notes:
- Create clear, concise sticky notes that explain workflow sections
- Group related nodes together under a single sticky note
- Focus on WHAT the workflow section does, not HOW individual nodes work
- Use friendly, non-technical language where possible
- Maximum 2-3 sentences per sticky note

Guidelines:
- Create 1-5 sticky notes total (less is more)
- Each sticky note should cover a logical group of connected nodes
- Use colors: 1=yellow (default), 2=green (success), 3=blue (info), 4=red (warning)
- Position notes will be calculated automatically - just specify node groups

Example format:
{
  "operations": [
    {
      "type": "addStickyNote",
      "note": {
        "id": "sticky_1",
        "content": "Receives webhook data and validates the payload structure",
        "nodeGroupIds": ["node_1", "node_2"],
        "color": 1
      }
    }
  ],
  "reasoning": ["Grouped webhook and validation nodes", "..."]
}

IMPORTANT: Each operation MUST have:
- type: "addStickyNote" 
- note object with: id (e.g. "sticky_1"), content, nodeGroupIds array, optional color
- The nodeGroupIds should match the node IDs from the metadata

Return ONLY valid JSON matching this format exactly.`;

      const userMessage = `Original user request: "${userPrompt}"

Workflow metadata:
${JSON.stringify(nodeMetadata, null, 2)}

Create sticky notes to document this workflow. Group related nodes together and explain what each section does.

Remember to return valid JSON starting with {"operations":[ and include helpful reasoning.`;

      const model = "claude-sonnet-4-20250514";
      const prefill = PREFILLS.DOCUMENTATION;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: prefill },
        ],
        system: systemPrompt,
      });

      const claudeResponse =
        response.content[0].type === "text" ? response.content[0].text : "";

      const fullContent = prefill + claudeResponse;
      loggers.claude.verbose("Documentation response with prefill");

      const parsedResponse = this.parsePrefillJsonResponse(
        fullContent,
        prefill,
        "generateDocumentation"
      );
      loggers.claude.verbose("Successfully parsed documentation response");
      loggers.claude.debug(
        `Documentation operations: ${parsedResponse.operations?.length || 0}`
      );
      if (parsedResponse.operations?.length > 0) {
        loggers.claude.debug(
          "Operations:",
          JSON.stringify(parsedResponse.operations, null, 2)
        );
      }

      // Enhance operations with reasoning for narrative
      const enhancedOperations = this.attachReasoningToOperations(
        parsedResponse.operations || [],
        parsedResponse.reasoning || ["Generated workflow documentation"]
      );

      return {
        operations: enhancedOperations,
        reasoning: parsedResponse.reasoning || [
          "Generated workflow documentation",
        ],
      };
    } catch (error) {
      loggers.claude.error("Error generating documentation:", error);
      throw error;
    }
  }

  /**
   * Attach reasoning to operations for chronological narrative
   */
  private attachReasoningToOperations(
    operations: WorkflowOperation[],
    reasoning: string[]
  ): WorkflowOperation[] {
    return operations.map((operation, index) => {
      // Attach reasoning if available
      const reasoningText = reasoning[index] || reasoning[Math.floor(index / 2)] || 
                           reasoning[0] || "Operation performed";
      
      return {
        ...operation,
        reasoning: reasoningText,
        operationIndex: index
      };
    });
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
