// lib/services/seo-generator.service.ts

import { Anthropic } from "@anthropic-ai/sdk";
import { createAnthropicClient } from "@/lib/config/anthropic";
import { DiscoveredNode } from "@/types/workflow";
import { WorkflowSEOMetadata } from "@/types/seo";
import { loggers } from "@/lib/utils/logger";

const logger = loggers.seo;

/**
 * SEO Generator Service
 * Generates business-focused SEO metadata for workflows using Claude
 * Uses prefill technique for reliable JSON output
 */
export class SEOGeneratorService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = createAnthropicClient();
  }

  /**
   * Generate SEO metadata for a workflow based on discovered nodes
   * Uses Claude with prefill to ensure valid JSON response
   */
  async generateSEO(
    nodes: DiscoveredNode[],
    selectedIds: string[],
    userPrompt: string,
    sessionId: string
  ): Promise<WorkflowSEOMetadata> {
    const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));

    if (selectedNodes.length === 0) {
      return this.generateDefaultSEO(userPrompt, sessionId);
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(userPrompt, selectedNodes);

      logger.info("Generating SEO metadata", {
        sessionId,
        nodeCount: selectedNodes.length,
        prompt: userPrompt.substring(0, 100),
      });

      const response = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307", // Fast and cost-effective for structured data
        max_tokens: 500,
        temperature: 0.3, // Lower temperature for consistency
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
          {
            role: "assistant",
            content: '{\n  "slug": "', // Prefill to ensure JSON response
          },
        ],
      });

      // Extract concatenated text blocks safely
      const textBlocks = response.content
        .filter((b: any) => b && b.type === "text")
        .map((b: any) => b.text as string)
        .join("");

      // Complete the JSON with the prefilled opening
      const jsonString = '{\n  "slug": "' + textBlocks;

      const seoData = this.parseAndValidateSEO(jsonString, sessionId);

      logger.info("SEO metadata generated successfully", {
        sessionId,
        slug: seoData.slug,
      });

      return seoData;
    } catch (error) {
      logger.error("Failed to generate SEO metadata", {
        sessionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Fallback to deterministic generation
      return this.generateFallbackSEO(selectedNodes, userPrompt, sessionId);
    }
  }

  /**
   * Build the system prompt for Claude
   */
  private buildSystemPrompt(): string {
    return `You are an SEO specialist for n8n workflow automation. 
Generate business-focused SEO metadata that emphasizes value and outcomes over technical details.

Requirements:
- slug: URL-friendly, lowercase, hyphens only, max 50 chars (don't include suffix)
- title: Business value focused, 50-60 characters
- description: Clear business benefits, 150-160 characters  
- keywords: 5-10 relevant search terms as array
- businessValue: 2-4 word primary outcome
- category: Choose from: "Data Integration", "Communication", "Analytics", "Automation", "Security", "DevOps", "Sales", "Marketing", "Monitoring", "Productivity"
- integrations: Service/platform names only as array

You MUST respond with valid JSON only. Continue the JSON object that has been started.`;
  }

  /**
   * Build the user message with workflow context
   */
  private buildUserMessage(
    userPrompt: string,
    selectedNodes: DiscoveredNode[]
  ): string {
    const nodeDescriptions = selectedNodes
      .map((n) => {
        const name = n.displayName || n.type.replace("n8n-nodes-base.", "");
        return `${name} (${n.purpose || "processing"})`;
      })
      .join(", ");

    return `Generate SEO metadata for this n8n workflow:
    
User Intent: "${userPrompt}"
Selected Nodes: ${nodeDescriptions}
Number of Nodes: ${selectedNodes.length}

Focus on the business value and practical outcomes. Generate compelling, search-friendly content.`;
  }

  /**
   * Parse and validate the SEO JSON response
   */
  private parseAndValidateSEO(
    jsonString: string,
    sessionId: string
  ): WorkflowSEOMetadata {
    try {
      const seoData = JSON.parse(jsonString);

      // Validate required fields
      this.validateSEOData(seoData);

      // Clean and format the data
      seoData.slug = this.formatSlug(seoData.slug, sessionId);
      seoData.title = this.truncateText(seoData.title, 60);
      seoData.description = this.truncateText(seoData.description, 160);

      // Ensure arrays
      if (!Array.isArray(seoData.keywords)) {
        seoData.keywords = [seoData.keywords].filter(Boolean);
      }
      if (!Array.isArray(seoData.integrations)) {
        seoData.integrations = [seoData.integrations].filter(Boolean);
      }

      // Add metadata
      seoData.generatedAt = new Date().toISOString();

      return seoData as WorkflowSEOMetadata;
    } catch (error) {
      throw new Error(
        `Failed to parse SEO JSON: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate that all required SEO fields are present
   */
  private validateSEOData(data: any): void {
    const required = [
      "slug",
      "title",
      "description",
      "keywords",
      "businessValue",
      "category",
      "integrations",
    ];
    const missing = required.filter((field) => !data[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required SEO fields: ${missing.join(", ")}`);
    }
  }

  /**
   * Format slug with unique suffix
   */
  private formatSlug(slug: string, sessionId: string): string {
    // Clean the slug
    const cleaned = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    // Add unique suffix
    const suffix = sessionId.slice(-6);
    return `${cleaned}-${suffix}`;
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Generate fallback SEO when AI generation fails
   */
  private generateFallbackSEO(
    nodes: DiscoveredNode[],
    userPrompt: string,
    sessionId: string
  ): WorkflowSEOMetadata {
    const nodeTypes = nodes.map((n) =>
      n.type
        .replace("n8n-nodes-base.", "")
        .replace(/([A-Z])/g, " $1")
        .trim()
    );

    const mainNodes = nodeTypes.slice(0, 2).join(" to ");
    const slug = this.formatSlug(mainNodes.replace(/\s+/g, "-"), sessionId);

    return {
      slug,
      title: `${mainNodes} Workflow`,
      description: `Automated workflow connecting ${
        nodeTypes.length
      } services: ${nodeTypes.join(
        ", "
      )}. Built with n8n for seamless integration.`,
      keywords: [
        "n8n",
        "automation",
        "workflow",
        ...nodeTypes.slice(0, 5),
        "integration",
      ],
      businessValue: "Process Automation",
      category: this.detectCategory(nodeTypes),
      integrations: nodeTypes,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate default SEO for minimal workflows
   */
  private generateDefaultSEO(
    userPrompt: string,
    sessionId: string
  ): WorkflowSEOMetadata {
    const slug = this.formatSlug("custom-workflow", sessionId);
    const shortPrompt = userPrompt.substring(0, 100);

    return {
      slug,
      title: "Custom n8n Workflow",
      description: `Custom automation workflow: ${shortPrompt}...`,
      keywords: ["n8n", "automation", "workflow", "custom", "integration"],
      businessValue: "Custom Automation",
      category: "Automation",
      integrations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Detect workflow category based on node types
   */
  private detectCategory(nodeTypes: string[]): WorkflowSEOMetadata["category"] {
    const nodeString = nodeTypes.join(" ").toLowerCase();

    if (
      nodeString.includes("slack") ||
      nodeString.includes("email") ||
      nodeString.includes("telegram")
    ) {
      return "Communication";
    }
    if (
      nodeString.includes("database") ||
      nodeString.includes("postgres") ||
      nodeString.includes("mysql")
    ) {
      return "Data Integration";
    }
    if (
      nodeString.includes("github") ||
      nodeString.includes("gitlab") ||
      nodeString.includes("docker")
    ) {
      return "DevOps";
    }
    if (
      nodeString.includes("salesforce") ||
      nodeString.includes("hubspot") ||
      nodeString.includes("pipedrive")
    ) {
      return "Sales";
    }
    if (
      nodeString.includes("stripe") ||
      nodeString.includes("paypal") ||
      nodeString.includes("square")
    ) {
      return "Analytics";
    }
    if (nodeString.includes("webhook") || nodeString.includes("http")) {
      return "Monitoring";
    }

    return "Automation";
  }
}

// Singleton instance
let seoGeneratorInstance: SEOGeneratorService | null = null;

export function getSEOGenerator(): SEOGeneratorService {
  if (!seoGeneratorInstance) {
    seoGeneratorInstance = new SEOGeneratorService();
  }
  return seoGeneratorInstance;
}
