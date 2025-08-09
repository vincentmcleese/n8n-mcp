# Node Category Flow Implementation Plan

## Problem Statement
The documentation phase is creating sticky notes with only "Transform" category because node categories from MCP are not being preserved through the discovery → configuration → building → documentation pipeline.

## Solution Overview
MCP already provides deterministic `category` values for nodes. We need to:
1. Extract category from MCP responses (both task and search paths)
2. Preserve it through all phases
3. Use it in documentation phase instead of fallback logic

## Category Values from MCP
The MCP server returns these exact category values:
- `"trigger"` - Workflow entry points (webhooks, schedules, etc.)
- `"input"` - Data retrieval (HTTP GET, database reads, etc.)
- `"transform"` - Data processing (code, merge, filter, etc.)
- `"output"` - Data destinations (email, Slack, database writes, etc.)

## Type Updates Required

### 1. **types/workflow.ts**
```typescript
// Line 194 - DiscoveredNode
export interface DiscoveredNode {
  // ... existing fields ...
  category?: string;  // Already exists, keep as optional
}

// Line 27 - WorkflowNode (for final workflow)
export interface WorkflowNode {
  // ... existing fields ...
  category?: string;  // ADD THIS - optional for backward compatibility
}
```

### 2. **types/claude/operations.ts**
```typescript
// Line 12 - DiscoverNodeOperation
export interface DiscoverNodeOperation {
  type: "discoverNode";
  node: {
    id: string;
    type: string;
    purpose: string;
    displayName?: string;  // ADD THIS
    category?: string;      // ADD THIS
    isPreConfigured?: boolean;  // ADD THIS
    config?: any;           // ADD THIS
  };
}
```

### 3. **services/mcp/task-service.ts**
```typescript
// Line 16 - TaskNodeConfig
export interface TaskNodeConfig {
  // ... existing fields ...
  category?: string;  // ADD THIS
}

// Line 242 - fetchSingleTask return type
private async fetchSingleTask(taskName: string): Promise<{
  nodeType: string;
  config: any;
  purpose?: string;
  category?: string;  // ADD THIS
} | null>
```

### 4. **types/orchestrator/configuration.ts**
```typescript
// Line 20 - ConfiguredNode
export interface ConfiguredNode {
  // ... existing fields ...
  category?: string;  // ADD THIS
}
```

## Implementation Steps

### Step 1: Update Task Service
**File**: `services/mcp/task-service.ts`
- Update `fetchSingleTask` to extract category from MCP response
- Update `TaskNodeConfig` interface

### Step 2: Update Discovery Runner
**File**: `lib/orchestrator/runners/discovery.runner.ts`
- Preserve category when creating task nodes (line 193)
- Preserve category when processing gap selections (line 451)
- Ensure category flows into operations

### Step 3: Update Configuration Phase
**File**: `lib/orchestrator/runners/configuration.runner.ts`
- Preserve category from discovered nodes
- Pass through to configured nodes

### Step 4: Update Building Phase
**File**: `lib/orchestrator/runners/building.runner.ts`
- Preserve category when creating workflow nodes
- Ensure it's in the final workflow structure

### Step 5: Fix Documentation Phase
**File**: `lib/orchestrator/helpers/phase-categorization.ts`
- Update `categorizeNode` to check for existing category first
- Only use type-based detection as fallback

## Testing Plan

### Test 1: Task Node Categories
- Test task like "send_email" → should have category "output"
- Test task like "receive_webhook" → should have category "trigger"

### Test 2: Search Node Categories
- Search for "slack" → should have category "output"
- Search for "schedule" → should have category "trigger"

### Test 3: Documentation Phase
- Run complete workflow with mixed node types
- Verify sticky notes show correct phases:
  - Triggers sticky note for trigger nodes
  - Inputs sticky note for input nodes
  - Transform sticky note for transform nodes
  - Outputs sticky note for output nodes

## Success Criteria
1. ✅ Categories from MCP are preserved through all phases
2. ✅ Documentation phase creates correctly labeled sticky notes
3. ✅ No more "everything is transform" issue
4. ✅ Backward compatibility maintained (category is optional)

## Risk Assessment
- **Low Risk**: All changes are additive (optional fields)
- **Backward Compatible**: Existing workflows without categories still work
- **Fallback Logic**: Type-based detection remains as backup

## Implementation Order
1. Type updates (no functional changes)
2. MCP data extraction (task-service.ts)
3. Discovery preservation
4. Flow through configuration/building
5. Documentation phase fix
6. Testing