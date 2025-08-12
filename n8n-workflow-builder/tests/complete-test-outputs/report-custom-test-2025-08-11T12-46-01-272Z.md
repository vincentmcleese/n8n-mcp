# n8n Workflow Builder Test Report

**Test Name:** Custom Test
**Timestamp:** 2025-08-11T12:45:43.549Z
**Duration:** 17721ms
**Success:** ❌ No

## User Prompt
```
Create workflow that stores data in PostgreSQL
```

## Session ID: `complete_e2e_custom_test_1754916343549`

## ========== DISCOVERY PHASE ==========

**Status:** ✅ Success
**Duration:** 17253ms
**Memory Delta:** 1MB

### Logs
```
2025-08-11T12:45:43.847Z [INFO] [Orchestrator] Starting discovery phase
2025-08-11T12:45:43.847Z [DEBUG] [Claude] Sending request for discovery phase
2025-08-11T12:46:01.100Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T12:46:01.100Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Data Flow
**Input:**
```json
{
  "prompt": "Create workflow that stores data in PostgreSQL"
}
```

**Output:**
```json
{
  "nodes": []
}
```

**Transformations:**
- Intent Analysis
- Node Discovery
- Selection

### Session State (Baseline)
```json
{
  "sessionId": "complete_e2e_custom_test_1754916343549",
  "createdAt": "2025-08-11T12:45:43.853Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Create workflow that stores data in PostgreSQL",
    "discovered": [],
    "selected": [],
    "configured": {},
    "validated": {},
    "workflow": {
      "nodes": [],
      "settings": {},
      "connections": {}
    },
    "buildPhases": [],
    "operationHistory": [
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-11T12:46:00.457Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== CONFIGURATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 169ms
**Memory Delta:** 0MB

### Logs
```
2025-08-11T12:46:01.101Z [INFO] [Orchestrator] Starting configuration phase
2025-08-11T12:46:01.101Z [DEBUG] [Claude] Sending request for configuration phase
2025-08-11T12:46:01.270Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T12:46:01.270Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Errors
1. **validation**: No nodes selected for configuration

### Data Flow
**Input:**
```json
{
  "discoveredNodes": []
}
```

**Output:**
```json
{
  "configuredNodes": []
}
```

**Transformations:**
- Parameter Configuration
- Validation
- Type Checking

### Session State Changes
_No changes to session state_

## ========== BUILDING PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

## ========== VALIDATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

## ========== DOCUMENTATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

## Summary

### Metrics
- **Total Nodes:** 0
- **Total Connections:** 0
- **Validation Attempts:** 0
- **Errors Fixed:** 0
- **Sticky Notes Added:** 0

### Scores
- **Performance Score:** 60/100
- **Quality Score:** 105/100
- **Completeness Score:** 20/100

### Error Patterns
- **validation** (1 occurrences)
  - Suggested Fix: Review error details and adjust workflow accordingly

### Optimization Suggestions
- Consider optimizing discovery phase (took 17253ms)
