/**
 * Type Guard Functions
 *
 * Runtime type checking functions for safe type narrowing.
 */

import type {
  WorkflowNode,
  WorkflowConnection,
  WorkflowPhase,
  ValidationError,
} from "../workflow";

import type {
  N8nNode,
  N8nConnection,
  N8nWorkflowConnections,
  NodeParameter,
} from "../n8n";

import type { N8nWorkflow, N8nWorkflowSettings } from "../n8n/workflow";

import type {
  ValidationIssue,
  ValidationReport,
  ValidationSeverity,
} from "../validation";

import type {
  ClaudeAnalysisResponse,
  DiscoveryOperationsResponse,
  ConfigurationOperationsResponse,
  WorkflowBuildResponse,
  ValidatedWorkflowResponse,
  DocumentationOperationsResponse,
  BaseClaudeResponse,
} from "../claude";

// ==========================================
// Workflow Type Guards
// ==========================================

export function isWorkflowNode(obj: any): obj is WorkflowNode {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.id === "string" &&
    typeof obj.type === "string" &&
    Array.isArray(obj.position) &&
    obj.position.length === 2 &&
    typeof obj.position[0] === "number" &&
    typeof obj.position[1] === "number" &&
    typeof obj.parameters === "object"
  );
}

export function isWorkflowConnection(obj: any): obj is WorkflowConnection {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.source === "string" &&
    typeof obj.target === "string"
  );
}

export function isWorkflowPhase(value: any): value is WorkflowPhase {
  return [
    "discovery",
    "configuration",
    "validation",
    "building",
    "documentation",
    "complete",
  ].includes(value);
}

export function isValidationError(obj: any): obj is ValidationError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.nodeId === "string" &&
    typeof obj.message === "string" &&
    ["error", "warning"].includes(obj.severity)
  );
}

// ==========================================
// n8n Type Guards
// ==========================================

export function isN8nNode(obj: any): obj is N8nNode {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.type === "string" &&
    typeof obj.typeVersion === "number" &&
    Array.isArray(obj.position) &&
    obj.position.length === 2 &&
    typeof obj.position[0] === "number" &&
    typeof obj.position[1] === "number" &&
    typeof obj.parameters === "object"
  );
}

export function isN8nConnection(obj: any): obj is N8nConnection {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.node === "string" &&
    obj.type === "main" &&
    typeof obj.index === "number"
  );
}

export function isN8nWorkflowConnections(
  obj: any
): obj is N8nWorkflowConnections {
  if (typeof obj !== "object" || obj === null) return false;

  return Object.entries(obj).every(([key, value]) => {
    if (typeof key !== "string") return false;
    if (typeof value !== "object" || value === null) return false;
    if (!("main" in (value as any)) || !Array.isArray((value as any).main))
      return false;

    return (value as any).main.every(
      (output: any) =>
        Array.isArray(output) &&
        output.every((conn: any) => isN8nConnection(conn))
    );
  });
}

export function isNodeParameter(obj: any): obj is NodeParameter {
  if (typeof obj !== "object" || obj === null) return false;

  return Object.entries(obj).every(([key, value]) => {
    return (
      typeof key === "string" &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null ||
        isNodeParameter(value) ||
        (Array.isArray(value) &&
          value.every(
            (v) =>
              typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean" ||
              v === null ||
              isNodeParameter(v)
          )))
    );
  });
}

export function isN8nWorkflow(obj: any): obj is N8nWorkflow {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.name === "string" &&
    Array.isArray(obj.nodes) &&
    obj.nodes.every((node: any) => isN8nNode(node)) &&
    isN8nWorkflowConnections(obj.connections)
  );
}

export function isN8nWorkflowSettings(obj: any): obj is N8nWorkflowSettings {
  if (typeof obj !== "object" || obj === null) return false;

  const validExecutionOrders = ["v0", "v1"];
  const validSaveDataOptions = ["all", "none"];

  if (
    obj.executionOrder &&
    !validExecutionOrders.includes(obj.executionOrder)
  ) {
    return false;
  }

  if (
    obj.saveDataSuccessExecution &&
    !validSaveDataOptions.includes(obj.saveDataSuccessExecution)
  ) {
    return false;
  }

  if (
    obj.saveDataErrorExecution &&
    !validSaveDataOptions.includes(obj.saveDataErrorExecution)
  ) {
    return false;
  }

  return true;
}

// ==========================================
// Validation Type Guards
// ==========================================

export function isValidationSeverity(value: any): value is ValidationSeverity {
  return ["error", "warning", "info"].includes(value);
}

export function isValidationIssue(obj: any): obj is ValidationIssue {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.type === "string" &&
    isValidationSeverity(obj.severity) &&
    typeof obj.message === "string"
  );
}

export function isValidationReport(obj: any): obj is ValidationReport {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.valid === "boolean" &&
    typeof obj.timestamp === "string" &&
    typeof obj.summary === "object" &&
    Array.isArray(obj.nodes) &&
    typeof obj.connections === "object" &&
    typeof obj.settings === "object" &&
    Array.isArray(obj.issues)
  );
}

// ==========================================
// Claude Response Type Guards
// ==========================================

export function isBaseClaudeResponse(obj: any): obj is BaseClaudeResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Array.isArray(obj.reasoning) &&
    obj.reasoning.every((r: any) => typeof r === "string")
  );
}

export function isClaudeAnalysisResponse(
  obj: any
): obj is ClaudeAnalysisResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    typeof anyObj.intent === "string" &&
    Array.isArray(anyObj.logic_flow) &&
    Array.isArray(anyObj.matched_tasks) &&
    Array.isArray(anyObj.unmatched_capabilities) &&
    Array.isArray(anyObj.search_suggestions) &&
    typeof anyObj.workflow_pattern === "string" &&
    typeof anyObj.clarification_needed === "boolean"
  );
}

export function isDiscoveryOperationsResponse(
  obj: any
): obj is DiscoveryOperationsResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    Array.isArray(anyObj.operations) &&
    anyObj.operations.every(
      (op: any) =>
        typeof op === "object" &&
        typeof op.type === "string" &&
        [
          "discoverNode",
          "selectNode",
          "deselectNode",
          "requestClarification",
        ].includes(op.type)
    )
  );
}

export function isConfigurationOperationsResponse(
  obj: any
): obj is ConfigurationOperationsResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    Array.isArray(anyObj.operations) &&
    anyObj.operations.every(
      (op: any) =>
        typeof op === "object" &&
        op.type === "configureNode" &&
        typeof op.nodeId === "string" &&
        typeof op.config === "object"
    )
  );
}

export function isWorkflowBuildResponse(
  obj: any
): obj is WorkflowBuildResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    typeof anyObj.name === "string" &&
    Array.isArray(anyObj.nodes) &&
    typeof anyObj.connections === "object" &&
    anyObj.connections !== null &&
    typeof anyObj.settings === "object"
  );
}

export function isValidatedWorkflowResponse(
  obj: any
): obj is ValidatedWorkflowResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    typeof anyObj.workflow === "object" &&
    typeof anyObj.workflow.name === "string" &&
    Array.isArray(anyObj.workflow.nodes) &&
    typeof anyObj.workflow.connections === "object" &&
    anyObj.workflow.connections !== null &&
    typeof anyObj.validationReport === "object"
  );
}

export function isDocumentationOperationsResponse(
  obj: any
): obj is DocumentationOperationsResponse {
  if (!isBaseClaudeResponse(obj)) return false;
  const anyObj = obj as any;
  return (
    Array.isArray(anyObj.operations) &&
    anyObj.operations.every(
      (op: any) =>
        typeof op === "object" &&
        op.type === "addStickyNote" &&
        typeof op.note === "object" &&
        typeof op.note.id === "string" &&
        typeof op.note.content === "string" &&
        Array.isArray(op.note.nodeGroupIds)
    )
  );
}

// ==========================================
// Utility Type Guards
// ==========================================

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function isString(value: any): value is string {
  return typeof value === "string";
}

export function isNumber(value: any): value is number {
  return typeof value === "number" && !isNaN(value);
}

export function isBoolean(value: any): value is boolean {
  return typeof value === "boolean";
}

export function isArray<T = any>(value: any): value is T[] {
  return Array.isArray(value);
}

export function isObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasProperty<K extends PropertyKey>(
  obj: object,
  prop: K
): obj is object & Record<K, unknown> {
  return prop in obj;
}
