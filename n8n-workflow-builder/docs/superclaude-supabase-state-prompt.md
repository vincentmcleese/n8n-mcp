# SuperClaude Supabase State Integration Prompt

## The Ultimate Command

```bash
/implement supabase-state-persistence \
  --persona-backend \
  --persona-architect \
  --seq \
  --think-hard \
  --validate \
  --wave-mode force \
  --wave-strategy systematic \
  --focus architecture \
  --scope project
```

## The Dream Prompt

```
I need to implement comprehensive Supabase state persistence for the n8n workflow builder backend. 

Current State:
- We have a working 5-phase workflow system (Discovery → Configuration → Validation → Building → Documentation)
- Delta-based operations architecture is implemented
- Sessions work in-memory but need Supabase persistence
- Backend-only implementation, testing via scripts with mock sessionIds

Requirements:
1. Persist workflow state to Supabase after EVERY operation
2. Support session recovery and resumption
3. Maintain operation history for debugging/audit
4. Enable cross-session workflow building (pause/resume)
5. Store Claude API interactions for cost tracking
6. Implement proper error recovery with state rollback

Database Schema (already exists):
- workflow_sessions table with session_id, state (JSONB), created_at, updated_at
- State includes: phase, discovered nodes, selected, configured, validated, workflow draft, operations history

Key Integration Points:
1. WorkflowOrchestrator: Add state persistence after each operation
2. SessionManager: Implement load/save/update methods
3. API Routes: Ensure all endpoints persist state changes
4. Error Handling: Rollback state on failures
5. Testing: Mock sessionIds for server-side testing

Technical Constraints:
- Maintain delta-based architecture
- Preserve operation atomicity
- Support concurrent sessions
- Handle large state objects efficiently
- Enable state migration for schema changes

Please implement this systematically, ensuring each phase properly persists its state and can be resumed from any point. Focus on reliability and error recovery.
```

## Detailed Integration Plan

### Phase 1: Core State Management
```bash
/analyze supabase-integration-points \
  --persona-architect \
  --seq \
  --think-hard \
  --focus architecture
```

Analyze all points where state needs to be persisted:
- After each operation in applyOperations
- Phase transitions
- Error states
- Clarification requests/responses



  1. Session Initialization
    - runDiscoveryPhase() - Create session in Supabase when starting
    - Add session recovery logic to check Supabase before creating new
  2. Operation Persistence
    - applyOperations() - Currently a stub, needs implementation
    - Queue operations after each state change for batched saving
  3. Phase Transitions
    - End of each phase method - Force save pending operations
    - runConfigurationPhase(), runValidationPhase(), runBuildingPhase(), runDocumentationPhase()
  4. Error Handling
    - All catch blocks - Record errors with phase context
    - Maintain error history in Supabase metadata
  5. Token Tracking
    - After Claude API calls in each phase
    - Track cumulative token usage per session
  6. Clarification Handling
    - handleClarificationResponse() - Persist clarification exchanges
    - Mark clarification operations as critical for immediate save


### Phase 2: Session Manager Implementation
```bash
/implement session-manager-class \
  --persona-backend \
  --seq \
  --validate \
  --focus reliability
```

Create a robust SessionManager:
```typescript
class SessionManager {
  // Core operations
  async createSession(sessionId: string, initialPrompt: string): Promise<WorkflowSession>
  async loadSession(sessionId: string): Promise<WorkflowSession | null>
  async updateSession(sessionId: string, operations: WorkflowOperation[]): Promise<void>
  async saveSession(session: WorkflowSession): Promise<void>
  
  // State management
  async rollbackOperation(sessionId: string, operationId: string): Promise<void>
  async getSessionHistory(sessionId: string): Promise<OperationHistory[]>
  
  // Cleanup
  async archiveSession(sessionId: string): Promise<void>
  async cleanupExpiredSessions(): Promise<number>
}
```

### Phase 3: State Persistence Integration
```bash
/implement state-persistence-hooks \
  --persona-backend \
  --persona-devops \
  --wave-mode force \
  --wave-strategy progressive \
  --validate
```

Add persistence hooks throughout:
1. WorkflowOrchestrator.applyOperations → Save after each operation
2. Phase transition methods → Persist phase changes
3. Error handlers → Save error states
4. Claude API calls → Track usage and costs

### Phase 4: Recovery & Resumption
```bash
/implement session-recovery \
  --persona-backend \
  --persona-qa \
  --seq \
  --think \
  --focus reliability
```

Implement robust recovery:
- Session resumption from any phase
- Operation replay for consistency
- State validation on load
- Conflict resolution for concurrent updates

### Phase 5: Testing Infrastructure
```bash
/implement state-testing-suite \
  --persona-qa \
  --persona-backend \
  --delegate files \
  --validate
```

Create comprehensive tests:
```typescript
// Mock session testing
describe('Supabase State Persistence', () => {
  it('should persist discovery operations')
  it('should recover from mid-configuration')
  it('should handle validation rollback')
  it('should resume documentation phase')
  it('should track Claude API costs')
})
```

## Implementation Strategy

### 1. Minimal Intrusion Approach
```typescript
// Wrap existing methods with state persistence
async applyOperations(sessionId: string, operations: WorkflowOperation[]) {
  const result = await this.existingApplyOperations(sessionId, operations);
  await this.sessionManager.updateSession(sessionId, operations);
  return result;
}
```

### 2. Event-Driven Persistence
```typescript
// Emit events for state changes
this.eventEmitter.on('operation:applied', async (data) => {
  await this.persistState(data.sessionId, data.operation);
});
```

### 3. Batch Operations
```typescript
// Batch multiple operations for efficiency
const batchedOps = new OperationBatcher();
batchedOps.add(operation);
await batchedOps.flush(); // Persists to Supabase
```

## Mock SessionId Strategy

For backend testing without frontend:

```typescript
// Test session generator
function generateTestSession(scenario: string): string {
  return `test-${scenario}-${Date.now()}`;
}

// Scenarios
const sessions = {
  simple: generateTestSession('webhook-slack'),
  complex: generateTestSession('multi-node-workflow'),
  recovery: generateTestSession('resume-from-config'),
  error: generateTestSession('validation-failure')
};
```

## Performance Considerations

### 1. State Compression
```typescript
// Compress large state objects
const compressedState = await compress(state);
await supabase.from('workflow_sessions').update({ 
  state: compressedState,
  compressed: true 
});
```

### 2. Incremental Updates
```typescript
// Only send deltas to Supabase
const stateDelta = calculateDelta(oldState, newState);
await supabase.rpc('update_session_state', { 
  session_id: sessionId,
  delta: stateDelta 
});
```

### 3. Connection Pooling
```typescript
// Reuse Supabase connections
const supabasePool = new SupabaseConnectionPool({
  maxConnections: 10,
  idleTimeout: 30000
});
```

## Error Recovery Patterns

### 1. Optimistic Updates
```typescript
// Apply locally, persist async
const localResult = this.applyLocal(operation);
this.persistAsync(operation).catch(err => {
  this.rollbackLocal(operation);
  throw err;
});
```

### 2. State Snapshots
```typescript
// Checkpoint at phase boundaries
await this.createSnapshot(sessionId, 'pre-validation');
try {
  await this.runValidation();
} catch (error) {
  await this.restoreSnapshot(sessionId, 'pre-validation');
}
```

## Migration Strategy

For existing in-memory sessions:

```typescript
// Gradual migration
if (this.useSupabase) {
  return await this.supabaseSession.load(sessionId);
} else {
  return this.inMemorySessions.get(sessionId);
}
```

## Monitoring & Observability

```typescript
// Track state operations
logger.info('State persisted', {
  sessionId,
  phase: state.phase,
  operationCount: state.operations.length,
  stateSize: JSON.stringify(state).length,
  duration: Date.now() - start
});
```

## The Complete Integration Command

```bash
# The ultimate implementation command
/spawn enterprise-state-integration \
  --wave-mode force \
  --wave-count 5 \
  --wave-strategy enterprise \
  --personas "backend,architect,qa,devops" \
  --focus "reliability,performance,scalability" \
  --validate \
  --safe-mode \
  --introspect \
  --delegate tasks \
  --concurrency 7
```

This will:
1. Wave 1: Architecture analysis and design
2. Wave 2: Core session manager implementation
3. Wave 3: Integration with existing code
4. Wave 4: Testing and validation
5. Wave 5: Performance optimization and monitoring

Each wave builds on the previous, ensuring systematic, reliable implementation of Supabase state persistence throughout the workflow builder.