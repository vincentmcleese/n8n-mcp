# Complete Task-Based Breakdown: n8n Workflow Builder MVP

## EPIC: n8n Workflow Builder Implementation

**Goal**: Build a Next.js application that helps users create n8n workflows using Claude AI and MCP server integration with delta-based operations for 90% token reduction.

---

## STORY-001: Infrastructure Setup (Phase 1)

**Goal**: Establish the foundational infrastructure for the application
**Time Estimate**: 8-10 hours
**Dependencies**: None (can start immediately)

### TASK-001.1: Initialize Next.js Project

**Time**: 30 minutes

```bash
# Execute
npx create-next-app@14 n8n-workflow-builder --typescript --tailwind --app --src-dir=false
cd n8n-workflow-builder
npm install @radix-ui/react-dialog @radix-ui/react-alert
```

**Verify**:

- [ ] `npm run dev` starts server on localhost:3000
- [ ] TypeScript compilation successful
- [ ] Tailwind CSS working (test with `bg-blue-500`)
      **Success**: Clean Next.js 14 app with TypeScript and Tailwind

### TASK-001.2: Install All Dependencies

**Time**: 15 minutes

```bash
# Execute
npm install @anthropic-ai/sdk@^0.24.0 \
  @modelcontextprotocol/sdk@^1.15.1 \
  @supabase/supabase-js@^2.39.0 \
  lucide-react@^0.294.0 \
  nanoid@^5.0.4 \
  react-syntax-highlighter@^15.5.0 \
  @types/react-syntax-highlighter@^15.5.11
```

**Verify**:

- [ ] All packages in package.json
- [ ] No peer dependency warnings
- [ ] `npm run build` succeeds
      **Success**: All dependencies installed without conflicts

### TASK-001.3: Configure Environment Variables

**Time**: 30 minutes
**Files**: `.env.local`, `.env.example`

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
MCP_SERVER_URL=https://server.smithery.ai/@vincentmcleese/n8n-mcp/mcp
MCP_API_KEY=28d8026f-fad7-4bc6-87c5-9fcacba57fde
MCP_PROFILE=intermediate-cuckoo-DIapDk
CRON_SECRET=your_random_string_here
```

**Verify**:

- [ ] Create test route that logs all env vars
- [ ] All 7 variables load correctly
- [ ] Remove test route after verification
      **Success**: Environment properly configured

### TASK-001.4: Set up Supabase Database

**Time**: 45 minutes
**Prerequisites**: Supabase account created

```sql
-- Execute in Supabase SQL editor
CREATE TABLE workflow_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    state JSONB NOT NULL DEFAULT '{}',
    operations JSONB DEFAULT '[]',
    user_prompt TEXT,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_session_id ON workflow_sessions(session_id);

-- Test query
SELECT * FROM workflow_sessions LIMIT 1;
```

**Verify**:

- [ ] Table created successfully
- [ ] Can insert test record
- [ ] Index is active
      **Success**: Database schema ready

### TASK-001.5: Create Project File Structure

**Time**: 30 minutes

```bash
# Create directories
mkdir -p app/workflow/\[sessionId\]/result
mkdir -p app/workflow/components
mkdir -p app/api/workflow/\[sessionId\]/{apply,state,export,phase-status}
mkdir -p app/api/workflow/create
mkdir -p app/api/claude
mkdir -p app/api/cron/cleanup
mkdir -p lib hooks types
```

**Files to create**:

- `types/workflow.ts` (empty for now)
- `lib/supabase.ts` (empty for now)
- `.gitignore` (add .env.local)
  **Success**: Complete project structure established

### TASK-001.6: Create Core Type Definitions

**Time**: 1 hour
**File**: `types/workflow.ts`

```typescript
// Copy ALL type definitions from design doc section 10
export interface WorkflowNode { ... }
export interface WorkflowConnection { ... }
// ... etc (complete file from design)
```

**Verify**:

- [ ] TypeScript compiles without errors
- [ ] Import works: `import { WorkflowNode } from '@/types/workflow'`
      **Success**: All types defined and importable

### TASK-001.7: Initialize Supabase Client

**Time**: 30 minutes
**File**: `lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test function
export async function testConnection() {
  const { data, error } = await supabase
    .from("workflow_sessions")
    .select("count")
    .single();

  return { success: !error, data, error };
}
```

**Verify**:

- [ ] Run testConnection() in a test route
- [ ] Connection successful
      **Success**: Supabase client configured and working

---

## STORY-002: Session Management System

**Goal**: Implement session creation and management
**Time Estimate**: 6-8 hours
**Dependencies**: STORY-001 complete

### TASK-002.1: Implement Session Utilities

**Time**: 1 hour
**File**: `lib/session-utils.ts`

```typescript
import { nanoid } from "nanoid";
import { supabase } from "./supabase";
import type { WorkflowSession } from "@/types/workflow";

export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = nanoid(10);
  return `wf_${timestamp}_${random}`;
}

export function parseSessionId(sessionId: string) {
  const parts = sessionId.split("_");
  return {
    prefix: parts[0],
    timestamp: parseInt(parts[1]),
    random: parts[2],
    createdAt: new Date(parseInt(parts[1])),
  };
}

export async function createWorkflowSession(prompt: string, metadata?: any) {
  // Complete implementation from design doc
}
```

**Verify**:

- [ ] generateSessionId() returns correct format
- [ ] parseSessionId() extracts all parts
- [ ] createWorkflowSession() creates DB record
      **Success**: Session utilities working

### TASK-002.2: Create Session API Route

**Time**: 1 hour
**File**: `app/api/workflow/create/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createWorkflowSession } from "@/lib/session-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, metadata } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const session = await createWorkflowSession(prompt, metadata);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
```

**Verify**:

- [ ] POST /api/workflow/create with valid body
- [ ] Returns sessionId, createdAt, expiresAt
- [ ] Database record created
      **Success**: Session creation endpoint working

### TASK-002.3: Implement Session Heartbeat

**Time**: 45 minutes
**File**: `hooks/use-session-heartbeat.ts`

```typescript
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useSessionHeartbeat(sessionId: string) {
  useEffect(() => {
    const heartbeat = async () => {
      await supabase
        .from("workflow_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("session_id", sessionId);
    };

    heartbeat();
    const interval = setInterval(heartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sessionId]);
}
```

**Verify**:

- [ ] Hook updates timestamp
- [ ] Runs every 5 minutes
- [ ] Cleanup on unmount
      **Success**: Session stays active with heartbeat

### TASK-002.4: Add Session Recovery

**Time**: 45 minutes
**File**: `lib/session-recovery.ts`

```typescript
// Implementation from design document
export async function recoverSession(sessionId: string): Promise<boolean> {
  // ... implementation
}
```

**Verify**:

- [ ] Can recover expired but active sessions
- [ ] Returns false for non-existent sessions
      **Success**: Session recovery implemented

---

## STORY-003: MCP Server Integration

**Goal**: Connect to Smithery.ai MCP server
**Time Estimate**: 4-6 hours
**Dependencies**: STORY-001 complete

### TASK-003.1: Create MCP Client

**Time**: 1.5 hours
**File**: `lib/mcp-client.ts`

```typescript
// Complete implementation from design document
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

class MCPClient {
  // ... full implementation
}
```

**Verify**:

- [ ] Singleton pattern works
- [ ] Can call getInstance()
- [ ] TypeScript types correct
      **Success**: MCP client class created

### TASK-003.2: Implement MCP Error Handling

**Time**: 1 hour
**File**: `lib/mcp-error-handler.ts`

```typescript
export class MCPConnectionError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = "MCPConnectionError";
  }
}

export async function connectWithRetry(
  client: MCPClient,
  maxRetries: number = 3
): Promise<void> {
  // Implementation with exponential backoff
}
```

**Verify**:

- [ ] Error class instantiates correctly
- [ ] Retry logic with backoff works
- [ ] Fails after max retries
      **Success**: Robust error handling for MCP

### TASK-003.3: Test MCP Connection

**Time**: 1 hour
**File**: `app/api/test-mcp/route.ts` (temporary)

```typescript
import MCPClient from "@/lib/mcp-client";
import { connectWithRetry } from "@/lib/mcp-error-handler";

export async function GET() {
  try {
    const mcp = MCPClient.getInstance();
    await connectWithRetry(mcp);
    const tools = await mcp.listTools();
    return NextResponse.json({
      success: true,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
```

**Verify**:

- [ ] GET /api/test-mcp returns tool list
- [ ] Should see 13 tools
- [ ] Connection retries on failure
      **Success**: MCP server connected successfully

---

## STORY-004: Core API Implementation

**Goal**: Build all workflow API endpoints
**Time Estimate**: 10-12 hours
**Dependencies**: STORY-002, STORY-003 complete

### TASK-004.1: Implement Apply Operations Route

**Time**: 2 hours
**File**: `app/api/workflow/[sessionId]/apply/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { WorkflowOperation } from "@/types/workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // 1. Validate session exists
  // 2. Parse operations from body
  // 3. Apply each operation
  // 4. Update database
  // 5. Return state update
}
```

**Verify**:

- [ ] Can apply discovery operations
- [ ] State updates in database
- [ ] Returns proper response shape
      **Success**: Operations applied atomically

### TASK-004.2: Implement State Route

**Time**: 1 hour
**File**: `app/api/workflow/[sessionId]/state/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Fetch current state from database
  // Return phase and stats
}
```

**Verify**:

- [ ] Returns current phase
- [ ] Stats are accurate
- [ ] 404 for invalid session
      **Success**: State retrieval working

### TASK-004.3: Implement Export Route

**Time**: 1 hour
**File**: `app/api/workflow/[sessionId]/export/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Build final workflow JSON
  // Include metadata
}
```

**Verify**:

- [ ] Returns valid n8n workflow JSON
- [ ] Includes all nodes and connections
      **Success**: Export generates valid workflow

### TASK-004.4: Implement Phase Manager

**Time**: 2 hours
**File**: `lib/phase-manager.ts`

```typescript
export class PhaseManager {
  // Complete implementation from design
  canTransition() {}
  checkConditions() {}
}
```

**Verify**:

- [ ] Transition rules enforced
- [ ] Conditions checked properly
- [ ] Auto-transitions work
      **Success**: Phase management working

### TASK-004.5: Implement Phase Status Route

**Time**: 1 hour
**File**: `app/api/workflow/[sessionId]/phase-status/route.ts`

```typescript
export async function GET() {
  // Return phase transition status
}
```

**Verify**:

- [ ] Shows if can progress
- [ ] Includes reason if blocked
      **Success**: Phase status endpoint working

---

## STORY-005: Claude Integration

**Goal**: Integrate Claude AI for operation generation
**Time Estimate**: 6-8 hours
**Dependencies**: STORY-003, STORY-004 complete

### TASK-005.1: Create Claude Route

**Time**: 2 hours
**File**: `app/api/claude/route.ts`

```typescript
import { Anthropic } from "@anthropic-ai/sdk";
import MCPClient from "@/lib/mcp-client";

export async function POST(request: NextRequest) {
  const { sessionId, phase, prompt, selectedNodes } = await request.json();

  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mcp = MCPClient.getInstance();

  // Phase-specific logic
  switch (phase) {
    case "discovery":
    // Implementation
    case "configuration":
    // Implementation
    // etc.
  }
}
```

**Verify**:

- [ ] Each phase returns operations
- [ ] MCP tools called correctly
- [ ] Claude responses parsed
      **Success**: Claude generates valid operations

### TASK-005.2: Create Prompt Templates

**Time**: 1 hour
**File**: `lib/claude-prompts.ts`

```typescript
export const prompts = {
  discovery: (prompt: string, searchResults: any) => `
    Given user prompt: "${prompt}"
    Search results: ${JSON.stringify(searchResults)}
    Return discovery operations as JSON array.
  `,
  configuration: (nodeType: string, purpose: string, essentials: any) => `
    Configure ${nodeType} for "${purpose}"
    Available parameters: ${JSON.stringify(essentials)}
    Return configureNode operation.
  `,
  // etc.
};
```

**Verify**:

- [ ] Prompts generate operations
- [ ] JSON parsing works
      **Success**: Claude prompts optimized

### TASK-005.3: Implement Delta Builder

**Time**: 1.5 hours
**File**: `lib/delta-builder.ts`

```typescript
export class DeltaBuilder {
  private operations: WorkflowOperation[] = [];

  discoverNode(node: { type: string; purpose: string }) {
    // Implementation
  }

  async apply(sessionId: string) {
    // Send to apply endpoint
  }
}
```

**Verify**:

- [ ] Builder accumulates operations
- [ ] Apply sends to API
- [ ] Operations clear after send
      **Success**: Delta builder pattern working

---

## STORY-006: UI Components

**Goal**: Build all UI components
**Time Estimate**: 8-10 hours
**Dependencies**: STORY-004 complete

### TASK-006.1: Create Prompt Input Component

**Time**: 1.5 hours
**File**: `app/workflow/components/prompt-input.tsx`

```typescript
// Full implementation from design
export function PromptInput({
  onSubmit,
}: {
  onSubmit: (prompt: string) => void;
}) {
  // Implementation
}
```

**Verify**:

- [ ] Textarea works
- [ ] Submit button enabled when text
- [ ] Calls onSubmit
      **Success**: Clean prompt input UI

### TASK-006.2: Create Phase Indicator

**Time**: 1.5 hours
**File**: `app/workflow/components/phase-indicator.tsx`

```typescript
// Implementation from design
export function PhaseIndicator({ currentPhase, completedPhases }) {
  // Visual progress indicator
}
```

**Verify**:

- [ ] Shows 5 phases
- [ ] Current phase highlighted
- [ ] Completed phases marked
      **Success**: Visual phase progress

### TASK-006.3: Create Clarification Dialog

**Time**: 1.5 hours
**File**: `app/workflow/components/clarification-dialog.tsx`

```typescript
// Implementation from design
export function ClarificationDialog({ question, questionId, onRespond }) {
  // Modal dialog for questions
}
```

**Verify**:

- [ ] Dialog appears
- [ ] Can input response
- [ ] Submits answer
      **Success**: Clarification flow working

### TASK-006.4: Create Loading State

**Time**: 1 hour
**File**: `app/workflow/components/loading-state.tsx`

```typescript
// Phase-specific loading messages
export function LoadingState({ phase, message }) {
  // Implementation
}
```

**Verify**:

- [ ] Shows phase message
- [ ] Animation works
      **Success**: Loading states implemented

### TASK-006.5: Create Error Display

**Time**: 1.5 hours
**File**: `app/workflow/components/error-display.tsx`

```typescript
// Implementation from design
export function ErrorDisplay({ error, onRetry, onDismiss }) {
  // Error UI with retry
}
```

**Verify**:

- [ ] Shows error message
- [ ] Retry button works
- [ ] Can dismiss
      **Success**: Error handling UI complete

### TASK-006.6: Create Workflow Result

**Time**: 1.5 hours
**File**: `app/workflow/components/workflow-result.tsx`

```typescript
// Implementation from design
export function WorkflowResult({ workflow, sessionId }) {
  // JSON display with syntax highlighting
}
```

**Verify**:

- [ ] JSON highlighted
- [ ] Copy button works
- [ ] Download works
      **Success**: Result display complete

---

## STORY-007: Main Pages Implementation

**Goal**: Build the main application pages
**Time Estimate**: 6-8 hours
**Dependencies**: STORY-006 complete

### TASK-007.1: Create Landing Page

**Time**: 1.5 hours
**File**: `app/page.tsx`

```typescript
import { PromptInput } from "./workflow/components/prompt-input";

export default function Home() {
  // Landing page with prompt input
}
```

**Verify**:

- [ ] Prompt input centered
- [ ] Creates session on submit
- [ ] Redirects to builder
      **Success**: Landing page complete

### TASK-007.2: Create Builder Page

**Time**: 3 hours
**File**: `app/workflow/[sessionId]/page.tsx`

```typescript
"use client";

export default function WorkflowBuilder({
  params,
}: {
  params: { sessionId: string };
}) {
  // Main builder interface
  // Poll for state updates
  // Show phase indicator
  // Handle clarifications
}
```

**Verify**:

- [ ] Polls for updates
- [ ] Shows current phase
- [ ] Clarifications work
      **Success**: Builder page working

### TASK-007.3: Create Result Page

**Time**: 1.5 hours
**File**: `app/workflow/[sessionId]/result/page.tsx`

```typescript
export default function WorkflowResult({
  params,
}: {
  params: { sessionId: string };
}) {
  // Fetch and display final workflow
}
```

**Verify**:

- [ ] Shows final JSON
- [ ] Download works
- [ ] Can start new workflow
      **Success**: Result page complete

### TASK-007.4: Implement Phase Monitor Hook

**Time**: 1 hour
**File**: `hooks/use-phase-monitor.ts`

```typescript
export function usePhaseMonitor(sessionId: string) {
  // Monitor phase progress
  // Auto-transition when ready
}
```

**Verify**:

- [ ] Detects phase changes
- [ ] Auto-progresses
      **Success**: Phase monitoring working

---

## STORY-008: Error Handling & Polish

**Goal**: Implement comprehensive error handling
**Time Estimate**: 4-6 hours
**Dependencies**: STORY-007 complete

### TASK-008.1: Create Global Error Handler

**Time**: 1.5 hours
**File**: `lib/error-handler.ts`

```typescript
export class WorkflowErrorHandler {
  // Implementation from design
}
```

**Verify**:

- [ ] Classifies errors correctly
- [ ] Retry strategies work
- [ ] User messages friendly
      **Success**: Error handling robust

### TASK-008.2: Add Error Boundaries

**Time**: 1 hour
**Files**: Various components

```typescript
// Add try-catch blocks
// Add error boundaries
// Test error scenarios
```

**Verify**:

- [ ] Errors don't crash app
- [ ] User sees helpful messages
      **Success**: Graceful error handling

### TASK-008.3: Implement Session Cleanup

**Time**: 1.5 hours
**File**: `app/api/cron/cleanup/route.ts`

```typescript
export async function GET(request: Request) {
  // Verify cron secret
  // Run cleanup
  // Return results
}
```

**Verify**:

- [ ] Marks old sessions inactive
- [ ] Deletes very old sessions
- [ ] Returns counts
      **Success**: Automatic cleanup working

### TASK-008.4: Add Performance Monitoring

**Time**: 1 hour

```typescript
// Add timing to operations
// Log token usage
// Monitor response times
```

**Verify**:

- [ ] Operations < 500ms
- [ ] Token usage tracked
      **Success**: Performance metrics available

---

## STORY-009: Testing & Validation

**Goal**: Comprehensive testing suite
**Time Estimate**: 6-8 hours
**Dependencies**: All other stories complete

### TASK-009.1: API Route Testing

**Time**: 2 hours

```bash
# Test each endpoint
# Document results
# Create test scripts
```

**Tests**:

- [ ] Create session
- [ ] Apply operations
- [ ] Get state
- [ ] Export workflow
- [ ] Error scenarios

### TASK-009.2: End-to-End Testing

**Time**: 3 hours

```typescript
// Full workflow creation
// From prompt to export
// Test all phases
```

**Scenarios**:

- [ ] Simple webhook → Slack
- [ ] Schedule → HTTP → Email
- [ ] Complex multi-node
- [ ] Error recovery

### TASK-009.3: Performance Testing

**Time**: 1.5 hours

```typescript
// Measure token usage
// Time operations
// Test concurrent sessions
```

**Metrics**:

- [ ] Token usage < 4KB
- [ ] Response time < 500ms
- [ ] 10 concurrent sessions

### TASK-009.4: Documentation

**Time**: 1.5 hours
**Files**: README.md, DEPLOYMENT.md

```markdown
# Setup instructions

# API documentation

# Deployment guide
```

**Deliverables**:

- [ ] README complete
- [ ] API docs
- [ ] Deployment steps

---

## Execution Plan Summary

### Sprint 1 (Week 1): Foundation

- STORY-001: Infrastructure Setup
- STORY-002: Session Management
- STORY-003: MCP Integration

### Sprint 2 (Week 2): Core Features

- STORY-004: Core API Implementation
- STORY-005: Claude Integration

### Sprint 3 (Week 3): UI & Polish

- STORY-006: UI Components
- STORY-007: Main Pages
- STORY-008: Error Handling
- STORY-009: Testing

### Critical Path

1. Infrastructure → Session Management → Core APIs
2. MCP Integration can run parallel to Session Management
3. UI Components can start after Core APIs
4. Claude Integration depends on MCP + Core APIs

### Risk Mitigation

- Test MCP connection early (TASK-003.3)
- Validate Claude responses (TASK-005.1)
- Build error handling throughout
- Keep operations atomic

### Progress Tracking

Use task IDs (e.g., TASK-001.1) to track completion. Each task has:

- Clear execution steps
- Verification criteria
- Success metrics
- Time estimates

This breakdown provides ~45 specific tasks with clear success criteria, making the entire MVP executable in approximately 3 weeks of focused development.
