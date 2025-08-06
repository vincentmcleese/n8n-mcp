# Supabase State Integration Guide

## Overview

This guide explains how to integrate Supabase state persistence into the n8n Workflow Builder backend. The implementation follows a **non-intrusive hook pattern** that preserves the existing in-memory functionality while adding persistent state storage.

## Architecture

### Key Components

1. **SessionManager** (`lib/services/session-manager.ts`)
   - Handles all Supabase CRUD operations
   - Converts between WorkflowSession and Supabase formats
   - Provides atomic operation updates
   - Manages session lifecycle (create, update, archive)

2. **WorkflowOrchestratorHooks** (`lib/workflow-orchestrator-hooks.ts`)
   - Non-intrusive integration layer
   - Can be enabled/disabled via environment variable
   - Graceful fallback to in-memory on errors
   - Tracks tokens, errors, and metadata

3. **Existing WorkflowOrchestrator**
   - Minimal modifications needed
   - Add hook calls at key points
   - Preserve all existing functionality

## Integration Points

### 1. Session Creation

```typescript
// In WorkflowOrchestrator.runDiscoveryPhase()
async runDiscoveryPhase(sessionId: string, prompt: string) {
  // Initialize Supabase session
  await orchestratorHooks.initializeSession(sessionId, prompt);
  
  // Continue with existing logic...
}
```

### 2. After Applying Operations

```typescript
// In WorkflowOrchestrator.applyOperations()
const result = await this.applyOperationsToState(session, operations);

// Persist to Supabase
await orchestratorHooks.persistOperations(sessionId, operations);

return result;
```

### 3. Session Loading

```typescript
// In any method that loads a session
let session = this.sessions.get(sessionId);

// Try loading from Supabase if not in memory
if (!session && orchestratorHooks.isEnabled()) {
  const supabaseSession = await orchestratorHooks.loadSession(sessionId);
  if (supabaseSession) {
    session = supabaseSession;
    this.sessions.set(sessionId, session);
  }
}
```

### 4. Error Handling

```typescript
// In catch blocks
catch (error) {
  await orchestratorHooks.recordError(sessionId, error, 'discovery');
  throw error;
}
```

### 5. Token Tracking

```typescript
// After Claude API calls
const tokensUsed = response.usage?.total_tokens || 0;
await orchestratorHooks.updateTokenUsage(sessionId, tokensUsed);
```

## Database Schema

The existing Supabase table structure:

```sql
CREATE TABLE workflow_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  initial_prompt TEXT,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_session_id ON workflow_sessions(session_id);
CREATE INDEX idx_updated_at ON workflow_sessions(updated_at);
CREATE INDEX idx_archived ON workflow_sessions(archived);
```

## State Structure

The JSONB state field contains:

```typescript
{
  phase: WorkflowPhase,
  userPrompt: string,
  discovered: DiscoveredNode[],
  selected: string[],
  configured: Record<string, NodeConfiguration>,
  validated: Record<string, ValidationResult>,
  workflow: {
    nodes: any[],
    connections: any,
    settings: any
  },
  operationHistory: WorkflowOperation[],
  pendingClarifications: ClarificationRequest[],
  clarificationHistory: ClarificationResponse[],
  metadata: {
    claudeTokensUsed: number,
    operationCount: number,
    lastError: any
  }
}
```

## Usage Patterns

### Enable Supabase State

```bash
# In .env.local
USE_SUPABASE_STATE=true
```

### Testing with Mock Sessions

```typescript
// Generate test session IDs
const sessionId = `test-${feature}-${Date.now()}`;

// Examples:
const webhookTest = `test-webhook-slack-${Date.now()}`;
const complexTest = `test-multi-node-${Date.now()}`;
const resumeTest = `test-resume-config-${Date.now()}`;
```

### Session Recovery Pattern

```typescript
// Check if session exists in Supabase
const existingSession = await sessionManager.loadSession(sessionId);

if (existingSession) {
  // Resume from saved state
  console.log(`Resuming session from phase: ${existingSession.state.phase}`);
  
  // Reconstruct the appropriate result object based on phase
  switch (existingSession.state.phase) {
    case 'configuration':
      // Reconstruct discovery result from state
      break;
    case 'validation':
      // Reconstruct configuration result from state
      break;
    // etc...
  }
}
```

## Performance Considerations

### 1. Hybrid Batching Approach

The system uses intelligent batching to reduce database writes by ~70%:

```typescript
// Operations are queued and saved at these triggers:
1. Phase transitions (setPhase, completePhase)
2. Critical operations (clarifications, workflow changes)  
3. Batch size limit (10 operations)
4. Time-based auto-save (every 30 seconds)
5. Manual force save (phase completion)
```

**Save Pattern**:
- Discovery phase: ~1-2 saves (phase transition + critical ops)
- Configuration phase: ~1-2 saves (phase transition + complete configs)
- Validation phase: ~1 save (phase transition)
- Building phase: ~1 save (phase transition)
- Documentation phase: ~1 save (phase transition)
- **Total: ~5-8 saves per workflow** (vs 20-30 with per-operation saves)

### 2. Batching Benefits

```typescript
// Automatic batching
await sessionManager.queueOperation(sessionId, operation);
// Saves when conditions are met

// Force save at critical points
await orchestratorHooks.forceSave(sessionId);
// Ensures all pending operations are persisted
```

### 3. Resource Management

The SessionManager handles:
- Automatic cleanup of timers and pending operations
- Memory-efficient operation queuing
- Graceful handling of save failures (operations remain queued)

## Error Recovery

The system is designed for resilience:

1. **Graceful Degradation**: Falls back to in-memory if Supabase fails
2. **No Blocking**: Persistence errors don't stop workflow execution
3. **Error Tracking**: Errors are logged and stored in metadata
4. **Session Recovery**: Can resume from any saved state

## Testing

### Unit Tests

```bash
# Test SessionManager
npm run test lib/services/session-manager.test.ts

# Test hooks integration
npm run test lib/workflow-orchestrator-hooks.test.ts
```

### Integration Tests

```bash
# Test basic state persistence
npx tsx scripts/test-supabase-state.ts

# Test full workflow with persistence
npx tsx scripts/test-full-supabase-flow.ts

# Test with real workflow
USE_SUPABASE_STATE=true npm run test:buildworkflow -- "your prompt"
```

## Migration from In-Memory

The system supports gradual migration:

1. **Phase 1**: Enable Supabase for new sessions only
2. **Phase 2**: Migrate active sessions on next access
3. **Phase 3**: Archive and remove in-memory storage

## Monitoring

Track these metrics:

- Session creation rate
- Average session duration
- Operations per session
- Claude token usage
- Error rates by phase
- Database query performance

## Security Considerations

1. **Session IDs**: Use UUIDs or cryptographically secure random IDs
2. **User Isolation**: Add user_id field for multi-tenant scenarios
3. **Data Encryption**: Consider encrypting sensitive workflow data
4. **Access Control**: Implement RLS policies in Supabase
5. **Audit Trail**: Operation history provides audit capabilities

## Next Steps

1. **Frontend Integration**
   - Pass real session IDs from UI
   - Implement session resume UI
   - Show operation history

2. **Advanced Features**
   - Session branching/forking
   - Collaborative workflows
   - Version control for workflows
   - Template library from sessions

3. **Optimization**
   - Implement state compression
   - Add caching layer
   - Optimize query patterns
   - Background archival job