/**
 * Documentation Phase Service
 *
 * Handles the documentation phase of workflow generation, including:
 * - Sticky note generation
 * - Workflow documentation
 * - Section grouping and explanation
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from "./base";
import { TOKEN_LIMITS } from "../constants";
import { documentationOperationsResponseSchema } from "../validation/schemas";
import { DocumentationPrompts } from "../prompts/documentation";
import type {
  DocumentationOperationsResponse,
  WorkflowOperation,
} from "@/types";

// ==========================================
// Type Definitions
// ==========================================

export interface DocumentationInput {
  userPrompt: string;
  workflow: any;
  nodeMetadata: NodeMetadata[];
}

export interface NodeMetadata {
  id: string;
  name: string;
  type: string;
  purpose?: string;
  position?: [number, number];
}

export interface DocumentationOutput {
  operations: WorkflowOperation[];
  reasoning: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ==========================================
// Documentation Phase Service Implementation
// ==========================================

export class DocumentationPhaseService extends BasePhaseService<
  DocumentationInput,
  DocumentationOutput
> {
  get phaseName(): string {
    return "documentation";
  }

  /**
   * Execute the documentation phase
   */
  async execute(
    input: DocumentationInput,
    context: PhaseContext
  ): Promise<PhaseResult<DocumentationOutput>> {
    const { userPrompt, workflow, nodeMetadata } = input;

    this.logger.debug("Generating documentation for workflow");

    try {
      // Generate the documentation prompt
      const promptParts = DocumentationPrompts.getDocumentationPrompt(
        userPrompt,
        workflow,
        nodeMetadata
      );

      // Call Claude for documentation operations
      const result = await this.callClaude<DocumentationOperationsResponse>(
        promptParts,
        TOKEN_LIMITS.documentation,
        documentationOperationsResponseSchema as any,
        "generateDocumentation"
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error("Failed to generate documentation"),
          usage: result.usage,
        };
      }

      // Process and enhance operations
      const enhancedOperations = this.attachReasoningToOperations(
        result.data.operations || [],
        result.data.reasoning || ["Generated workflow documentation"]
      );

      // Validate sticky notes
      const validNotes = this.validateStickyNotes(enhancedOperations);

      this.logSuccess("Documentation generation", {
        operations: validNotes.length,
        stickyNotes: validNotes.filter((op) => op.type === "addStickyNote")
          .length,
      });

      return {
        success: true,
        data: {
          operations: validNotes,
          reasoning: result.data.reasoning || [
            "Generated workflow documentation",
          ],
          usage: result.usage,
        },
        usage: result.usage,
        reasoning: result.data.reasoning,
      };
    } catch (error) {
      this.logError("documentation phase", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Validate sticky note operations
   */
  private validateStickyNotes(
    operations: WorkflowOperation[]
  ): WorkflowOperation[] {
    return operations.filter((op) => {
      if (op.type !== "addStickyNote") {
        return true; // Keep non-sticky-note operations
      }

      const note = (op as any).note;
      if (!note) {
        this.logWarning(
          "validateStickyNotes",
          "Sticky note operation missing note object"
        );
        return false;
      }

      // Validate required fields
      if (!note.id || !note.content || !Array.isArray(note.nodeGroupIds)) {
        this.logWarning(
          "validateStickyNotes",
          `Invalid sticky note structure: ${JSON.stringify(note)}`
        );
        return false;
      }

      // Validate content starts with markdown title
      if (!note.content.startsWith("##")) {
        this.logWarning(
          "validateStickyNotes",
          "Sticky note content must start with ## for markdown title"
        );
        // Try to fix it
        note.content = `## 📝 Documentation\n\n${note.content}`;
      }

      // Validate color is in range
      if (note.color && (note.color < 1 || note.color > 7)) {
        this.logWarning(
          "validateStickyNotes",
          `Invalid color ${note.color}, using default`
        );
        note.color = 1; // Default to yellow
      }

      // Ensure color is set
      if (!note.color) {
        note.color = this.determineColorFromContent(note.content);
      }

      return true;
    });
  }

  /**
   * Determine appropriate color based on content
   */
  private determineColorFromContent(content: string): number {
    const lowerContent = content.toLowerCase();

    // Check for keywords to determine color
    if (
      lowerContent.includes("error") ||
      lowerContent.includes("warning") ||
      lowerContent.includes("critical")
    ) {
      return 4; // Red for warnings/errors
    }

    if (
      lowerContent.includes("success") ||
      lowerContent.includes("complete") ||
      lowerContent.includes("done")
    ) {
      return 2; // Green for success
    }

    if (
      lowerContent.includes("api") ||
      lowerContent.includes("integration") ||
      lowerContent.includes("external")
    ) {
      return 5; // Cyan for integrations
    }

    if (
      lowerContent.includes("ai") ||
      lowerContent.includes("ml") ||
      lowerContent.includes("model")
    ) {
      return 6; // Purple for AI/ML
    }

    if (
      lowerContent.includes("config") ||
      lowerContent.includes("setup") ||
      lowerContent.includes("initial")
    ) {
      return 7; // Orange for configuration
    }

    if (
      lowerContent.includes("data") ||
      lowerContent.includes("process") ||
      lowerContent.includes("transform")
    ) {
      return 3; // Blue for data processing
    }

    return 1; // Default to yellow
  }

  /**
   * Generate smart groupings for nodes
   */
  private generateNodeGroupings(
    nodeMetadata: NodeMetadata[]
  ): Map<string, NodeMetadata[]> {
    const groups = new Map<string, NodeMetadata[]>();

    // Group by node type patterns
    const triggers: NodeMetadata[] = [];
    const dataProcessing: NodeMetadata[] = [];
    const integrations: NodeMetadata[] = [];
    const outputs: NodeMetadata[] = [];

    for (const node of nodeMetadata) {
      const type = node.type.toLowerCase();

      if (
        type.includes("trigger") ||
        type.includes("webhook") ||
        type.includes("schedule")
      ) {
        triggers.push(node);
      } else if (
        type.includes("function") ||
        type.includes("code") ||
        type.includes("transform")
      ) {
        dataProcessing.push(node);
      } else if (
        type.includes("http") ||
        type.includes("api") ||
        type.includes("request")
      ) {
        integrations.push(node);
      } else if (
        type.includes("slack") ||
        type.includes("email") ||
        type.includes("respond")
      ) {
        outputs.push(node);
      } else {
        // Default grouping
        dataProcessing.push(node);
      }
    }

    // Create groups
    if (triggers.length > 0) {
      groups.set("triggers", triggers);
    }
    if (dataProcessing.length > 0) {
      groups.set("processing", dataProcessing);
    }
    if (integrations.length > 0) {
      groups.set("integrations", integrations);
    }
    if (outputs.length > 0) {
      groups.set("outputs", outputs);
    }

    return groups;
  }
}
