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

## Issue #2: Validation Phase Token Exhaustion When Fixing Multiple Nodes

**Date Identified**: 2025-08-11
**Status**: Resolved
**Priority**: High
**Component**: Validation Phase Service

### Problem Description
During the validation phase, when multiple nodes require fixes (especially version updates), the `generateEntityFixes` method exhausts its 2000 token limit, resulting in truncated JSON responses and parse errors.

### Root Cause
The validation fix system returns complete node configurations rather than just the changes needed. When fixing 7+ nodes with version updates:
- Each node configuration requires 200-500 tokens
- Slack nodes with long message templates are particularly token-intensive
- The system sends ALL node properties even when only `typeVersion` needs updating
- Total response exceeds 2000 token limit, causing truncation mid-JSON

### Impact
- Validation fixes fail with JSON parse errors
- Workflows remain invalid despite having fixable issues
- Build process cannot complete successfully
- User experiences failed workflow generation

### Example Error
```
[Claude] [validation] generateEntityFixes: 5725 tokens (3725 in + 2000 out) of 2000 limit [100%]
[Claude] 🚨 TOKEN LIMIT EXCEEDED - Response truncated! Output tokens (2000) = max_tokens limit (2000)
[Claude] Failed to parse validation.generateEntityFixes response: Unterminated string in JSON at position 5595
```

### Analysis: Full-Node vs Delta Approach

#### Current Full-Node Approach (Maintained)
**Pros:**
- Maximum context for Claude's reasoning
- Can fix complex interdependent issues
- Handles structural changes (typeVersion updates)
- Single atomic replacement per node
- Proven reliability

**Cons:**
- Higher token usage
- Returns unchanged properties

#### Alternative Delta/Patch Approach (Considered but Rejected)
**Pros:**
- Token efficient (50-100 tokens per fix)
- Precise change tracking

**Cons:**
- Reduced context for Claude
- Complex merge logic required
- Risk of incomplete fixes
- May miss property relationships

### Decision
Maintain the full-node approach for its superior fix quality and reliability. The rich context enables Claude to:
- Understand property relationships
- Fix complex expression syntax issues
- Handle n8n-specific patterns correctly
- Reduce need for multiple validation rounds

### Solution Implemented
Increased `validationFixes` token limit from 2000 to 8000 tokens to match other phases and accommodate complete node configurations.

### Files Affected
- `services/claude/constants.ts` (line 91)

### Test Case
Workflows with multiple Slack nodes requiring version updates and expression fixes, as seen in test outputs from 2025-08-11.

---

## Issue #3: Task Nodes Missing TypeVersion from Node Essentials

**Date Identified**: 2025-08-11  
**Status**: Open  
**Priority**: High  
**Component**: Task Service / Configuration Runner  

### Problem Description
When using task templates to get pre-configured nodes, we're missing the critical `typeVersion` field that n8n requires for proper node configuration. Task templates provide optimized parameter configurations but don't include version information.

### Root Cause
The current implementation only uses task templates from the MCP service, which provide:
- Pre-configured parameters
- Common usage patterns
- Optimized settings

But they lack:
- `typeVersion` field (required by n8n)
- Version-specific configuration details
- Node metadata

### Why This Works
The solution combines two data sources:
1. **Task templates** provide optimized parameter configurations
2. **Node essentials** provide the current version number and metadata
3. Combining both gives complete, version-aware node configurations

### Impact
- Nodes from task templates may have incorrect or missing `typeVersion`
- Validation phase has to fix version issues that could be prevented
- Potential runtime issues if version mismatches aren't caught

### Proposed Solution
For task-based nodes, we must:
1. First get the task template for optimized configuration
2. Then call `get_node_essentials` to get the current `typeVersion`
3. Merge the version information with the task configuration
4. Result: Complete, version-aware, optimized node configuration

### Implementation Strategy
```typescript
// 1. Get task template
const taskTemplate = await mcpClient.getNodeForTask(taskName);

// 2. Get node essentials for version info
const nodeEssentials = await mcpClient.getNodeEssentials(nodeType);

// 3. Merge configuration
const completeNode = {
  ...taskTemplate.config,
  typeVersion: nodeEssentials.typeVersion
};
```

### Recommended Implementation Pattern
```typescript
async function getCustomizedNode(taskName, customizations = {}) {
  // Start with task template for good defaults
  const taskNode = await get_node_for_task(taskName);
  
  // Get full capabilities 
  const nodeEssentials = await get_node_essentials(taskNode.nodeType);
  
  // Merge: task defaults + custom overrides + essential metadata
  return {
    ...taskNode,
    version: nodeEssentials.version,
    requiredProperties: nodeEssentials.requiredProperties,
    allProperties: nodeEssentials.commonProperties,
    
    configuration: {
      ...taskNode.configuration,  // Good defaults
      ...customizations,          // Your customizations
      typeVersion: nodeEssentials.version
    }
  };
}

// Usage: Get good defaults + add custom stuff
const customNode = await getCustomizedNode("send_slack_message", {
  maxTries: 10,           // Override default
  customTimeout: 30000,   // Add new property
  attachments: [...]      // Add advanced features
});
```

### Recommendation
Start with task templates for the foundation, then enhance with node essentials for customization. This approach provides:
- **Task templates**: Battle-tested configurations and sensible defaults
- **Node essentials**: Version information and complete property lists
- **Customizations**: User-specific parameters and overrides
- **Result**: Complete, version-aware, optimized node configurations

### Files Affected
- `services/mcp/task-service.ts` - Update to fetch node essentials
- `lib/orchestrator/runners/discovery.runner.ts` - Ensure version info is included
- `lib/orchestrator/runners/configuration.runner.ts` - Handle version merging

### Test Case
Any workflow using task templates should have proper `typeVersion` fields without requiring validation fixes.

---

## Future Improvement Ideas

### Idea #1: Dynamic Node Search and Replacement During Configuration Failures

**Date Added**: 2025-08-12  
**Priority**: Medium  
**Component**: Configuration Phase Service  

#### Problem Description
When the configuration phase fails to generate a valid configuration for a node (e.g., langchain.memory nodes that require specific AI agent connections), the system currently just reports the failure. The configuration agent lacks the ability to search for and suggest alternative nodes that could fulfill the same requirement.

#### Example Case
- User wants to store price data for percentage change calculations
- System attempts to use `nodes-langchain.memoryBufferWindow` 
- Configuration fails because this node is designed for AI chat memory, not general data storage
- System should be able to search for and suggest alternatives like Set, Code, or database nodes

#### Proposed Solution
Enhance the configuration agent with the ability to:
1. Detect when a node configuration fails due to fundamental incompatibility
2. Search for alternative nodes using the MCP service
3. Replace the incompatible node with a suitable alternative
4. Re-attempt configuration with the new node

#### Implementation Strategy
```typescript
// In configuration runner, when configuration fails:
if (configurationFailed && isIncompatibleNode(error)) {
  // 1. Analyze the intended use case
  const intent = analyzeNodeIntent(node, context);
  
  // 2. Search for alternative nodes
  const alternatives = await searchAlternativeNodes(intent);
  
  // 3. Select best alternative
  const replacement = selectBestAlternative(alternatives, intent);
  
  // 4. Replace node and retry
  await replaceNodeAndReconfigure(node, replacement);
}
```

#### Benefits
- More resilient workflow generation
- Better handling of user intent when initial node selection is incorrect
- Reduced failure rate in configuration phase
- Improved user experience with automatic problem resolution

#### Files That Would Be Affected
- `lib/orchestrator/runners/configuration.runner.ts` - Add fallback logic
- `services/claude/phases/configuration.ts` - Add node replacement capability
- `services/mcp/task-service.ts` - Add alternative node search methods

---