# Visual Workflow Layout System - Implementation Plan

## **Objective**

Create magazine-quality n8n workflows with professional spacing and organized sticky note backgrounds that group nodes by workflow phases.

## **Core Concept**

- **Sticky notes as backgrounds** behind groups of related nodes
- **Unified-dynamic height** system for visual consistency
- **Phase-based organization** with intelligent categorization
- **Adaptive layout** supporting all workflow patterns

## **Phase Organization System**

### **9 Workflow Phases with Enhanced Categorization**

```javascript
const PHASE_DEFINITIONS = {
  triggers: {
    icon: "📥",
    name: "Triggers",
    description: "Workflow entry points",
    color: 6  // Yellow
  },
  inputs: {
    icon: "📊", 
    name: "Inputs",
    description: "Data collection",
    color: 5  // Blue
  },
  transforms: {
    icon: "⚙️",
    name: "Transform",
    description: "Processing & routing",
    color: 4  // Green
  },
  decision: {
    icon: "🔀",
    name: "Decision",
    description: "Routing & conditional logic",
    color: 3  // Purple/Violet
  },
  aggregation: {
    icon: "🔄",
    name: "Aggregation",
    description: "Combining data streams",
    color: 2  // Cyan
  },
  storage: {
    icon: "💾",
    name: "Storage",
    description: "Save & persist data",
    color: 8  // Pink
  },
  integration: {
    icon: "🔗",
    name: "Integration",
    description: "External system updates",
    color: 6  // Yellow
  },
  outputs: {
    icon: "🚀",
    name: "Outputs", 
    description: "Actions & destinations",
    color: 7  // Orange
  },
  finalization: {
    icon: "✅",
    name: "Finalization",
    description: "Post-output processing",
    color: 1  // Gray
  }
};
```

### **Category Mapping Logic**

```javascript
function categorizeNode(node) {
  // Primary category mapping
  if (node.category === "trigger") return "triggers";
  if (node.category === "input") return "inputs";
  if (node.category === "output") return "outputs";
  if (node.category === "transform") return "transforms";
  
  // Special case handling
  const TRANSFORM_NODE_TYPES = [
    "code", "function", "set", "itemLists",
    "if", "switch", "filter", "router",
    "merge", "aggregate", "splitInBatches",
    "loop", "executeWorkflow", "wait"
  ];
  
  const nodeTypeBase = node.type.split('.').pop();
  if (TRANSFORM_NODE_TYPES.includes(nodeTypeBase)) {
    return "transforms";
  }
  
  // Safe fallback
  return "transforms";
}
```

## **Layout Configuration**

### **Grid System Constants**

```javascript
const LAYOUT_CONFIG = {
  spacing: {
    horizontal: 220,        // Between nodes horizontally
    vertical: 180,          // Between rows vertically
    stickyPadding: 80,      // Space around sticky edges - increased for better padding
    stickyTopSpacing: 250,  // Space above workflow nodes for sticky note title & description
    phaseGap: 100,          // Gap between phase sections
    gridSnap: 20,           // Grid alignment
    promoStickyOffset: 150  // Extra offset for promotional sticky to the left
  },
  
  dimensions: {
    minStickyHeight: 200,   // Minimum sticky note height
    nodeWidth: 150,         // Standard node width
    nodeHeight: 100,        // Standard node height
    promoStickyWidth: 280   // Fixed width for promotional sticky
  }
};
```

### **Unified-Dynamic Height Strategy**

```javascript
function calculateUnifiedHeight(phaseGroups, nodes) {
  const phaseHeights = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  for (const [phase, nodeIds] of Object.entries(phaseGroups)) {
    if (nodeIds.length === 0) continue;
    
    // Get actual node positions
    const nodePositions = nodeIds
      .map(id => nodeMap.get(id)?.position)
      .filter(pos => pos !== undefined);
    
    if (nodePositions.length > 0) {
      const yPositions = nodePositions.map(pos => pos[1]);
      const minY = Math.min(...yPositions);
      const maxY = Math.max(...yPositions);
      
      // Calculate the full span including the node height
      const span = maxY - minY + LAYOUT_CONFIG.dimensions.nodeHeight;
      
      // Height should cover from the top position (with space for description) to below the nodes
      const totalHeight = LAYOUT_CONFIG.spacing.stickyTopSpacing + 
                         LAYOUT_CONFIG.spacing.stickyPadding + 
                         span + 
                         LAYOUT_CONFIG.spacing.stickyPadding;
      
      phaseHeights.push(totalHeight);
    }
  }
  
  // Use maximum height across all phases, ensuring minimum height includes space for descriptions
  return Math.max(...phaseHeights, 
                  LAYOUT_CONFIG.dimensions.minStickyHeight + LAYOUT_CONFIG.spacing.stickyTopSpacing);
}

// Calculate unified top position for ALL sticky notes
function calculateStickyTopY(nodes, unifiedHeight) {
  const allYPositions = nodes.map(n => n.position[1]);
  const globalMinY = allYPositions.length > 0 ? Math.min(...allYPositions) : 300;
  
  // Ensure sticky notes end well above the topmost node
  // The bottom of the sticky should be at least stickyPadding above the topmost node
  return globalMinY - unifiedHeight - LAYOUT_CONFIG.spacing.stickyPadding;
}
```

## **Adaptive Phase Detection**

### **Active Phase Discovery**

```javascript
function detectActivePhases(discoveredNodes) {
  const phaseGroups = {
    triggers: [],
    inputs: [],
    transforms: [],
    outputs: []
  };
  
  // Categorize each node
  for (const node of discoveredNodes) {
    const phase = categorizeNode(node);
    phaseGroups[phase].push(node.id);
  }
  
  // Remove empty phases
  const activePhases = {};
  for (const [phase, nodeIds] of Object.entries(phaseGroups)) {
    if (nodeIds.length > 0) {
      activePhases[phase] = nodeIds;
    }
  }
  
  return activePhases;
}
```

### **Workflow Pattern Detection**

```javascript
function detectWorkflowPattern(activePhases) {
  const hasPhase = (phase) => activePhases[phase]?.length > 0;
  
  if (!hasPhase("triggers") && hasPhase("transforms")) {
    return "subWorkflow";  // Called by Execute Workflow
  }
  
  if (Object.keys(activePhases).length === 1 && hasPhase("transforms")) {
    return "transformOnly";  // Pure data processing
  }
  
  if (hasPhase("triggers") && hasPhase("outputs")) {
    return "standard";  // Full workflow
  }
  
  return "custom";  // Non-standard pattern
}
```

## **Cross-Phase Branching Solution**

### **Visual Bridge Pattern**

```javascript
function handleBranchingNodes(node, branches, phaseGroups) {
  if (!["if", "switch", "router"].includes(node.type.split('.').pop())) {
    return null;
  }
  
  return {
    branchingNode: {
      phase: "transforms",
      position: calculateCenterPosition(branches),
      visualTreatment: "centered"
    },
    
    branches: branches.map((branch, index) => ({
      targetPhase: categorizeNode(branch),
      position: calculateBranchPosition(branch, index),
      connection: {
        type: "visual-bridge",
        extends: branch.phase !== "transforms"
      }
    })),
    
    stickyExtension: {
      enabled: true,
      overlap: 20  // Pixels to extend into next phase
    }
  };
}
```

### **Visual Representation**

```
[⚙️ Transform     ] | [🚀 Outputs    ]
[                 ] | [              ]
[IF Node --------+-]-|→[Slack -------]
[              | ] | [              ]
[              +-]-|→[Email -------]
```

## **Enhanced Discovery Output Structure**

### **Updated Metadata Format**

```typescript
interface EnhancedDiscoveryMetadata {
  // Existing fields
  taskNodes: string[];
  searchedNodes: string[];
  workflow_pattern: string;
  complexity: string;
  
  // New phase grouping
  phaseGroups: {
    triggers: string[];    // Node IDs in triggers phase
    inputs: string[];      // Node IDs in inputs phase
    transforms: string[];  // Node IDs in transforms phase
    outputs: string[];     // Node IDs in outputs phase
  };
  
  // Layout hints for building/documentation phases
  layoutHints: {
    presentPhases: string[];           // Active phases only
    workflowPattern: string;           // standard/subWorkflow/transformOnly
    branchingNodes: string[];          // Nodes that create branches
    convergencePoints: string[];       // Nodes where branches merge
    isolatedNodes: string[];           // Nodes without connections
    requiresMultiRow: boolean;         // Needs vertical expansion
  };
  
  // Visual requirements for documentation phase
  visualRequirements: {
    unifiedHeight: number;             // Calculated max height
    phaseSpacing: number;              // Dynamic spacing
    crossPhaseBranching: boolean;      // Has cross-phase connections
    estimatedWidth: number;            // Total workflow width
  };
}
```

## **Implementation Phases**

### **Phase 1: Discovery Runner Enhancement**

```javascript
// In discovery.runner.ts
function enhanceDiscoveryOutput(discoveredNodes, operations) {
  // Categorize nodes into phases
  const phaseGroups = detectActivePhases(discoveredNodes);
  
  // Detect layout requirements
  const layoutHints = {
    presentPhases: Object.keys(phaseGroups),
    workflowPattern: detectWorkflowPattern(phaseGroups),
    branchingNodes: identifyBranchingNodes(discoveredNodes),
    convergencePoints: identifyConvergencePoints(discoveredNodes),
    isolatedNodes: identifyIsolatedNodes(discoveredNodes),
    requiresMultiRow: checkMultiRowRequirement(discoveredNodes)
  };
  
  // Calculate visual requirements
  const visualRequirements = {
    unifiedHeight: 0,  // Will be calculated in building phase
    phaseSpacing: calculatePhaseSpacing(phaseGroups),
    crossPhaseBranching: detectCrossPhaseBranching(discoveredNodes),
    estimatedWidth: Object.keys(phaseGroups).length * 320
  };
  
  return {
    phaseGroups,
    layoutHints,
    visualRequirements
  };
}
```

### **Phase 2: Building Phase Layout**

```javascript
// In building.runner.ts
function applyPhaseLayout(nodes, metadata) {
  const { phaseGroups, layoutHints, visualRequirements } = metadata;
  
  // Step 1: Calculate positions for each phase
  const phasePositions = calculatePhasePositions(phaseGroups, layoutHints);
  
  // Step 2: Position nodes within phases
  const nodePositions = positionNodesInPhases(nodes, phasePositions, phaseGroups);
  
  // Step 3: Calculate unified height after positioning
  visualRequirements.unifiedHeight = calculateUnifiedHeight(nodePositions);
  
  // Step 4: Handle special cases (branching, merging)
  handleSpecialLayouts(nodePositions, layoutHints);
  
  return {
    nodes: applyPositions(nodes, nodePositions),
    updatedMetadata: { ...metadata, visualRequirements }
  };
}
```

### **Phase 3: Documentation Phase Stickies**

```javascript
// In documentation.runner.ts
function createPhaseStickyNotes(phaseGroups, nodes, unifiedHeight, phaseDescriptions) {
  const stickyNotes = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Calculate unified top position for all sticky notes
  const stickyTopY = calculateStickyTopY(nodes, unifiedHeight);
  
  // Process each phase
  const phaseOrder = ["triggers", "inputs", "transforms", "decision", 
                     "aggregation", "storage", "integration", "outputs", "finalization"];
  
  for (const phase of phaseOrder) {
    const nodeIds = phaseGroups[phase];
    if (!nodeIds || nodeIds.length === 0) continue;
    
    const phaseConfig = PHASE_DEFINITIONS[phase];
    
    // Get actual nodes in this phase
    const phaseNodes = nodeIds
      .map(id => nodeMap.get(id))
      .filter(n => n !== undefined);
    
    if (phaseNodes.length === 0) continue;
    
    // Calculate phase boundaries based on actual node positions
    const xPositions = phaseNodes.map(n => n.position[0]);
    const nodeMinX = Math.min(...xPositions);
    const nodeMaxX = Math.max(...xPositions);
    
    // Position sticky to align with nodes in this phase
    const stickyX = nodeMinX - LAYOUT_CONFIG.spacing.stickyPadding;
    
    // Calculate sticky width to cover all nodes in this phase
    const stickyWidth = Math.max(
      310,  // Minimum width for readability
      (nodeMaxX - nodeMinX) + LAYOUT_CONFIG.dimensions.nodeWidth + 
      (LAYOUT_CONFIG.spacing.stickyPadding * 2)
    );
    
    // Use custom description if available, otherwise use default
    const description = phaseDescriptions?.get(phase) || phaseConfig.description;
    
    // Create sticky note aligned with this phase's nodes
    stickyNotes.push({
      id: `sticky_${phase}_${Date.now()}`,
      name: `${phaseConfig.name} Notes`,
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [stickyX, stickyTopY],  // Aligned with phase nodes
      parameters: {
        content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${description}`,
        height: unifiedHeight,
        width: stickyWidth,
        color: phaseConfig.color
      }
    });
  }
  
  // Add promotional sticky note to the LEFT of all workflow content
  // Calculate leftmost workflow position
  const allNodeXPositions = nodes.map(n => n.position[0]);
  const workflowMinX = Math.min(...allNodeXPositions);
  
  // Position promo sticky well to the left with extra spacing
  const promoX = workflowMinX - LAYOUT_CONFIG.spacing.promoStickyOffset - 
                 LAYOUT_CONFIG.dimensions.promoStickyWidth;
  
  const promoStickyNote = {
    id: `sticky_promo_${Date.now()}`,
    name: "Ghost Team Promo",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [Math.max(100, promoX), stickyTopY],  // Same Y as other stickies, but to the left
    parameters: {
      content: `## 🚀 Grow your AI business\n\nNeed help in implementing this workflow for your business? Join the Ghost Team community.\n\nThis workflow is made with 💚 by Ghost Team.`,
      height: unifiedHeight,
      width: LAYOUT_CONFIG.dimensions.promoStickyWidth,
      color: 4  // Green
    }
  };
  
  stickyNotes.push(promoStickyNote);
  return stickyNotes;
}
```

## **Validation & Quality Checks**

### **Layout Validation**

```javascript
function validateLayout(workflow) {
  const checks = {
    noOverlaps: checkNodeOverlaps(workflow.nodes),
    consistentHeight: checkStickyHeights(workflow.nodes),
    properSpacing: checkPhaseSpacing(workflow.nodes),
    gridAlignment: checkGridSnapping(workflow.nodes),
    connectionIntegrity: checkConnections(workflow.connections)
  };
  
  return {
    valid: Object.values(checks).every(check => check.passed),
    checks
  };
}
```

## **Result**

This implementation plan delivers:

- **Automatic phase detection** and categorization
- **Unified-dynamic height** for visual consistency
- **Adaptive layouts** for all workflow patterns
- **Professional spacing** with grid alignment
- **Cross-phase branching** support
- **Empty phase handling**
- **Validation & quality checks**

The system creates magazine-quality workflows automatically, suitable for:
- **Client presentations**
- **Team documentation**
- **Production deployment**
- **Template sharing**
