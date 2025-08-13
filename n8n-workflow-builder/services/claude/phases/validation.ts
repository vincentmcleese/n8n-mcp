/**
 * Validation Phase Service
 *
 * Handles the validation phase of workflow generation, including:
 * - Workflow validation with MCP tools
 * - Validation error fixing
 * - Workflow correction
 */

import { BasePhaseService, type PhaseContext, type PhaseResult } from "./base";
import { TOKEN_LIMITS } from "../constants";
import {
  validatedWorkflowResponseSchema,
  validationFixesResponseSchema,
} from "../validation/schemas";
import { ValidationPrompts } from "../prompts/validation";
import type {
  ClaudeValidationResponse,
  ValidationFixesResponse,
} from "@/types";
import { VALIDATION_TOOLS } from "@/lib/mcp-tools/definitions";

// ==========================================
// Type Definitions
// ==========================================

export interface ValidationInput {
  draftWorkflow: any;
}

export interface ValidationOutput extends ClaudeValidationResponse {
  // Inherits workflow, validationReport, reasoning, operations
}

export interface ValidationFixesInput {
  errors: any[];
  workflow: any;
}

// ==========================================
// Validation Phase Service Implementation
// ==========================================

export class ValidationPhaseService extends BasePhaseService<
  ValidationInput,
  ValidationOutput
> {
  get phaseName(): string {
    return "validation";
  }

  /**
   * Execute the validation phase
   */
  async execute(
    input: ValidationInput,
    context: PhaseContext
  ): Promise<PhaseResult<ValidationOutput>> {
    const { draftWorkflow } = input;

    this.logger.verbose("Validating workflow with MCP tools");

    if (!draftWorkflow) {
      return {
        success: false,
        error: new Error("No draft workflow provided for validation"),
      };
    }

    try {
      // Call Claude for validation
      // Note: Validation phase doesn't use a prefill in the same way
      // It expects Claude to use MCP tools and return a result with markers
      const result = await this.callClaudeForValidation(draftWorkflow);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error("Failed to validate workflow"),
          usage: result.usage,
        };
      }

      // Ensure the workflow has a valid flag
      if (
        result.data.workflow &&
        typeof result.data.workflow.valid === "undefined"
      ) {
        result.data.workflow.valid = true; // Default to valid if all validations passed
      }

      this.logSuccess("Workflow validation", {
        valid: result.data.workflow?.valid,
        errors: this.countValidationErrors(result.data.validationReport),
      });

      return {
        success: true,
        data: result.data,
        usage: result.usage,
        reasoning: result.data.reasoning,
      };
    } catch (error) {
      this.logError("validation phase", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Generate entity fixes for validation errors
   */
  async generateEntityFixes(input: {
    errors: any[];
    entities: {
      nodes?: any[];
      connections?: any;
    };
    workflow: any;
  }): Promise<
    PhaseResult<{
      fixedNodes?: any[];
      fixedConnections?: any;
      reasoning: string[];
    }>
  > {
    const { errors, entities, workflow } = input;

    this.logger.verbose("Generating entity fixes for validation errors");

    if (!errors || errors.length === 0) {
      return {
        success: true,
        data: {
          reasoning: ["No validation errors to fix"],
        },
      };
    }

    try {
      // Generate the entity fixes prompt
      const promptParts = ValidationPrompts.getEntityFixesPrompt(
        errors,
        entities,
        workflow
      );

      // Call Claude for fixes
      const result = await this.callClaude<{
        fixedNodes?: any[];
        fixedConnections?: any;
        reasoning: string[];
      }>(
        promptParts,
        TOKEN_LIMITS.validationFixes,
        undefined, // We'll validate the structure ourselves
        "generateEntityFixes"
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || new Error("Failed to generate entity fixes"),
          usage: result.usage,
        };
      }

      this.logSuccess("Entity fixes generated", {
        nodesFixed: result.data.fixedNodes?.length || 0,
        connectionsFixed: !!result.data.fixedConnections,
        errorCount: errors.length,
      });

      return {
        success: true,
        data: result.data,
        usage: result.usage,
      };
    } catch (error) {
      this.logError("generateEntityFixes", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Generate fixes for validation errors (OLD - keeping for compatibility)
   */
  async generateValidationFixes(
    input: ValidationFixesInput
  ): Promise<PhaseResult<ValidationFixesResponse>> {
    const { errors, workflow } = input;

    this.logger.verbose("Generating fixes for validation errors");

    if (!errors || errors.length === 0) {
      return {
        success: true,
        data: {
          fixes: [],
          reasoning: ["No validation errors to fix"],
        },
      };
    }

    try {
      // Generate the fixes prompt
      const promptParts = ValidationPrompts.getValidationFixesPrompt(
        errors,
        workflow
      );

      // Call Claude for fixes
      const result = await this.callClaude<ValidationFixesResponse>(
        promptParts,
        TOKEN_LIMITS.validationFixes,
        validationFixesResponseSchema as any,
        "generateFixes"
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          error:
            result.error || new Error("Failed to generate validation fixes"),
          usage: result.usage,
        };
      }

      const fixCount = Array.isArray(result.data)
        ? result.data.length
        : result.data.fixes?.length || 0;
      this.logSuccess("Validation fixes generated", {
        fixCount,
        errorCount: errors.length,
      });

      return {
        success: true,
        data: result.data,
        usage: result.usage,
        reasoning: Array.isArray(result.data)
          ? undefined
          : result.data.reasoning,
      };
    } catch (error) {
      this.logError("generateValidationFixes", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Special handling for validation phase which uses MCP tools
   */
  private async callClaudeForValidation(
    draftWorkflow: any
  ): Promise<PhaseResult<ValidationOutput>> {
    // Get the validation prompt from the prompts directory
    const promptParts = ValidationPrompts.getValidationPrompt(draftWorkflow);

    try {
      // Get available tools for validation phase
      const tools = Object.values(VALIDATION_TOOLS);

      // For validation, we don't use a prefill since Claude needs to call MCP tools first
      const params = {
        systemPrompt: promptParts.system,
        userMessage: promptParts.user,
        maxTokens: TOKEN_LIMITS.validation,
        phase: this.phaseName,
        tools, // Pass validation tools for Claude to use
      };

      const completion = await this.client.completeJSON(params);

      // Parse the response looking for the result markers
      const text = completion.fullContent.trim();
      const markerMatch = text.match(
        /=== BEGIN RESULT ===\s*([\s\S]*?)\s*=== END RESULT ===/
      );

      if (!markerMatch) {
        this.logError(
          "callClaudeForValidation",
          "No result markers found in response"
        );
        throw new Error("Invalid response format - missing result markers");
      }

      try {
        const jsonStr = markerMatch[1].trim();
        const result = JSON.parse(jsonStr);

        // Validate against schema
        const validationResult =
          validatedWorkflowResponseSchema.safeParse(result);
        if (!validationResult.success) {
          this.logError(
            "callClaudeForValidation",
            `Schema validation failed: ${validationResult.error}`
          );
          throw new Error("Response does not match expected schema");
        }

        return {
          success: true,
          data: result as ValidationOutput,
          usage: completion.usage,
        };
      } catch (parseError) {
        this.logError(
          "callClaudeForValidation",
          `Failed to parse JSON: ${parseError}`
        );
        throw new Error("Failed to parse validation result JSON");
      }
    } catch (error) {
      this.logError("callClaudeForValidation", error);
      throw error;
    }
  }

  /**
   * Count validation errors in the report
   */
  private countValidationErrors(report: any): number {
    if (!report) return 0;

    let count = 0;

    // Count errors in different sections of the report
    if (report.workflow?.errors) {
      count += Array.isArray(report.workflow.errors)
        ? report.workflow.errors.length
        : 0;
    }

    if (report.initial?.workflow?.errors) {
      count += Array.isArray(report.initial.workflow.errors)
        ? report.initial.workflow.errors.length
        : 0;
    }

    if (report.final?.workflow?.errors) {
      count += Array.isArray(report.final.workflow.errors)
        ? report.final.workflow.errors.length
        : 0;
    }

    return count;
  }
}
