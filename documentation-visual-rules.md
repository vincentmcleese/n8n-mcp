# Visual Workflow Layout System - Implementation Plan

## **Objective**

Create magazine-quality n8n workflows with professional spacing and organized sticky note backgrounds that group nodes by workflow phases.

## **Core Concept**

- **Sticky notes as backgrounds** behind groups of related nodes
- **Unified-dynamic height** system for visual consistency
- **Phase-based organization** with intelligent categorization
- **Adaptive layout** supporting all workflow patterns

## **Phase Organization System**

### **4 Standard Phases with Enhanced Categorization**

```javascript
const PHASE_DEFINITIONS = {
  triggers: {
    icon: "📥",
    name: "Triggers",
    description: "Workflow entry points",
    categories: ["trigger"],
    color: 6  // Yellow
  },
  inputs: {
    icon: "📊", 
    name: "Inputs",
    description: "Data collection",
    categories: ["input"],
    color: 5  // Blue
  },
  transforms: {
    icon: "⚙️",
    name: "Transform",
    description: "Processing & routing",
    categories: ["transform"],
    specialTypes: ["code", "if", "switch", "merge", "loop", "filter", "set"],
    color: 4  // Green
  },
  outputs: {
    icon: "🚀",
    name: "Outputs", 
    description: "Actions & destinations",
    categories: ["output"],
    color: 7  // Orange
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
    horizontal: 220,      // Between nodes horizontally
    vertical: 180,        // Between rows vertically
    stickyPadding: 40,    // Space around sticky edges
    phaseGap: 100,        // Gap between phase sections
    gridSnap: 20          // Grid alignment
  },
  
  dimensions: {
    minStickyHeight: 200, // Minimum sticky note height
    nodeWidth: 150,       // Standard node width
    nodeHeight: 100       // Standard node height
  },
  
  colors: {
    triggers: 6,          // Yellow
    inputs: 5,            // Blue
    transforms: 4,        // Green
    outputs: 7            // Orange
  }
};
```

### **Unified-Dynamic Height Strategy**

```javascript
function calculateUnifiedHeight(phaseGroups) {
  const phaseHeights = [];
  
  for (const [phase, nodeIds] of Object.entries(phaseGroups)) {
    if (nodeIds.length === 0) continue;
    
    // Calculate vertical span for this phase
    const nodePositions = nodeIds.map(id => getNodePosition(id));
    const yPositions = nodePositions.map(pos => pos[1]);
    
    if (yPositions.length > 0) {
      const minY = Math.min(...yPositions);
      const maxY = Math.max(...yPositions);
      const span = maxY - minY + LAYOUT_CONFIG.dimensions.nodeHeight;
      phaseHeights.push(span + (LAYOUT_CONFIG.spacing.stickyPadding * 2));
    }
  }
  
  // Use maximum height across all phases
  return Math.max(...phaseHeights, LAYOUT_CONFIG.dimensions.minStickyHeight);
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
function createPhaseStickyNotes(metadata) {
  const { phaseGroups, visualRequirements } = metadata;
  const stickyNotes = [];
  
  let currentX = 100;  // Starting X position
  
  for (const [phase, nodeIds] of Object.entries(phaseGroups)) {
    if (nodeIds.length === 0) continue;
    
    const phaseConfig = PHASE_DEFINITIONS[phase];
    const nodes = nodeIds.map(id => getNodeById(id));
    
    // Calculate phase boundaries
    const xPositions = nodes.map(n => n.position[0]);
    const minX = Math.min(...xPositions) - LAYOUT_CONFIG.spacing.stickyPadding;
    const maxX = Math.max(...xPositions) + LAYOUT_CONFIG.dimensions.nodeWidth + LAYOUT_CONFIG.spacing.stickyPadding;
    
    // Create sticky note for this phase
    stickyNotes.push({
      id: `sticky_${phase}_${Date.now()}`,
      type: "n8n-nodes-base.stickyNote",
      position: [minX, 60],  // Above nodes
      parameters: {
        content: `## ${phaseConfig.icon} ${phaseConfig.name}\n${phaseConfig.description}`,
        height: visualRequirements.unifiedHeight,
        width: maxX - minX,
        color: phaseConfig.color
      },
      _nodeGroupIds: nodeIds  // For reference
    });
    
    currentX = maxX + LAYOUT_CONFIG.spacing.phaseGap;
  }
  
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
