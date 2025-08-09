// lib/orchestrator/helpers/phase-categorization.ts

import { WorkflowNode } from "@/types/workflow";

/**
 * Phase definitions with visual properties
 */
export const PHASE_DEFINITIONS = {
  triggers: {
    icon: "📥",
    name: "Triggers",
    description: "Workflow entry points",
    color: 6, // Yellow
  },
  inputs: {
    icon: "📊",
    name: "Inputs",
    description: "Data collection",
    color: 5, // Blue
  },
  transforms: {
    icon: "⚙️",
    name: "Transform",
    description: "Processing & routing",
    color: 4, // Green
  },
  outputs: {
    icon: "🚀",
    name: "Outputs",
    description: "Actions & destinations",
    color: 7, // Orange
  },
} as const;

export type PhaseName = keyof typeof PHASE_DEFINITIONS;

/**
 * Layout configuration constants
 */
export const LAYOUT_CONFIG = {
  spacing: {
    horizontal: 220, // Between nodes horizontally
    vertical: 180, // Between rows vertically
    stickyPadding: 40, // Space around sticky edges
    phaseGap: 100, // Gap between phase sections
    gridSnap: 20, // Grid alignment
  },
  dimensions: {
    minStickyHeight: 200, // Minimum sticky note height
    nodeWidth: 150, // Standard node width
    nodeHeight: 100, // Standard node height
  },
};

/**
 * Transform node types that belong to the transform phase
 */
const TRANSFORM_NODE_TYPES = [
  "code",
  "function",
  "set",
  "itemLists",
  "if",
  "switch",
  "filter",
  "router",
  "merge",
  "aggregate",
  "splitInBatches",
  "loop",
  "executeWorkflow",
  "wait",
];

/**
 * Categorize a node into its appropriate phase
 */
export function categorizeNode(node: {
  type: string;
  category?: string;
}): PhaseName {
  // Use category from MCP if available (primary source of truth)
  if (node.category) {
    switch (node.category) {
      case "trigger": return "triggers";
      case "input": return "inputs";
      case "output": return "outputs";
      case "transform": return "transforms";
      default: 
        // Log unexpected category but don't fail
        console.warn(`Unexpected node category: ${node.category} for node type ${node.type}`);
    }
  }

  // Fallback: Special case handling based on node type
  const nodeTypeBase = node.type.split(".").pop() || "";
  if (TRANSFORM_NODE_TYPES.includes(nodeTypeBase)) {
    return "transforms";
  }

  // Safe fallback to transforms for uncategorized nodes
  return "transforms";
}

/**
 * Group nodes by their phases
 */
export interface PhaseGroups {
  triggers: string[];
  inputs: string[];
  transforms: string[];
  outputs: string[];
}

/**
 * Detect which phases are active in the workflow
 */
export function detectActivePhases(
  nodes: Array<{ id: string; type: string; category?: string }>
): PhaseGroups {
  const phaseGroups: PhaseGroups = {
    triggers: [],
    inputs: [],
    transforms: [],
    outputs: [],
  };

  // Categorize each node
  for (const node of nodes) {
    const phase = categorizeNode(node);
    phaseGroups[phase].push(node.id);
  }

  return phaseGroups;
}

/**
 * Calculate unified height for all sticky notes
 */
export function calculateUnifiedHeight(
  phaseGroups: PhaseGroups,
  nodes: WorkflowNode[]
): number {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const phaseHeights: number[] = [];

  for (const [phase, nodeIds] of Object.entries(phaseGroups)) {
    if (nodeIds.length === 0) continue;

    // Get positions for nodes in this phase
    const nodePositions = nodeIds
      .map((id: string) => nodeMap.get(id)?.position)
      .filter((pos): pos is [number, number] => pos !== undefined);

    if (nodePositions.length > 0) {
      const yPositions = nodePositions.map((pos: [number, number]) => pos[1]);
      const minY = Math.min(...yPositions);
      const maxY = Math.max(...yPositions);
      const span = maxY - minY + LAYOUT_CONFIG.dimensions.nodeHeight;
      phaseHeights.push(span + LAYOUT_CONFIG.spacing.stickyPadding * 2);
    }
  }

  // Use maximum height across all phases
  return Math.max(...phaseHeights, LAYOUT_CONFIG.dimensions.minStickyHeight);
}

/**
 * Detect workflow pattern based on active phases
 */
export function detectWorkflowPattern(phaseGroups: PhaseGroups): string {
  const hasPhase = (phase: PhaseName) => phaseGroups[phase].length > 0;

  if (!hasPhase("triggers") && hasPhase("transforms")) {
    return "subWorkflow"; // Called by Execute Workflow
  }

  if (
    Object.keys(phaseGroups).filter((phase) =>
      hasPhase(phase as PhaseName)
    ).length === 1 &&
    hasPhase("transforms")
  ) {
    return "transformOnly"; // Pure data processing
  }

  if (hasPhase("triggers") && hasPhase("outputs")) {
    return "standard"; // Full workflow
  }

  return "custom"; // Non-standard pattern
}

/**
 * Generate layout hints for building and documentation phases
 */
export interface LayoutHints {
  presentPhases: PhaseName[];
  workflowPattern: string;
  requiresMultiRow: boolean;
}

export function generateLayoutHints(
  phaseGroups: PhaseGroups,
  nodes: WorkflowNode[]
): LayoutHints {
  const presentPhases = (Object.keys(phaseGroups) as PhaseName[]).filter(
    (phase) => phaseGroups[phase].length > 0
  );

  // Check if nodes in any phase span multiple rows
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let requiresMultiRow = false;

  for (const nodeIds of Object.values(phaseGroups)) {
    if (nodeIds.length > 3) {
      // More than 3 nodes likely need multiple rows
      requiresMultiRow = true;
      break;
    }

    const yPositions = nodeIds
      .map((id: string) => nodeMap.get(id)?.position[1])
      .filter((y): y is number => y !== undefined);

    if (yPositions.length > 1) {
      const yRange = Math.max(...yPositions) - Math.min(...yPositions);
      if (yRange > LAYOUT_CONFIG.spacing.vertical / 2) {
        requiresMultiRow = true;
        break;
      }
    }
  }

  return {
    presentPhases,
    workflowPattern: detectWorkflowPattern(phaseGroups),
    requiresMultiRow,
  };
}