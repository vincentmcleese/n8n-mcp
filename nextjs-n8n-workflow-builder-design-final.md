# Next.js n8n Workflow Builder with Claude Orchestration (Delta Architecture)

## Table of Contents

1. [Overview](#1-overview)

   - [Core Design Principles](#core-design-principles)
   - [Key Features](#key-features)
   - [Success Metrics](#success-metrics)

2. [Getting Started](#2-getting-started)

   - [Environment Setup](#environment-setup)
   - [Dependencies](#dependencies)
   - [Database Setup](#database-setup)
   - [Project Structure](#project-structure)

3. [Architecture](#3-architecture)

   - [System Overview](#system-overview)
   - [State Management](#state-management)
   - [Delta Operations](#delta-operations)
   - [Session Management](#session-management)

4. [Phase System](#4-phase-system)

   - [Phase Reference Table](#phase-reference-table)
   - [Phase Transition Logic](#phase-transition-logic)
   - [Auto-Transition Rules](#auto-transition-rules)

5. [API Routes](#5-api-routes)

   - [Session Management](#session-management-routes)
   - [Workflow Operations](#workflow-operations-routes)
   - [Claude Integration](#claude-integration-route)
   - [Maintenance](#maintenance-routes)

6. [MCP Server Integration](#6-mcp-server-integration)

   - [Connection Details](#connection-details)
   - [Available Tools](#available-tools)
   - [Error Handling](#error-handling)

7. [AI Orchestration Best Practices](#7-ai-orchestration-best-practices)

   - [Trust Claude's Intelligence](#trust-claudes-intelligence)
   - [MCP Tool Usage Philosophy](#mcp-tool-usage-philosophy)
   - [Performance Benefits](#performance-benefits)

8. [Error Handling](#8-error-handling)

   - [Error Classification](#error-classification)
   - [Recovery Strategies](#recovery-strategies)
   - [UI Components](#ui-components)

8. [UI Components](#8-ui-components)

   - [Component List](#component-list)
   - [Phase Indicator](#phase-indicator)
   - [Clarification Dialog](#clarification-dialog)

9. [Implementation Guide](#9-implementation-guide)

   - [Phase 1: Infrastructure](#phase-1-infrastructure)
   - [Phase 2: Core Features](#phase-2-core-features)
   - [Phase 3: UI & Polish](#phase-3-ui--polish)

10. [Type Definitions](#10-type-definitions)

    - [Complete Type Reference](#complete-type-reference)

11. [Appendices](#11-appendices)
    - [A. Operation Types Quick Reference](#a-operation-types-quick-reference)
    - [B. Token Optimization](#b-token-optimization)
    - [C. Performance Benchmarks](#c-performance-benchmarks)
    - [D. Unit Testing Strategy](#d-unit-testing-strategy)
    - [E. Future Enhancements](#e-future-enhancements)

---

## 1. Overview

### Core Design Principles

1. **Stateless Claude Interactions** - Each API call to Claude is independent with minimal context
2. **Incremental Delta Operations** - Send only changes (diffs), not full state objects (80-90% token reduction)
3. **Server-Side Canonical Document** - Server maintains the source of truth, client sends operations
4. **Structured Orchestration** - Follow systematic phase-based workflow building
5. **Token Optimization** - Use essential tools, focused prompts, and delta operations throughout
6. **Trust AI Agent Judgment** - Let Claude make intelligent decisions about tool usage and node selection without overengineering

### Key Features

- **Delta-Based Architecture** - 80-90% token reduction through incremental operations
- **Real-Time Updates** - Operations applied and reflected immediately
- **Operation History** - Complete audit trail with undo/redo capability
- **Atomic Transactions** - All operations in a batch succeed or fail together
- **Session Persistence** - Resume workflow building after interruptions
- **Smart Caching** - Reuse common operation patterns

### Success Metrics

| Metric           | Target              | Description                  |
| ---------------- | ------------------- | ---------------------------- |
| Token Usage      | ~3.8KB per workflow | vs 38KB traditional approach |
| Response Time    | 200-500ms           | Per operation                |
| Session Capacity | 1000+ concurrent    | Active users                 |
| Error Recovery   | 3x retry            | With exponential backoff     |
| Cleanup          | Hourly/Daily        | Expired/old sessions         |

---

## 2. Getting Started

### Environment Setup

| Variable                        | Value/Description                                        | Required |
| ------------------------------- | -------------------------------------------------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL                                | ✅       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key                                   | ✅       |
| `ANTHROPIC_API_KEY`             | Your Anthropic API key                                   | ✅       |
| `MCP_SERVER_URL`                | `https://server.smithery.ai/@vincentmcleese/n8n-mcp/mcp` | ✅       |
| `MCP_API_KEY`                   | `28d8026f-fad7-4bc6-87c5-9fcacba57fde`                   | ✅       |
| `MCP_PROFILE`                   | `intermediate-cuckoo-DIapDk`                             | ✅       |
| `CRON_SECRET`                   | Random string for cron job auth                          | ❌       |

### Dependencies

```bash
npm install @anthropic-ai/sdk@^0.24.0 \
  @modelcontextprotocol/sdk@^1.15.1 \
  @supabase/supabase-js@^2.39.0 \
  lucide-react@^0.294.0 \
  nanoid@^5.0.4 \
  react-syntax-highlighter@^15.5.0 \
  @types/react-syntax-highlighter@^15.5.11
```

### Database Setup

```sql
-- Supabase SQL
CREATE TABLE workflow_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    state JSONB NOT NULL DEFAULT '{}',
    operations JSONB DEFAULT '[]',
    user_prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1 NOT NULL -- For optimistic locking
);

CREATE INDEX idx_session_id ON workflow_sessions(session_id);

CREATE OR REPLACE FUNCTION cleanup_sessions()
RETURNS void AS $$
BEGIN
  UPDATE workflow_sessions
  SET is_active = false
  WHERE is_active = true
  AND updated_at < NOW() - INTERVAL '1 hour';

  DELETE FROM workflow_sessions
  WHERE created_at < NOW() - INTERVAL '24 hours'
  AND is_active = false;
END;
$$ LANGUAGE plpgsql;
```

### Project Structure

```
app/
├── page.tsx
├── workflow/
│   ├── [sessionId]/
│   │   ├── page.tsx
│   │   └── result/page.tsx
│   └── components/
├── api/
│   ├── workflow/
│   │   ├── [sessionId]/
│   │   │   ├── apply/route.ts
│   │   │   ├── state/route.ts
│   │   │   ├── export/route.ts
│   │   │   └── phase-status/route.ts
│   │   └── create/route.ts
│   ├── claude/route.ts
│   └── cron/cleanup/route.ts
├── lib/
│   ├── mcp-client.ts
│   ├── mcp-error-handler.ts
│   ├── session-utils.ts
│   ├── session-cleanup.ts
│   ├── phase-manager.ts
│   ├── error-handler.ts
│   ├── delta-builder.ts
│   ├── api-utils.ts              # Logging utilities for API routes
│   ├── server-logger.ts          # Server-side logging infrastructure
│   └── supabase.ts
└── middleware.ts                 # API request interception & logging

hooks/
├── use-phase-monitor.ts
└── use-session-heartbeat.ts

types/
└── workflow.ts

scripts/                         # Integration test scripts
├── run-integration-tests.ts
├── test-discovery-phase-integration.ts
├── test-clarification.ts
└── test-clarification-complete.ts

__tests__/                       # Unit tests (Jest)
├── unit/
│   ├── api/
│   ├── lib/
│   └── services/
└── test-utils.ts
```

---

## 3. Architecture

### System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Database   │
│  (Next.js)  │     │   (API)     │     │ (Supabase)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                    │
       │                    ├─────────────────────┐
       │                    ▼                     ▼
       │            ┌─────────────┐      ┌─────────────┐
       └───────────▶│   Claude    │      │  MCP Server │
                    │    (AI)     │      │ (Smithery)  │
                    └─────────────┘      └─────────────┘
```

### State Management

Server maintains canonical state in `WorkflowSession` (see [types/workflow.ts](#10-type-definitions)).

Client maintains minimal UI state in `ClientWorkflowState` (see [types/workflow.ts](#10-type-definitions)).

### Delta Operations

Operations are atomic units of change. See [types/workflow.ts](#10-type-definitions) for `WorkflowOperation` type definition.

### Database Consistency Architecture

#### Read-After-Write Consistency

The system guarantees read-after-write consistency through:

1. **Atomic Updates with RETURNING**: All state updates use PostgreSQL's RETURNING clause to atomically return the updated state
2. **Optimistic Locking**: Version field prevents concurrent update conflicts
3. **Retry Mechanisms**: Exponential backoff for handling transient failures
4. **Direct State Return**: Apply operations return state directly, eliminating separate reads

#### Consistency Patterns

```typescript
// Atomic update with state return
const { data } = await supabase
  .from("workflow_sessions")
  .update({ state, version: version + 1 })
  .eq("session_id", sessionId)
  .eq("version", currentVersion) // Optimistic lock
  .select("state, version")
  .single();
```

### Session Management

```typescript
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = nanoid(10);
  return `wf_${timestamp}_${random}`;
}
```

Session lifecycle: Creation → Active (1hr timeout) → Inactive → Cleanup (24hr)

---

## 4. Phase System

### Phase Reference Table

| Phase             | Description              | Available Tools                                                                   | Allowed Operations                                                                            | Clarifications | Auto-Transition |
| ----------------- | ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------- | --------------- |
| **Discovery**     | Find relevant nodes      | `search_nodes`, `get_node_info`, `list_node_types`                                | `discoverNode`, `selectNode`, `deselectNode`, `requestClarification`, `clarificationResponse` | ✅ Allowed     | ❌ Manual       |
| **Configuration** | Configure selected nodes | `get_node_essentials`, `get_node_schema`, `validate_params`                       | `configureNode`, `updateNodeConfig`                                                           | ❌ Not allowed | ✅ Auto         |
| **Validation**    | Validate configurations  | `validate_workflow`, `check_connections`, `get_input_schema`, `get_output_schema` | `validateNode`, `addValidationError`                                                          | ❌ Not allowed | ✅ Auto         |
| **Building**      | Connect nodes            | `generate_workflow`, `optimize_workflow`                                          | `addToWorkflow`, `addConnection`, `updateWorkflowSettings`                                    | ❌ Not allowed | ✅ Auto         |
| **Complete**      | Export workflow          | None                                                                              | None                                                                                          | ❌ Not allowed | N/A             |

### Detailed Phase Descriptions

#### Discovery Phase
The discovery phase is the initial stage where Claude analyzes the user's prompt and identifies relevant n8n nodes needed to build the workflow.

**Process Flow**:
1. **Intent Analysis**: Claude analyzes the user prompt using `analyzeWorkflowIntent()` to understand the workflow requirements
2. **Search Term Generation**: AI suggests relevant search terms based on the prompt (e.g., "webhook", "slack", "database")
3. **Node Search**: Uses MCP `search_nodes` with suggested terms, limiting results to 3-5 per search for efficiency
4. **Node Details**: Fetches basic information for relevant nodes using `get_node_info`
5. **AI-Driven Selection**: Claude generates operations to discover and select appropriate nodes
6. **Clarification Handling**: If the prompt is ambiguous, Claude can request clarification from the user

**Key Features**:
- Trust-based AI decisions - no complex scoring algorithms
- Minimal MCP calls (2-3 searches vs 10+)
- Support for clarification requests when user intent is unclear
- Deduplication of discovered nodes
- Session state tracking with operation history

**Example Operations**:
```typescript
{ type: "discoverNode", node: { id: "node_1", type: "nodes-base.webhook", purpose: "Receive webhook data" }}
{ type: "selectNode", nodeId: "node_1" }
{ type: "requestClarification", questionId: "q1", question: "What type of database would you like to use?", context: {} }
```

#### Configuration Phase
The configuration phase sets up the parameters for each selected node based on user requirements and node schemas.

**Process Flow**:
1. **Schema Retrieval**: Fetches essential parameters for selected nodes using `get_node_essentials`
2. **AI Configuration**: Claude extracts configuration values from the user prompt and applies them
3. **Smart Property Search**: Only searches for additional properties if Claude determines it's necessary
4. **Pre-Validation**: Basic validation of configurations before moving to validation phase
5. **Batch Configuration**: All selected nodes are configured in a single Claude interaction

**Key Features**:
- Trust Claude to extract configuration from user prompts (e.g., Bearer auth, retry logic)
- Minimal schema fetching - just essentials unless more is needed
- Support for complex configurations like authentication, headers, and data transformations
- Automatic detection of required vs optional parameters

**Example Configurations**:
- Webhook: HTTP method, path, authentication type
- Slack: Channel, message format, attachments
- Database: Connection string, query, operation type

#### Validation Phase  
The validation phase ensures all node configurations are correct and the workflow will function properly.

**Process Flow**:
1. **Configuration Validation**: Validates each node's configuration using MCP `validate_params`
2. **Connection Validation**: Checks node connections are valid using `check_connections`
3. **Schema Compatibility**: Verifies input/output schemas match between connected nodes
4. **Error Collection**: Aggregates all validation errors with clear descriptions
5. **Auto-Fix Attempt**: Claude attempts to fix validation errors automatically
6. **Iterative Fixing**: May cycle back to configuration phase if errors need user input

**Key Features**:
- Comprehensive validation using MCP tools
- Automatic error correction where possible
- Clear error messages with field-level details
- Support for both errors and warnings
- Validation state tracking per node

**Validation Checks**:
- Required fields presence
- Data type compatibility
- Connection validity
- Authentication requirements
- Rate limits and quotas

#### Building Phase
The building phase assembles the final workflow JSON from validated configurations.

**Process Flow**:
1. **Node Positioning**: Calculates optimal positions for nodes in the workflow canvas
2. **Connection Creation**: Establishes connections between nodes based on data flow
3. **Workflow Generation**: Uses MCP `generate_workflow` to create the n8n JSON structure
4. **Settings Configuration**: Adds workflow metadata (name, execution order, timezone)
5. **Optimization**: Optional workflow optimization for performance

**Key Features**:
- Automatic node positioning algorithm
- Smart connection routing
- Workflow metadata generation
- Export-ready n8n JSON format
- Support for complex branching workflows

**Generated Structure**:
```typescript
{
  name: "User's Workflow Name",
  nodes: [...],  // Positioned nodes with configurations
  connections: {...},  // Node connection mappings
  settings: {
    executionOrder: "v1",
    saveDataSuccessExecution: true,
    timezone: "America/New_York"
  }
}
```

#### Complete Phase
The final phase where the workflow is ready for export and use.

**Features**:
- Workflow JSON available for download
- Import instructions for n8n
- Token usage statistics
- Operation history summary
- No further modifications allowed

### Phase Transition Logic

See [lib/phase-manager.ts] for implementation. Core logic checks required conditions before allowing transitions.

### Auto-Transition Rules

| Current Phase | Condition              | Next Phase    | Auto   |
| ------------- | ---------------------- | ------------- | ------ |
| Discovery     | Nodes selected by user | Configuration | Manual |
| Configuration | All nodes configured   | Validation    | Auto   |
| Validation    | All nodes valid        | Building      | Auto   |
| Validation    | Errors found           | Configuration | Auto   |
| Building      | Workflow complete      | Complete      | Auto   |

---

## 5. API Routes

### Session Management Routes

#### Create Session

- **Path**: `/api/workflow/create`
- **Method**: `POST`
- **Request**:
  ```typescript
  {
    prompt: string;
    metadata?: {
      name?: string;
      description?: string;
    }
  }
  ```
- **Response**:
  ```typescript
  {
    sessionId: string;
    createdAt: string;
    expiresAt: string;
  }
  ```

### Workflow Operations Routes

#### Apply Operations

- **Path**: `/api/workflow/[sessionId]/apply`
- **Method**: `POST`
- **Request**:
  ```typescript
  {
    operations: WorkflowOperation[];
  }
  ```
- **Response**:
  ```typescript
  {
    success: boolean;
    applied: number;
    stateUpdate: {
      phase: string;
      discovered?: number;
      configured?: number;
      validated?: number;
      errors?: ValidationError[];
    };
    pendingClarification?: {
      questionId: string;
      question: string;
    };
  }
  ```

#### Get State

- **Path**: `/api/workflow/[sessionId]/state`
- **Method**: `GET`
- **Request**: None
- **Response**:
  ```typescript
  {
    phase: string;
    stats: {
      discovered: number;
      selected: number;
      configured: number;
      validated: number;
    }
  }
  ```

#### Export Workflow

- **Path**: `/api/workflow/[sessionId]/export`
- **Method**: `GET`
- **Request**: None
- **Response**:
  ```typescript
  {
    workflow: {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
      settings: WorkflowSettings;
    };
    metadata: {
      createdAt: string;
      operationCount: number;
      tokensSaved: string;
    };
  }
  ```

#### Phase Status

- **Path**: `/api/workflow/[sessionId]/phase-status`
- **Method**: `GET`
- **Request**: None
- **Response**:
  ```typescript
  {
    currentPhase: WorkflowPhase;
    canProgress: boolean;
    autoTransition: boolean;
    reason?: string;
  }
  ```

### Claude Integration Route

#### Process with Claude

- **Path**: `/api/claude`
- **Method**: `POST`
- **Request**:

  ```typescript
  {
    sessionId: string;
    phase: WorkflowPhase;
    prompt: string;
    selectedNodes?: string[];
  }

  ```

- **Response**:
  ```typescript
  {
    operations: WorkflowOperation[];
  }
  ```

### Maintenance Routes

#### Session Cleanup

- **Path**: `/api/cron/cleanup`
- **Method**: `GET`
- **Request**: None (requires Bearer token)
- **Response**:
  ```typescript
  {
    success: boolean;
    expired: number;
    deleted: number;
    timestamp: string;
  }
  ```

---

## 6. MCP Server Integration

### Connection Details

- **Endpoint**: `https://server.smithery.ai/@vincentmcleese/n8n-mcp/mcp`
- **Authentication**: Bearer token
- **SDK**: `@modelcontextprotocol/sdk@^1.15.1`

### Available Tools

| Tool                  | Phase         | Description                  | Parameters             |
| --------------------- | ------------- | ---------------------------- | ---------------------- |
| `search_nodes`        | Discovery     | Find relevant n8n nodes      | `query`, `limit`       |
| `get_node_info`       | Discovery     | Get basic node information   | `nodeType`             |
| `list_node_types`     | Discovery     | List all available nodes     | None                   |
| `get_node_essentials` | Configuration | Get required/optional params | `nodeType`             |
| `get_node_schema`     | Configuration | Get full parameter schema    | `nodeType`             |
| `validate_params`     | Configuration | Validate configuration       | `nodeType`, `params`   |
| `validate_workflow`   | Validation    | Full workflow validation     | `workflow`             |
| `check_connections`   | Validation    | Verify connections           | `connections`          |
| `get_input_schema`    | Validation    | Expected input format        | `nodeType`             |
| `get_output_schema`   | Validation    | Output format                | `nodeType`             |
| `generate_workflow`   | Building      | Generate final JSON          | `nodes`, `connections` |
| `optimize_workflow`   | Building      | Optimize structure           | `workflow`             |

### Error Handling

See [lib/mcp-error-handler.ts] for `MCPConnectionError` class and `connectWithRetry` function implementation.

### Retry and Backoff Strategies

#### Exponential Backoff Implementation

```typescript
interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 50ms
  backoffMultiplier?: number; // Default: 2
  maxDelayMs?: number; // Default: 1000ms
  jitterMs?: number; // Default: 10ms
}
```

#### Retry Patterns

1. **Database Read Operations**: 3 retries with 50ms initial delay
2. **API Calls**: 3 retries with 100ms initial delay
3. **Version Conflicts**: Immediate retry with fresh state
4. **Connection Failures**: 5 retries with 200ms initial delay

---

## 7. AI Orchestration Best Practices

### Trust Claude's Intelligence

The system is designed to leverage Claude's natural language understanding and reasoning capabilities without overengineering. This principle applies across all phases:

#### Discovery Phase
- **Let Claude suggest search terms**: Claude analyzes the user's intent and suggests relevant search keywords
- **Simple searches yield good results**: Use small limits (3-5) and trust that good search terms find the right nodes
- **Minimal filtering**: Only fetch details for nodes that match Claude's recommendations or search terms
- **No complex scoring**: Avoid relevance scoring algorithms - let Claude decide which nodes are needed

#### Configuration Phase  
- **Provide essentials only**: Just give Claude the node schemas/essentials, not exhaustive property searches
- **Trust configuration choices**: Claude can extract values from user prompts and apply them correctly
- **Avoid over-fetching**: Don't search for every possible property or fetch all documentation
- **Let Claude decide what's needed**: Claude can determine if additional MCP tools (search_node_properties, get_node_documentation) are needed
- **Extract user requirements**: Claude will map specific features mentioned (Bearer auth, retry logic, etc.) to node configuration

#### Implementation Pattern

**Good Practice (Simplified)**:
```typescript
// Discovery Phase - Let Claude analyze what to search for
const analysis = await claudeService.analyzeWorkflowIntent(prompt);

// Simple search with Claude's terms
for (const term of analysis.suggestedSearchTerms) {
  const results = await mcpClient.searchNodes({ query: term, limit: 3 });
  // Add unique results
}

// Only get details for relevant nodes
const relevantNodes = nodes.filter(n => 
  analysis.nodeRecommendations.some(rec => 
    n.type.includes(rec.type)
  )
);

// Configuration Phase - Trust Claude with minimal guidance
const nodeEssentials = {};
for (const nodeType of selectedNodeTypes) {
  // Just get essentials - Claude decides if more is needed
  nodeEssentials[nodeType] = await mcpClient.getNodeEssentials(nodeType);
}

// Let Claude configure based on user requirements
const config = await claudeService.processWorkflowPhase(
  'configuration',
  userPrompt,
  sessionId,
  selectedNodeIds,
  { nodeSchemas: nodeEssentials }
);
```

**Avoid (Overengineered)**:
```typescript
// Discovery - Complex relevance scoring
const relevanceScore = calculateRelevance(node, searchTerms, position);
// Hardcoded keyword extraction
const keywords = extractPropertyKeywords(prompt);

// Configuration - Over-analyzing what properties to search
const configAnalysis = await claudeService.analyzeConfigurationNeeds(prompt, nodes);
// Fetching everything
const allProperties = await searchAllNodeProperties(node);
const allDocs = await getNodeDocumentation(node);
const allTemplates = await getNodeTemplates(node);
// Complex property mapping logic
const mappedConfig = mapUserIntentToProperties(prompt, allProperties);
```

### MCP Tool Usage Philosophy

1. **Claude decides when to use tools**: Don't hardcode tool usage patterns
2. **Provide context, not instructions**: Give Claude the data it needs, not step-by-step instructions
3. **Trust the search results**: If Claude searches for "webhook" and "slack", those are the nodes needed
4. **Minimal tool calls**: Each phase should make only necessary MCP calls, not exhaustive searches

### Performance Benefits

This trust-based approach results in:
- **Fewer MCP calls**: Only searching for what's needed (2-3 searches vs 10+)
- **Smaller context**: Only relevant nodes passed to Claude (2-5 nodes vs 20+)
- **Faster responses**: Less data to process means quicker decisions
- **Better accuracy**: Claude focuses on relevant options instead of being overwhelmed

---

## 8. Error Handling

### Error Classification

| Type         | Source     | Examples                                     | Retry Strategy              |
| ------------ | ---------- | -------------------------------------------- | --------------------------- |
| `claude_api` | Claude API | Rate limit, token limit, connection failed   | Auto-retry 3x with backoff  |
| `mcp_server` | MCP Server | Connection failed, tool not found, timeout   | Retry 3x, fallback to cache |
| `database`   | Supabase   | Connection lost, write failed                | Auto-retry when reconnected |
| `validation` | Validation | Invalid config, missing field, type mismatch | No retry, user fix          |
| `client`     | Browser    | Network offline, session timeout             | Auto-sync when online       |

### Recovery Strategies

See [types/workflow.ts](#10-type-definitions) for `ErrorResponse` interface definition.

### UI Components

```tsx
export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorProps) {
  const getErrorIcon = (type: string) => {
    switch (type) {
      case "validation":
        return <AlertCircle className="text-yellow-500" />;
      case "claude_api":
        return <Brain className="text-blue-500" />;
      case "mcp_server":
        return <Server className="text-orange-500" />;
      default:
        return <XCircle className="text-red-500" />;
    }
  };

  return (
    <Alert
      className={`mb-4 ${
        error.retryable ? "border-yellow-500" : "border-red-500"
      }`}
    >
      <div className="flex items-start gap-3">
        {getErrorIcon(error.type)}
        <div className="flex-1">
          <AlertTitle>{error.userMessage}</AlertTitle>
          {error.suggestion && (
            <AlertDescription className="mt-1">
              {error.suggestion}
            </AlertDescription>
          )}
        </div>
        <div className="flex gap-2">
          {error.retryable && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Alert>
  );
}
```

---

## 9. UI Components

### Component List

| Component             | Purpose                 | Props                                 |
| --------------------- | ----------------------- | ------------------------------------- |
| `PromptInput`         | Initial workflow prompt | `onSubmit`                            |
| `PhaseIndicator`      | Visual phase progress   | `currentPhase`, `completedPhases`     |
| `ClarificationDialog` | Ask user questions      | `question`, `questionId`, `onRespond` |
| `LoadingState`        | Phase-specific loading  | `phase`, `message`                    |
| `WorkflowResult`      | Final JSON display      | `workflow`, `sessionId`               |
| `ErrorDisplay`        | Show errors             | `error`, `onRetry`, `onDismiss`       |

### Phase Indicator

```tsx
const phases = [
  "Discovery",
  "Configuration",
  "Validation",
  "Building",
  "Complete",
];

export function PhaseIndicator({
  currentPhase,
  completedPhases,
}: PhaseIndicatorProps) {
  return (
    <div className="flex items-center justify-center space-x-2 py-8">
      {phases.map((phase, i) => {
        const isCompleted = completedPhases.includes(phase.toLowerCase());
        const isCurrent = phase.toLowerCase() === currentPhase;

        return (
          <div key={phase} className="flex items-center">
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm
              ${
                isCompleted
                  ? "bg-green-500 text-white"
                  : isCurrent
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }
            `}
            >
              {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < phases.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-1 
                ${isCompleted ? "bg-green-500" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Clarification Dialog

```tsx
export function ClarificationDialog({
  question,
  questionId,
  onRespond,
}: ClarificationDialogProps) {
  const [response, setResponse] = useState("");

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Quick Question</DialogTitle>
          <DialogDescription className="text-base pt-2">
            {question}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Your answer..."
            className="text-base"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => onRespond(response)}
            disabled={!response.trim()}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 10. Implementation Guide

### Phase 1: Infrastructure

1. Set up Next.js 14 project with TypeScript
2. Configure Supabase and create database schema
3. Implement session management utilities
4. Set up MCP client with authentication
5. Create error handling framework

### Phase 2: Core Features

1. Implement API routes (create, apply, state, export)
2. Integrate Claude for operation generation
3. Connect MCP tools for each phase
4. Build phase transition logic
5. Add operation validation

### Phase 3: UI & Polish

1. Create UI components (phase indicator, dialogs)
2. Implement main workflow builder page
3. Add error recovery UI
4. Set up session cleanup (cron or edge function)
5. Optimize performance and token usage

---

## 11. Type Definitions

### Complete Type Reference

All types are defined in `types/workflow.ts`:

```typescript
// types/workflow.ts

// Core Types
export interface WorkflowNode {
  id: string;
  type: string;
  position: [number, number];
  parameters: Record<string, any>;
}

export interface WorkflowConnection {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface WorkflowSettings {
  name: string;
  executionOrder?: string;
  timezone?: string;
  saveDataSuccessExecution?: boolean;
}

export type WorkflowPhase =
  | "discovery"
  | "configuration"
  | "validation"
  | "building"
  | "complete";

// State Types
export interface WorkflowSession {
  sessionId: string;
  createdAt: Date;
  state: {
    phase: WorkflowPhase;
    userPrompt: string;
    discovered: DiscoveredNode[];
    selected: string[];
    configured: Map<string, NodeConfiguration>;
    validated: Map<string, ValidationResult>;
    workflow: {
      nodes: WorkflowNode[];
      connections: WorkflowConnection[];
      settings: WorkflowSettings;
    };
    operationHistory: WorkflowOperation[];
    pendingClarifications: ClarificationRequest[];
    clarificationHistory: ClarificationResponse[];
  };
}

export interface ClientWorkflowState {
  sessionId: string;
  currentPhase: WorkflowPhase;
  selectedNodeId?: string;
  expandedSections: string[];
  pendingOperations: WorkflowOperation[];
  lastServerUpdate: {
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: ValidationError[];
  };
}

// Operation Types
export type WorkflowOperation =
  // Discovery operations
  | {
      type: "discoverNode";
      node: { id: string; type: string; purpose: string };
    }
  | { type: "selectNode"; nodeId: string }
  | { type: "deselectNode"; nodeId: string }
  | {
      type: "requestClarification";
      questionId: string;
      question: string;
      context: any;
    }
  | { type: "clarificationResponse"; questionId: string; response: string }

  // Configuration operations
  | { type: "configureNode"; nodeId: string; config: any }
  | { type: "updateNodeConfig"; nodeId: string; path: string; value: any }

  // Validation operations
  | { type: "validateNode"; nodeId: string; result: ValidationResult }
  | { type: "addValidationError"; nodeId: string; error: ValidationError }

  // Building operations
  | { type: "addToWorkflow"; nodeId: string; position: [number, number] }
  | { type: "addConnection"; source: string; target: string }
  | { type: "updateWorkflowSettings"; settings: Partial<WorkflowSettings> }

  // Phase operations
  | { type: "setPhase"; phase: WorkflowPhase }
  | { type: "completePhase"; phase: WorkflowPhase };

// Supporting Types
export interface DiscoveredNode {
  id: string;
  type: string;
  purpose: string;
}

export interface NodeConfiguration {
  nodeId: string;
  nodeType: string;
  parameters: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  nodeId: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ClarificationRequest {
  questionId: string;
  question: string;
  context: any;
  timestamp: Date;
}

export interface ClarificationResponse {
  questionId: string;
  question: string;
  response: string;
  timestamp: Date;
}

// Error Types
export interface ErrorResponse {
  error: {
    type: "claude_api" | "mcp_server" | "database" | "validation" | "client";
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    retryAfter?: number;
    suggestion?: string;
    context?: any;
  };
  fallback?: {
    action: "use_cache" | "skip_step" | "simplified_mode" | "offline_mode";
    data?: any;
  };
}
```

---

## 11. Appendices

### A. Operation Types Quick Reference

| Operation                | Type          | Phase         | Description                 |
| ------------------------ | ------------- | ------------- | --------------------------- |
| `discoverNode`           | Discovery     | Discovery     | Add node to discovered list |
| `selectNode`             | Discovery     | Discovery     | Select node for workflow    |
| `deselectNode`           | Discovery     | Discovery     | Remove node from selection  |
| `requestClarification`   | Discovery     | Discovery     | Ask user a question         |
| `clarificationResponse`  | Discovery     | Discovery     | User's answer               |
| `configureNode`          | Configuration | Configuration | Set node parameters         |
| `updateNodeConfig`       | Configuration | Configuration | Update specific parameter   |
| `validateNode`           | Validation    | Validation    | Record validation result    |
| `addValidationError`     | Validation    | Validation    | Add validation error        |
| `addToWorkflow`          | Building      | Building      | Add node to workflow        |
| `addConnection`          | Building      | Building      | Connect two nodes           |
| `updateWorkflowSettings` | Building      | Building      | Update workflow metadata    |
| `setPhase`               | Phase         | Any           | Manual phase change         |
| `completePhase`          | Phase         | Any           | Mark phase complete         |

### B. Token Optimization

| Approach              | Phase         | Token Usage | Description        |
| --------------------- | ------------- | ----------- | ------------------ |
| Traditional           | Discovery     | 5KB         | Full node list     |
| Traditional           | Configuration | 10KB        | All configurations |
| Traditional           | Validation    | 8KB         | All results        |
| Traditional           | Building      | 15KB        | Complete workflow  |
| **Traditional Total** | All           | **~38KB**   | Per workflow       |
| Delta                 | Discovery     | 0.5KB       | Just new nodes     |
| Delta                 | Configuration | 1KB         | Just configs       |
| Delta                 | Validation    | 0.8KB       | Just results       |
| Delta                 | Building      | 1.5KB       | Just connections   |
| **Delta Total**       | All           | **~3.8KB**  | **90% reduction!** |

### C. Performance Benchmarks

| Metric           | Traditional | Delta-Based | With Consistency Fix | Improvement     |
| ---------------- | ----------- | ----------- | -------------------- | --------------- |
| Avg Token Usage  | 38,000      | 3,800       | 3,800                | 90% reduction   |
| Response Time    | 2-3s        | 200-500ms   | 150-300ms            | 85% faster      |
| Memory/Session   | 50KB        | 5KB         | 5KB                  | 90% less        |
| Concurrent Users | 100         | 1000        | 1000+                | 10x capacity    |
| DB Round Trips   | 3-4         | 2           | 1                    | 75% reduction   |
| Race Conditions  | Common      | Occasional  | None                 | 100% eliminated |

### D. Unit Testing Strategy

#### Testing Framework

**Jest Configuration**:
- Next.js optimized setup with `next/jest`
- Node test environment for API routes
- Custom matchers for workflow operations
- 80% coverage thresholds for all metrics

**Test Structure**:
```
__tests__/
├── unit/
│   ├── api/           # API route tests
│   ├── lib/           # Library function tests
│   └── services/      # Service layer tests
├── integration/       # Cross-module tests
└── test-utils.ts     # Shared utilities
```

#### Phase-Specific Testing

##### Discovery Phase Tests

**1. WorkflowOrchestrator Tests**:
- Node discovery and selection
- Clarification request handling
- Error recovery and retries
- Operation validation
- AI reasoning extraction

**2. ClaudeService Tests**:
- Prompt processing for each phase
- Response parsing and validation
- Node naming convention compliance
- Context handling and history
- Error handling with retry flags

**3. API Route Tests**:
- Session creation and validation
- Operation application and state updates
- Phase status checks
- Error response formatting
- Integration flow tests

**4. PhaseManager Tests**:
- Phase transition logic
- Operation validation per phase
- Tool availability checks
- Auto-transition rules

#### Testing Best Practices

**1. Mock Strategy**:
```typescript
// Consistent mocking for external dependencies
jest.mock('@anthropic-ai/sdk')
jest.mock('@modelcontextprotocol/sdk')
jest.mock('@supabase/supabase-js')
```

**2. Test Data Factories**:
```typescript
// Reusable test data creation
createMockSession(overrides)
createMockOperations()
mockSuccessResponse(data)
mockErrorResponse(status, error)
```

**3. Coverage Requirements**:
- **Unit Tests**: Each phase component tested in isolation with mocks
- **Integration Tests**: Real API testing with live Claude and MCP services

**4. Phase Testing Checklist**:
- [ ] Discovery: Node search, selection, clarification
- [ ] Configuration: Parameter setting, validation
- [ ] Validation: Error detection, auto-correction
- [ ] Building: Workflow assembly, connections
- [ ] Complete: Export functionality

#### Discovery Phase Integration Testing

**Real API Testing Strategy**:
- Integration tests use live Anthropic Claude API and MCP services
- Custom test runner bypasses Jest ESM issues with `tsx`
- Test execution time optimized with claude-3-haiku model (~1-3s per call)
- Environment variables loaded from `.env.local`

**Test Structure**:
```
scripts/
├── run-integration-tests.ts           # Main integration runner
├── test-discovery-phase-integration.ts # Comprehensive discovery tests
├── test-clarification.ts              # Clarification request tests
└── test-clarification-complete.ts     # Full clarification flow
```

**Core Discovery Test Scenarios**:

1. **Simple Workflow Creation**: 
   - Basic webhook → Slack workflows
   - Node discovery and selection validation
   - Operation sequence verification

2. **Complex Multi-Step Workflows**:
   - 7-step workflows with multiple node types
   - Webhook → Transform → Multi-channel Slack → Database → Email
   - Comprehensive node type validation

3. **Clarification Request Handling**:
   - Ambiguous prompts trigger `requestClarification` operations
   - Database type clarification ("store data in database")
   - Slack channel clarification ("send to Slack")
   - Multi-question clarification scenarios

4. **Clarification Response Processing**:
   - `handleClarificationResponse()` with user inputs
   - Operation sequence: `clarificationResponse` → updated discovery
   - Context preservation across clarification cycles
   - Database-independent operation for test compatibility

5. **Error Recovery & Resilience**:
   - Invalid API key handling with graceful error responses
   - Concurrent discovery operations (5 parallel requests)
   - MCP connection health validation

6. **Domain-Specific Workflows**:
   - E-commerce: Order processing with payment validation
   - DevOps: CI/CD pipeline with GitHub integration
   - Marketing: Social media automation
   - Data Processing: ETL pipelines

**Clarification Flow Testing**:
```typescript
// Example clarification test pattern
const result = await orchestrator.runDiscoveryPhase(sessionId, ambiguousPrompt);
if (result.pendingClarification) {
  const clarified = await orchestrator.handleClarificationResponse(
    sessionId, 
    result.pendingClarification.questionId,
    "PostgreSQL database for user profiles"
  );
  // Verify clarificationResponse operation + updated nodes
}
```

**Performance Characteristics**:
- 8-9 integration tests complete in ~80 seconds
- Each Claude API call: 1-3 seconds (claude-3-haiku)
- Concurrent operations: 40-70% time savings
- No database mocking required for clarification testing

#### Test Execution

```bash
# Run integration tests with real APIs (recommended)
npm run test:integration

# Run specific discovery phase tests
npx tsx scripts/test-discovery-phase-integration.ts

# Test clarification flow
npx tsx scripts/test-clarification-complete.ts

# Run unit tests (Jest)
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Environment Requirements**:
```bash
# Required environment variables in .env.local
ANTHROPIC_API_KEY=sk-ant-...        # For Claude API calls
MCP_API_KEY=...                     # For n8n node validation
MCP_SERVER_URL=...                  # MCP server endpoint
```

#### Continuous Integration

**GitHub Actions Workflow**:
```yaml
- name: Run Unit Tests
  run: npm test -- --ci --coverage
  
- name: Run Discovery Integration Tests
  run: npm run test:integration
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    MCP_API_KEY: ${{ secrets.MCP_API_KEY }}
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

### E. Future Enhancements

1. **Operation Templates**

   - Save common operation sequences
   - Replay operation patterns
   - Share operation chains

2. **Smart Operation Suggestions**

   - Predict next operations based on history
   - Auto-complete configuration patterns
   - Learn from successful workflows

3. **Branching & Merging**

   - Fork workflow at any point
   - Try alternative approaches
   - Merge successful branches

4. **Real-Time Collaboration**

   - Share sessions with operation streaming
   - Conflict-free concurrent editing
   - Operation attribution and commenting

5. **SEO-Friendly URLs**
   ```typescript
   const generateSlug = (workflowName: string, sessionId: string) => {
     const nameSlug = workflowName
       .toLowerCase()
       .replace(/[^a-z0-9]+/g, "-")
       .replace(/^-|-$/g, "");
     const shortId = sessionId.slice(-6);
     return `${nameSlug}-${shortId}`;
   };
   ```
