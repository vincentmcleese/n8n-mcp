# Issue Log

## Issue #1: Pre-configured Task Nodes Skip User-Specific Configuration

**Date Identified**: 2025-08-09  
**Status**: Open  
**Priority**: High  
**Component**: Configuration Phase Runner  

### Problem Description
Task nodes that come from the MCP task service are being marked as `isPreConfigured` and completely skip the configuration phase. This means they retain their generic template configuration but never receive user-specific parameters like:
- Custom prompts for AI nodes
- Specific code for Code nodes  
- User-defined queries for database nodes
- Actual API endpoints and data for HTTP nodes

### Root Cause
In `lib/orchestrator/runners/configuration.runner.ts` (lines 273-292), the configuration logic checks:
```typescript
if (node.isPreConfigured && node.config) {
  // Returns the template config without modification
}
```

This early return prevents the node from going through the configuration process that would add user-specific parameters based on the workflow context.

### Impact
- Generated workflows have nodes with generic/placeholder configurations
- Code nodes have example JavaScript instead of task-specific code
- AI nodes have generic prompts instead of user-intent prompts
- Database nodes lack proper queries
- HTTP nodes have placeholder URLs

### Example
User prompt: "Create a system that monitors trending topics, generates relevant content ideas using AI..."

Result: OpenAI nodes have basic chat configuration but lack the specific prompts about trending topics and content generation.

### Proposed Solution
Modify the configuration runner to:
1. Still process pre-configured nodes but use their config as a base
2. Enhance the base configuration with user-specific parameters
3. Keep the structure from the template but update values based on user intent

### Files Affected
- `lib/orchestrator/runners/configuration.runner.ts`
- `services/claude/config/prompt-builder.ts`
- `services/mcp/task-service.ts`

### Test Case
Test file: `tests/complete-test-outputs/user-test-2025-08-09T12-49-42-517Z.json`
Shows nodes with basic parameters but missing critical user-specific configurations.

---