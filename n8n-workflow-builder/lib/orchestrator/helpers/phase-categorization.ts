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
    color: 5, // Light blue (changed from 6)
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
    color: 5, // Light blue (changed from 4)
  },
  decision: {
    icon: "🔀",
    name: "Decision",
    description: "Routing & conditional logic",
    color: 2, // Yellow/orange for decision points
  },
  aggregation: {
    icon: "🔄",
    name: "Data Merging",
    description: "Merge and combine data streams",
    color: 5, // Light blue
  },
  storage: {
    icon: "💾",
    name: "Storage",
    description: "Save & persist data",
    color: 5, // Light blue (changed from 8)
  },
  integration: {
    icon: "🔗",
    name: "Integration",
    description: "External system updates",
    color: 5, // Light blue (changed from 6)
  },
  outputs: {
    icon: "🚀",
    name: "Outputs",
    description: "Actions & destinations",
    color: 6, // Light purple (changed from 7)
  },
  finalization: {
    icon: "✅",
    name: "Finalization",
    description: "Post-output processing",
    color: 5, // Light blue (changed from 1)
  },
  error: {
    icon: "⚠️",
    name: "Error Handling",
    description: "Error recovery and retry logic",
    color: 3, // Red for errors
  },
} as const;

export type PhaseName = keyof typeof PHASE_DEFINITIONS;

/**
 * Layout configuration constants
 */
export const LAYOUT_CONFIG = {
  spacing: {
    horizontal: 220, // Between nodes horizontally (legacy, not used in new layout)
    vertical: 180, // Between rows vertically
    withinPhase: 200, // Tighter spacing between nodes in same phase
    betweenPhases: 400, // Clear separation between different phases
    stickyPadding: 40, // Space around sticky edges
    stickyTopSpacing: 200, // Space above workflow nodes for sticky note descriptions (reduced from 250)
    phaseGap: 100, // Gap between phase sections (legacy, not used in new layout)
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
  "filter",
  "splitInBatches",
  "loop",
  "executeWorkflow",
  "wait",
];

/**
 * Decision node types for routing and conditional logic
 */
const DECISION_NODE_TYPES = [
  "if",
  "switch",
  "router",
];

/**
 * Aggregation node types for combining data streams
 */
const AGGREGATION_NODE_TYPES = [
  "merge",
  "aggregate",
  "combine",
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
      case "decision": return "decision";
      case "aggregation": return "aggregation";
      case "storage": return "storage";
      case "integration": return "integration";
      case "finalization": return "finalization";
      default: 
        // Log unexpected category but don't fail
        console.warn(`Unexpected node category: ${node.category} for node type ${node.type}`);
    }
  }

  // Fallback: Special case handling based on node type
  const nodeTypeBase = node.type.split(".").pop() || "";
  
  if (DECISION_NODE_TYPES.includes(nodeTypeBase)) {
    return "decision";
  }
  
  if (AGGREGATION_NODE_TYPES.includes(nodeTypeBase)) {
    return "aggregation";
  }
  
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
  decision: string[];
  aggregation: string[];
  storage: string[];
  integration: string[];
  outputs: string[];
  finalization: string[];
  error: string[];
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
    decision: [],
    aggregation: [],
    storage: [],
    integration: [],
    outputs: [],
    finalization: [],
    error: [],
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
      .filter((pos: any): pos is [number, number] => pos !== undefined);

    if (nodePositions.length > 0) {
      const yPositions = nodePositions.map((pos: [number, number]) => pos[1]);
      const minY = Math.min(...yPositions);
      const maxY = Math.max(...yPositions);
      
      // Calculate the full span including the node height
      // Add padding both above and below the nodes
      const span = maxY - minY + LAYOUT_CONFIG.dimensions.nodeHeight;
      
      // Height should cover from the top position (with space for description) to below the nodes
      // Include the top spacing for descriptions, padding, and the node span
      const totalHeight = LAYOUT_CONFIG.spacing.stickyTopSpacing + LAYOUT_CONFIG.spacing.stickyPadding + span + LAYOUT_CONFIG.spacing.stickyPadding;
      
      phaseHeights.push(totalHeight);
    }
  }

  // Use maximum height across all phases, ensuring minimum height includes space for descriptions
  return Math.max(...phaseHeights, LAYOUT_CONFIG.dimensions.minStickyHeight + LAYOUT_CONFIG.spacing.stickyTopSpacing);
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
      .filter((y: any): y is number => y !== undefined);

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