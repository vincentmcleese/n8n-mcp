# n8n Workflow Builder AI Architecture Overview

## Core Architecture Components

### 1. **Workflow Orchestrator** (`/lib/workflow-orchestrator.ts`)
The central coordinator managing the entire workflow creation lifecycle through distinct phases.

**Key Responsibilities:**
- Orchestrates the 4-phase workflow creation process
- Manages state transitions between phases
- Coordinates between Claude AI and MCP services
- Handles error recovery and validation loops

### 2. **Claude Service** (`/lib/services/claude-service.ts`)
The AI intelligence layer powered by Anthropic's Claude Sonnet 4.

**Key Responsibilities:**
- Analyzes user intent and suggests search terms
- Makes intelligent node selection decisions
- Generates node configurations based on schemas
- Creates workflow connections and structure
- Fixes validation errors through iterative refinement

### 3. **MCP Client** (`/lib/mcp-client.ts`)
Direct interface to n8n's Model Context Protocol server.

**Key Responsibilities:**
- Searches n8n's node database (525+ nodes)
- Retrieves node schemas and documentation
- Validates configurations against n8n rules
- Provides pre-configured templates
- No AI involvement - pure data operations

### 4. **Session Manager** (`/lib/session-utils.ts`)
Handles persistent state management using Supabase.

**Key Responsibilities:**
- Creates and manages workflow sessions
- Applies incremental state updates (delta architecture)
- Maintains operation history
- Handles session lifecycle and timeouts

## API Endpoints & Flow

### Phase 1: Session Creation
```
POST /api/workflow/create
├── Input: { prompt: "user's workflow description" }
├── Creates session in Supabase
└── Returns: { sessionId, createdAt, expiresAt }
```

### Phase 2: Discovery
```
POST /api/workflow/[sessionId]/discover
├── Claude analyzes prompt → suggests search terms
├── MCP searches nodes → returns matches
├── Claude selects relevant nodes → updates state
└── State Update: discovered[], selected[]
```

### Phase 3: Configuration
```
POST /api/workflow/[sessionId]/configure
├── For each selected node:
│   ├── MCP gets node essentials/schema
│   ├── Claude analyzes requirements
│   ├── MCP fetches additional properties/templates
│   └── Claude generates configuration
├── Validates configurations via MCP
└── State Update: configured[]
```

### Phase 4: Building
```
POST /api/workflow/[sessionId]/build
├── Claude assembles workflow structure
├── Connects nodes based on data flow
├── Positions nodes for visual clarity
└── State Update: draftWorkflow
```

### Phase 5: Validation
```
POST /api/workflow/[sessionId]/validate
├── MCP validates complete workflow
├── Claude generates fixes for errors
├── Applies fixes (max 3 iterations)
└── State Update: finalWorkflow
```

### Phase 6: Export
```
POST /api/workflow/[sessionId]/export
└── Returns n8n-compatible JSON workflow
```

## Claude vs MCP Interaction Pattern

### Direct MCP Calls (No AI)
```javascript
// These bypass Claude entirely:
mcpClient.searchNodes({ query: "slack" })
mcpClient.getNodeInfo("nodes-base.slack")
mcpClient.validateNodeMinimal(nodeType, config)
mcpClient.getNodeEssentials(nodeType)
```

### Claude AI Calls (Intelligence Layer)
```javascript
// These require AI decision-making:
claudeService.analyzeWorkflowIntent(prompt)
claudeService.processWorkflowPhase('discovery', ...)
claudeService.generateConfiguration(...)
claudeService.generateValidationFixes(errors, workflow)
```

### Interaction Flow
```
User Prompt
    ↓
Claude: "I need Slack and webhook nodes"
    ↓
Orchestrator → MCP: searchNodes("slack")
    ↓
MCP → Orchestrator: [Slack node data]
    ↓
Orchestrator → Claude: "Found these Slack nodes"
    ↓
Claude: "Select the 'Send Message' node"
```

## State Management

### Incremental Updates
- State stored in Supabase, not passed between calls
- Each phase reads only what it needs
- Updates only relevant portions
- Operations tracked for audit trail

### State Structure
```typescript
{
  phase: 'discovery|configuration|building|validation',
  userPrompt: string,
  discovered: DiscoveredNode[],     // Found nodes
  selected: string[],               // Selected node IDs
  configured: ConfiguredNode[],     // Node configs
  validated: {},                    // Validation results
  draftWorkflow: {},               // Built workflow
  operationHistory: [],            // All operations
  pendingClarifications: []        // User questions
}
```

### Targeted AI Context
- **Discovery**: Claude gets prompt + MCP search results
- **Configuration**: Claude gets selected nodes + schemas
- **Building**: Claude gets configured nodes only
- **Validation**: Claude gets errors + workflow structure

## Available MCP Tools by Phase

### Discovery Phase Tools

#### `search_nodes`
- **Purpose**: Find nodes by keyword/functionality
- **Usage**: `searchNodes({ query: "slack", limit: 3 })`
- **Returns**: List of matching nodes with descriptions

#### `list_nodes`
- **Purpose**: Browse nodes by category
- **Usage**: `listNodes({ category: "trigger", limit: 50 })`
- **Returns**: Categorized node listings

#### `list_ai_tools`
- **Purpose**: Get AI-capable nodes
- **Usage**: `listAITools()`
- **Returns**: 263 nodes that can be AI tools

#### `get_node_info`
- **Purpose**: Get full node details
- **Usage**: `getNodeInfo("nodes-base.slack")`
- **Returns**: Complete node schema (can be 100KB+)

### Configuration Phase Tools

#### `get_node_essentials`
- **Purpose**: Get key properties only (5KB vs 100KB)
- **Usage**: `getNodeEssentials("nodes-base.slack")`
- **Returns**: Essential configuration properties

#### `search_node_properties`
- **Purpose**: Find specific properties in complex nodes
- **Usage**: `searchNodeProperties("nodes-base.slack", "channel")`
- **Returns**: Property paths and descriptions

#### `get_node_for_task`
- **Purpose**: Get pre-configured templates
- **Usage**: `getNodeForTask("send_slack_message")`
- **Returns**: Complete working configuration

#### `get_node_documentation`
- **Purpose**: Get usage examples and patterns
- **Usage**: `getNodeDocumentation("nodes-base.slack")`
- **Returns**: Human-readable documentation

#### `validate_node_minimal`
- **Purpose**: Quick validation of required fields
- **Usage**: `validateNodeMinimal(nodeType, config)`
- **Returns**: List of missing required fields

### Building Phase Tools

*No specific MCP tools used - Claude assembles the workflow structure using validated configurations*

### Validation Phase Tools

#### `validate_workflow`
- **Purpose**: Comprehensive workflow validation
- **Usage**: `callTool("validate_workflow", { workflow, options })`
- **Returns**: All errors and warnings with details

#### `validate_workflow_connections`
- **Purpose**: Check node connections
- **Usage**: `callTool("validate_workflow_connections", { workflow })`
- **Returns**: Connection errors (cycles, missing nodes)

#### `validate_workflow_expressions`
- **Purpose**: Validate n8n expressions
- **Usage**: `callTool("validate_workflow_expressions", { workflow })`
- **Returns**: Expression syntax errors

### Helper Tools (All Phases)

#### `get_property_dependencies`
- **Purpose**: Show field visibility rules
- **Usage**: `callTool("get_property_dependencies", { nodeType })`
- **Returns**: Which fields appear based on other field values

#### `list_tasks`
- **Purpose**: See available task templates
- **Usage**: `callTool("list_tasks", {})`
- **Returns**: Categorized task templates

## Key Architecture Decisions

### 1. **Separation of Concerns**
- MCP: Data retrieval, validation, facts
- Claude: Intelligence, decisions, generation
- Orchestrator: Coordination, state management

### 2. **Targeted AI Usage**
- Claude never sees entire state
- Gets only phase-specific context
- Reduces tokens and improves focus

### 3. **Direct MCP Access**
- No AI overhead for data operations
- Faster response times
- Lower costs

### 4. **Incremental State**
- Delta-based updates
- Audit trail via operations
- Efficient database usage

### 5. **Phase Isolation**
- Each phase has clear boundaries
- Specific tools per phase
- Progressive enhancement

This architecture ensures efficient, intelligent workflow creation while minimizing AI token usage and maximizing performance through direct data operations where AI isn't needed.