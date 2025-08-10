/**
 * Zod Validation Schemas for Claude Responses
 * 
 * Type-safe validation for all Claude API responses across different phases.
 * These schemas ensure that responses conform to expected structures.
 */

import { z } from 'zod';
import type {
  TokenUsage,
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse,
  ConfigurationOperationsResponse,
  WorkflowBuildResponse,
  ValidatedWorkflowResponse,
  DocumentationOperationsResponse,
  DiscoverNodeOperation,
  SelectNodeOperation,
  RequestClarificationOperation,
  ConfigureNodeOperation,
  AddFieldOperation,
  UpdateFieldOperation,
  RemoveFieldOperation,
  AddConnectionOperation,
  RemoveConnectionOperation,
  AddNodeOperation,
  UpdateWorkflowSettingsOperation,
  SetWorkflowNameOperation,
  AddStickyNoteOperation
} from '@/types/claude';
import type { WorkflowNode, WorkflowSettings } from '@/types/workflow';
import type { N8nWorkflowConnections } from '@/types/n8n';

// ==========================================
// Common Schema Components
// ==========================================

/**
 * Token usage schema
 * @see TokenUsage in @/types/claude/responses.ts
 */
export const tokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
} satisfies z.ZodRawShape).optional();

/**
 * Base operation schema
 */
export const baseOperationSchema = z.object({
  type: z.string(),
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
});

/**
 * Reasoning array schema
 */
export const reasoningSchema = z.array(z.string());

// ==========================================
// Discovery Phase Schemas
// ==========================================

/**
 * Intent analysis response schema (optimized for task-based discovery)
 */
export const intentAnalysisSchema = z.object({
  intent: z.string(),
  logic_flow: z.array(z.object({
    step: z.number(),
    action: z.string(),
    type: z.enum(['trigger', 'process', 'condition', 'output']),
    task: z.string().optional().nullable(), // Exact MCP task name if applicable
    nodeType: z.string().optional().nullable(), // For non-task nodes
  })),
  matched_tasks: z.array(z.string()), // EXACT task names from MCP
  task_selection_reasoning: z.array(z.object({
    task: z.string(),
    reason: z.string(),
  })).optional(), // Optional to maintain backward compatibility
  unmatched_capabilities: z.array(z.object({
    name: z.string(),
    description: z.string(),
    searchTerms: z.array(z.string()),
  })),
  search_suggestions: z.array(z.object({
    capability: z.string(),
    primary: z.string(),
    alternatives: z.array(z.string()),
  })),
  workflow_pattern: z.string(),
  complexity: z.union([z.enum(['simple', 'medium', 'complex']), z.literal('unknown')]),
  clarification_needed: z.boolean(),
  clarification: z.object({
    question: z.string(),
    context: z.string(),
    suggestions: z.array(z.string()),
  }).optional(),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

/**
 * @deprecated Since 2024-01-06 - Phase 1 of discovery refactor
 * @removal-target After Phase 5 complete and tested
 * @todo Remove after full migration to task-based discovery
 * @see intentAnalysisSchema for the new implementation
 * 
 * Legacy intent analysis schema (for backward compatibility)
 */
export const legacyIntentAnalysisSchema = z.object({
  intent: z.string(),
  requiredCapabilities: z.array(z.string()),
  suggestedSearchTerms: z.array(z.string()),
  nodeRecommendations: z.array(z.object({
    type: z.string(),
    purpose: z.string(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
  })),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

/**
 * Discover node operation schema
 * @see DiscoverNodeOperation in @/types/claude/operations.ts
 */
export const discoverNodeOperationSchema = z.object({
  type: z.literal('discoverNode'),
  node: z.object({
    id: z.string(),
    type: z.string(),
    purpose: z.string(),
  }),
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
} satisfies z.ZodRawShape);

/**
 * Select node operation schema
 * @see SelectNodeOperation in @/types/claude/operations.ts
 */
export const selectNodeOperationSchema = z.object({
  type: z.literal('selectNode'),
  nodeId: z.string(),
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
} satisfies z.ZodRawShape);

/**
 * Request clarification operation schema
 * @see RequestClarificationOperation in @/types/claude/operations.ts
 */
export const requestClarificationOperationSchema = z.object({
  type: z.literal('requestClarification'),
  questionId: z.string(),
  question: z.string(),
  context: z.object({
    reason: z.string(),
  }).passthrough(), // Allow additional properties
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
} satisfies z.ZodRawShape);

/**
 * Discovery operations response schema
 */
export const discoveryOperationsResponseSchema = z.object({
  operations: z.array(z.union([
    discoverNodeOperationSchema,
    selectNodeOperationSchema,
    requestClarificationOperationSchema,
  ])),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

// ==========================================
// Configuration Phase Schemas
// ==========================================

/**
 * Configure node operation schema
 * @see ConfigureNodeOperation in @/types/claude/operations.ts
 */
export const configureNodeOperationSchema = z.object({
  type: z.literal('configureNode'),
  nodeId: z.string(),
  nodeType: z.string().optional(),
  purpose: z.string().optional(),
  config: z.record(z.any()),
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
} satisfies z.ZodRawShape);

/**
 * Configuration operations response schema
 */
export const configurationOperationsResponseSchema = z.object({
  operations: z.array(configureNodeOperationSchema),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

/**
 * Node requirements response schema
 */
// Deprecated (MVP flow no longer uses this). Keep exported in index for compatibility if needed.
// Removed in MVP; kept here only if needed for older code paths (not exported).
const nodeRequirementsResponseSchema = z.object({
  needsAuth: z.boolean(),
  needsProperties: z.array(z.string()),
  suggestedTask: z.string().nullable().optional(),
  needsDocumentation: z.boolean(),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

// ==========================================
// Building Phase Schemas
// ==========================================

/**
 * Workflow node schema
 * @see WorkflowNode in @/types/workflow.ts (base type)
 * Extended with n8n-specific fields for building phase
 */
export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.any()),
  // Additional n8n-specific fields for building phase
  name: z.string(),
  typeVersion: z.number().optional(),
  credentials: z.record(z.any()).optional(),
  onError: z.string().optional(),
  retryOnFail: z.boolean().optional(),
  maxTries: z.number().optional(),
  waitBetweenTries: z.number().optional(),
  alwaysOutputData: z.boolean().optional(),
  executeOnce: z.boolean().optional(),
  continueOnFail: z.boolean().optional(),
});

/**
 * Workflow connection schema
 * @see N8nWorkflowConnections in @/types/n8n/connection.ts
 */
export const workflowConnectionSchema = z.record(
  z.object({
    main: z.array(z.array(z.object({
      node: z.string(),
      type: z.literal('main'),
      index: z.number(),
    })))
  })
);

/**
 * Workflow settings schema
 * Note: This is for n8n build response which has different structure than WorkflowSettings
 */
export const workflowSettingsSchema = z.object({
  executionOrder: z.string().optional(),
  saveDataSuccessExecution: z.string().optional(),
  saveDataErrorExecution: z.string().optional(),
  saveManualExecutions: z.boolean().optional(),
  callerPolicy: z.string().optional(),
  errorWorkflow: z.string().optional(),
  timezone: z.string().optional(),
});

/**
 * Workflow build response schema
 * @see WorkflowBuildResponse in @/types/claude/responses.ts
 */
export const workflowBuildResponseSchema = z.object({
  name: z.string(),
  nodes: z.array(workflowNodeSchema),
  connections: workflowConnectionSchema,
  settings: workflowSettingsSchema.optional(),
  phases: z.array(z.object({
    type: z.string(),
    description: z.string(),
    nodeIds: z.array(z.string()),
  })).optional(),
  reasoning: reasoningSchema,
  operations: z.array(z.any()).optional(), // Building phase doesn't use operations
  usage: tokenUsageSchema,
});

// ==========================================
// Validation Phase Schemas
// ==========================================

/**
 * Add field operation schema
 * @see AddFieldOperation in @/types/claude/operations.ts
 */
export const addFieldOperationSchema = z.object({
  type: z.literal('addField'),
  nodeId: z.string(),
  field: z.string(),
  value: z.any(),
} satisfies z.ZodRawShape);

/**
 * Update field operation schema
 * @see UpdateFieldOperation in @/types/claude/operations.ts
 */
export const updateFieldOperationSchema = z.object({
  type: z.literal('updateField'),
  nodeId: z.string(),
  field: z.string(),
  value: z.any(),
} satisfies z.ZodRawShape);

/**
 * Remove field operation schema
 * @see RemoveFieldOperation in @/types/claude/operations.ts
 */
export const removeFieldOperationSchema = z.object({
  type: z.literal('removeField'),
  nodeId: z.string(),
  field: z.string(),
} satisfies z.ZodRawShape);

/**
 * Add connection operation schema
 * @see AddConnectionOperation in @/types/claude/operations.ts
 */
export const addConnectionOperationSchema = z.object({
  type: z.literal('addConnection'),
  from: z.string(),
  to: z.string(),
} satisfies z.ZodRawShape);

/**
 * Remove connection operation schema
 * @see RemoveConnectionOperation in @/types/claude/operations.ts
 */
export const removeConnectionOperationSchema = z.object({
  type: z.literal('removeConnection'),
  from: z.string(),
  to: z.string(),
} satisfies z.ZodRawShape);

/**
 * Add node operation schema
 * @see AddNodeOperation in @/types/claude/operations.ts
 */
export const addNodeOperationSchema = z.object({
  type: z.literal('addNode'),
  node: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    position: z.tuple([z.number(), z.number()]).optional(),
    parameters: z.record(z.any()).optional(),
  }),
} satisfies z.ZodRawShape);

/**
 * Update workflow settings operation schema
 * @see UpdateWorkflowSettingsOperation in @/types/claude/operations.ts
 */
export const updateWorkflowSettingsOperationSchema = z.object({
  type: z.literal('updateWorkflowSettings'),
  settings: z.record(z.any()),
} satisfies z.ZodRawShape);

/**
 * Set workflow name operation schema
 * @see SetWorkflowNameOperation in @/types/claude/operations.ts
 */
export const setWorkflowNameOperationSchema = z.object({
  type: z.literal('setWorkflowName'),
  name: z.string(),
} satisfies z.ZodRawShape);

/**
 * Validation fixes response schema
 */
export const validationFixesResponseSchema = z.object({
  fixes: z.array(z.union([
    addFieldOperationSchema,
    updateFieldOperationSchema,
    removeFieldOperationSchema,
    addConnectionOperationSchema,
    removeConnectionOperationSchema,
    addNodeOperationSchema,
    updateWorkflowSettingsOperationSchema,
    setWorkflowNameOperationSchema,
  ])),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

/**
 * Validated workflow response schema
 */
export const validatedWorkflowResponseSchema = z.object({
  workflow: z.object({
    name: z.string(),
    nodes: z.array(workflowNodeSchema),
    connections: workflowConnectionSchema,
    settings: workflowSettingsSchema.optional(),
    valid: z.boolean(),
  }),
  validationReport: z.any(), // Complex nested structure
  reasoning: reasoningSchema,
  operations: z.array(z.any()).optional(),
  usage: tokenUsageSchema,
});

// ==========================================
// Documentation Phase Schemas
// ==========================================

/**
 * Add sticky note operation schema
 * @see AddStickyNoteOperation in @/types/claude/operations.ts
 */
export const addStickyNoteOperationSchema = z.object({
  type: z.literal('addStickyNote'),
  note: z.object({
    id: z.string(),
    content: z.string(),
    nodeGroupIds: z.array(z.string()),
    color: z.number().min(1).max(7).optional(),
  }),
  reasoning: z.string().optional(),
  operationIndex: z.number().optional(),
} satisfies z.ZodRawShape);

/**
 * Documentation operations response schema
 */
export const documentationOperationsResponseSchema = z.object({
  operations: z.array(addStickyNoteOperationSchema),
  reasoning: reasoningSchema,
  usage: tokenUsageSchema,
});

// ==========================================
// Helper Functions
// ==========================================

/**
 * Validate a Claude response against its schema
 */
export function validateResponse<T>(
  response: unknown,
  schema: z.ZodSchema<T>
): { success: boolean; data?: T; error?: z.ZodError } {
  const result = schema.safeParse(response);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Get schema for a specific phase
 */
export function getPhaseSchema(phase: string): z.ZodSchema | null {
  switch (phase) {
    case 'discovery':
      return discoveryOperationsResponseSchema;
    case 'configuration':
      return configurationOperationsResponseSchema;
    case 'building':
      return workflowBuildResponseSchema;
    case 'validation':
      return validatedWorkflowResponseSchema;
    case 'documentation':
      return documentationOperationsResponseSchema;
    default:
      return null;
  }
}

// ==========================================
// Export All Schemas
// ==========================================

export const Schemas = {
  // Common
  tokenUsageSchema,
  baseOperationSchema,
  reasoningSchema,
  
  // Discovery
  intentAnalysisSchema,
  discoveryOperationsResponseSchema,
  
  // Configuration
  configurationOperationsResponseSchema,
  nodeRequirementsResponseSchema,
  
  // Building
  workflowBuildResponseSchema,
  
  // Validation
  validationFixesResponseSchema,
  validatedWorkflowResponseSchema,
  
  // Documentation
  documentationOperationsResponseSchema,
  
  // Helpers
  validateResponse,
  getPhaseSchema,
};