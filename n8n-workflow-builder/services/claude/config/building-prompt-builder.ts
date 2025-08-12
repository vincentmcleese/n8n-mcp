/**
 * Prompt Builder for Building Phase
 *
 * Builds workflow assembly prompts from configured nodes
 */

import * as fs from "fs";
import * as path from "path";
import type { ConfiguredNode } from "@/types/orchestrator/configuration";

export interface BuildingPromptInput {
  userIntent: string;
  configuredNodes: ConfiguredNode[];
}

export interface BuildingPromptParts {
  system: string;
  user: string;
  prefill?: string;
}

export class BuildingPromptBuilder {
  private templatePath: string;
  private template: string | null = null;

  constructor() {
    this.templatePath = path.join(
      process.cwd(),
      "services/claude/prompts/buildprompt.md"
    );
  }

  /**
   * Load the prompt template
   */
  private loadTemplate(): string {
    if (!this.template) {
      try {
        this.template = fs.readFileSync(this.templatePath, "utf-8");
      } catch (error) {
        // Fallback to inline template if file not found
        this.template = this.getInlineTemplate();
      }
    }
    return this.template;
  }

  /**
   * Build workflow assembly prompt - returns properly structured prompt parts
   */
  buildPrompt(input: BuildingPromptInput): BuildingPromptParts {
    const { userIntent, configuredNodes } = input;
    const template = this.loadTemplate();

    // Format configured nodes for prompt
    const nodesDescription = this.formatConfiguredNodes(configuredNodes);

    // Split template into system context and user request
    // The template contains the rules and format, we add the specific task
    const systemPrompt = template
      .replace(/\[USER_INTENT\]/g, userIntent)
      .replace("[CONFIGURED_NODES]", nodesDescription)
      .replace("[NODE_COUNT]", configuredNodes.length.toString());

    // User message is the specific request
    const userPrompt = `Build a complete n8n workflow that achieves: "${userIntent}"
    
Using these ${configuredNodes.length} configured nodes:
${nodesDescription}

Connect them logically and return the complete workflow JSON.`;

    return {
      system: systemPrompt,
      user: userPrompt,
      prefill: '{\n  "name": "',
    };
  }

  /**
   * Format configured nodes for the prompt
   */
  private formatConfiguredNodes(nodes: ConfiguredNode[]): string {
    return nodes
      .map((node, index) => {
        // Config is just passed as-is from configuration phase
        const config = node.config || {};

        // Create a summary of the configuration
        const configSummary = this.createConfigSummary(config);

        return `${index + 1}. **${node.type}** (ID: ${node.id})
   - Purpose: ${node.purpose || "Process data"}
   - Configuration: ${configSummary}`;
      })
      .join("\n\n");
  }

  /**
   * Create a summary of key configuration parameters
   */
  private createConfigSummary(config: any): string {
    if (!config || typeof config !== "object") {
      return "No configuration";
    }

    // Just provide a compact JSON representation
    try {
      const jsonStr = JSON.stringify(config, null, 2);
      // Limit to reasonable length for prompt
      if (jsonStr.length > 200) {
        return jsonStr.slice(0, 200) + "...";
      }
      return jsonStr;
    } catch {
      return "Complex configuration";
    }
  }

  /**
   * Inline template as fallback
   */
  private getInlineTemplate(): string {
    return `# Build Workflow Structure

You are an n8n workflow architect. Connect pre-configured nodes into a logical workflow structure.

## Your Task
Build workflow JSON from validated nodes that achieves: "[USER_INTENT]"

## Configured Nodes ([NODE_COUNT] total)
[CONFIGURED_NODES]

## Rules

1. **Node Types**: Use EXACT types from provided nodes - DO NOT modify
2. **Node IDs**: MUST be unique! Use pattern like \`httpRequest_1\`, \`httpRequest_2\`, \`set_1\`, etc.
   - Convert node type to camelCase (e.g., "HTTP Request" → "httpRequest")
   - Add underscore and number suffix starting from 1
3. **Connections**: Connect based on data flow logic
4. **Positioning**: Space nodes 300px apart horizontally, align vertically
5. **Names**: Use descriptive node names in connections object
6. **Error Handling**: Add onError property (NOT continueOnFail):
   - Triggers/webhooks: "stopWorkflow"
   - Processing: "continueRegularOutput"
   - External APIs: "continueErrorOutput"

## Connection Format
CRITICAL: Use this EXACT structure:
\`\`\`json
connections: {
  "Node Name": { main: [[{ node: "Target Name", type: "main", index: 0 }]] }
}
\`\`\`

## Required JSON Output

Return ONLY a JSON object with this structure:
\`\`\`json
{
  "name": "Descriptive Workflow Name",
  "nodes": [...configured nodes with positions...],
  "connections": {...logical connections...},
  "settings": {
    "executionOrder": "v1",
    "saveDataSuccessExecution": "all",
    "saveDataErrorExecution": "all",
    "saveManualExecutions": true
  },
  "reasoning": ["Connected webhook to processor", "Added error handling", "..."]
}
\`\`\``;
  }
}
