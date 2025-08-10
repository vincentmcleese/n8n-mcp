# Tool Calling Implementation for Claude Agent

## Overview

This document describes the implementation of autonomous tool calling capabilities for the Claude agent in the n8n workflow builder. The implementation enables Claude to directly call MCP (Model Context Protocol) tools when additional information is needed, while maintaining the existing optimized system with pre-fetched data.

## Architecture

### Core Components

#### 1. Tool Type Definitions (`types/tools/index.ts`)
- **ToolDefinition**: Anthropic tool definition format with name, description, and input schema
- **ToolCall**: Represents a tool call request from Claude
- **ToolResult**: Format for returning tool execution results to Claude
- **ToolExecutionResult**: Internal execution result tracking

#### 2. MCP Tool Definitions (`lib/mcp-tools/definitions.ts`)
Maps MCP client methods to Anthropic tool format, organized by workflow phase:

**Configuration Tools:**
- `search_node_properties`: Search for specific node properties (auth, retry, headers, etc.)
- `get_node_documentation`: Get detailed documentation for complex configurations
- `validate_node_minimal`: Quick validation of node configuration

**Validation Tools:**
- `validate_workflow`: Full workflow validation
- `check_connections`: Verify node connections
- `get_input_schema`: Get expected input schema
- `get_output_schema`: Get expected output schema

**Discovery Tools:**
- `search_nodes`: Find nodes by capability
- `get_node_info`: Get detailed node information
- `list_node_types`: List all available node types

#### 3. Tool Executor (`services/claude/tool-executor.ts`)
Bridge between Claude's tool calls and MCP client:
- Maps tool names to MCP client method calls
- Handles errors gracefully with fallback responses
- Formats results for Claude's consumption
- Comprehensive logging of all tool interactions

#### 4. Enhanced Claude Client (`services/claude/client.ts`)
Extended with tool calling capabilities:
- New `completeJSONWithTools` method for tool-enabled requests
- Tool-use loop handling for multiple sequential tool calls
- Backward compatible - only uses tools when provided
- Recursive handling for multiple tool rounds

#### 5. Updated Phase Services
Each phase service now passes relevant tools to Claude:
- **Base Phase Service**: Added optional tools parameter to `callClaude` method
- **Configuration Phase**: Provides configuration-specific tools
- **Validation Phase**: Provides validation-specific tools
- **Discovery Phase**: Provides discovery-specific tools
- Building and Documentation phases don't need tools (unchanged)

## How It Works

### Tool Calling Flow

```
1. Phase Service prepares prompt and tools
   ↓
2. Claude Client receives tools + prompt
   ↓
3. Anthropic API called with tool definitions
   ↓
4. Claude decides if tools are needed
   ↓
5. If yes: Tool call request returned
   ↓
6. Tool Executor maps call to MCP client
   ↓
7. MCP Client executes actual tool
   ↓
8. Results formatted and returned to Claude
   ↓
9. Claude incorporates results into response
   ↓
10. Final configuration/validation returned
```

### Example: Configuration Phase

**Without Tools (Existing Flow):**
1. Runner pre-fetches node essentials
2. Builds prompt with essentials included
3. Claude generates configuration from essentials
4. Configuration returned

**With Tools (Enhanced Flow):**
1. Runner pre-fetches node essentials (same)
2. Builds prompt with essentials (same)
3. **NEW**: Tools are passed to Claude
4. Claude uses essentials for basic config
5. **NEW**: If user needs "authentication", Claude calls `search_node_properties`
6. **NEW**: Tool executor fetches auth properties from MCP
7. **NEW**: Claude incorporates auth properties into config
8. Enhanced configuration returned

## Key Design Decisions

### 1. Additive, Not Replacement
- Kept all existing optimizations (pre-fetched essentials)
- Tools are optional enrichment, not required
- System works identically if tools aren't available

### 2. Intelligent Tool Use
- Claude decides when tools are needed
- Tools only called for information not in essentials
- Reduces unnecessary API calls and token usage

### 3. Phase-Specific Tools
- Each phase only gets relevant tools
- Prevents misuse of tools in wrong context
- Clear boundaries for tool availability

### 4. Comprehensive Logging
- Dedicated `tools` logger for all tool interactions
- Logs show: request → execution → result
- Easy debugging and monitoring

## Implementation Details

### Modified Files

**New Files Created:**
- `types/tools/index.ts` - Tool type definitions
- `lib/mcp-tools/definitions.ts` - MCP tool mappings
- `services/claude/tool-executor.ts` - Tool execution logic

**Files Modified:**
- `services/claude/client.ts` - Added tool calling support
- `services/claude/phases/base.ts` - Added tools parameter
- `services/claude/phases/configuration.ts` - Pass configuration tools
- `services/claude/phases/validation.ts` - Pass validation tools
- `services/claude/phases/discovery.ts` - Pass discovery tools
- `lib/utils/logger.ts` - Added tools logger

### Tool Definition Format

```typescript
{
  name: 'search_node_properties',
  description: 'Search for specific properties in a node type',
  input_schema: {
    type: 'object',
    properties: {
      nodeType: { type: 'string' },
      query: { type: 'string' },
      maxResults: { type: 'number', default: 20 }
    },
    required: ['nodeType', 'query']
  }
}
```

### Tool Execution Example

```typescript
// Claude requests a tool
{
  id: 'tool_abc123',
  type: 'tool_use',
  name: 'search_node_properties',
  input: {
    nodeType: 'HttpRequest',
    query: 'authentication'
  }
}

// Tool executor maps to MCP client
await mcpClient.searchNodeProperties('HttpRequest', 'authentication', 20)

// Result returned to Claude
{
  type: 'tool_result',
  tool_use_id: 'tool_abc123',
  content: '{"properties": [...]}'
}
```

## Logging

When tools are used, the logs show:

```
[Claude] 🔧 Claude requesting 1 tool(s): search_node_properties
[Tools] 🔧 Tool called: search_node_properties {nodeType: "HttpRequest", query: "auth"}
[MCP] Tool search_node_properties completed in 145ms
[Tools] ✅ Tool search_node_properties completed in 150ms
```

## Benefits

### For Users
- More accurate configurations based on specific requirements
- Claude can find obscure properties when needed
- Better handling of complex node configurations

### For Developers
- Clear separation of concerns
- Easy to add new tools
- Comprehensive debugging through logs
- Backward compatible with existing tests

### For Performance
- Tools only called when needed
- Essentials still provide 80% of requirements
- Parallel tool execution supported
- Graceful degradation if tools fail

## Testing

To test tool calling:

1. Ensure MCP server is running
2. Set environment variables:
   - `ANTHROPIC_API_KEY`
   - `MCP_SERVER_URL`
   - `SMITHERY_API_KEY`
3. Run configuration test: `npm run test:configure`
4. Check logs for 🔧 symbols indicating tool usage

## Future Enhancements

Potential improvements:
1. Tool result caching to avoid repeated calls
2. Tool usage analytics and metrics
3. Custom tools for complex operations
4. Tool preference learning based on usage patterns
5. Parallel tool execution optimization

## Rollback

If issues arise, the implementation can be disabled by:
1. Not passing tools to phase services (remove tool parameters)
2. Or reverting to commit before tool implementation

The system will continue working with pre-fetched data only.

## Summary

This implementation successfully adds autonomous tool calling to the Claude agent while maintaining full backward compatibility. The agent can now intelligently fetch additional information when needed, improving configuration accuracy and handling edge cases better, all while preserving the existing optimized workflow.