# n8n Workflow Builder Test Report

**Test Name:** Custom Test
**Timestamp:** 2025-08-10T17:57:06.030Z
**Duration:** 16163ms
**Success:** ❌ No

## User Prompt
```
Create a simple webhook that sends data to Slack
```

## Session ID: `complete_e2e_custom_test_1754848626030`

## ========== DISCOVERY PHASE ==========

**Status:** ✅ Success
**Duration:** 7898ms
**Memory Delta:** 6MB

### Logs
```
2025-08-10T17:57:06.542Z [INFO] [Orchestrator] Starting discovery phase
2025-08-10T17:57:06.542Z [DEBUG] [Claude] Sending request for discovery phase
2025-08-10T17:57:13.493Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-10T17:57:13.493Z [DEBUG] [MCP] Parameters: {"task":"receive_webhook"}
2025-08-10T17:57:13.495Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-10T17:57:13.495Z [DEBUG] [MCP] Parameters: {"task":"send_slack_message"}
2025-08-10T17:57:13.721Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-10T17:57:13.724Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-10T17:57:14.354Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-10T17:57:14.358Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-10T17:57:14.440Z [DEBUG] [Orchestrator] Session state updated
2025-08-10T17:57:14.440Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.slack** (ID: node_2)
  - Purpose: Send a message to Slack channel
- **nodes-base.webhook** (ID: node_1)
  - Purpose: Set up a webhook to receive data from external services

### Data Flow
**Input:**
```json
{
  "prompt": "Create a simple webhook that sends data to Slack"
}
```

**Output:**
```json
{
  "nodes": [
    {
      "id": "node_2",
      "type": "nodes-base.slack",
      "displayName": "send slack message",
      "purpose": "Send a message to Slack channel",
      "isPreConfigured": true,
      "config": {
        "resource": "message",
        "operation": "post",
        "channel": "",
        "text": "",
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 2,
        "waitBetweenTries": 2000
      }
    },
    {
      "id": "node_1",
      "type": "nodes-base.webhook",
      "displayName": "receive webhook",
      "purpose": "Set up a webhook to receive data from external services",
      "isPreConfigured": true,
      "config": {
        "httpMethod": "POST",
        "path": "webhook",
        "responseMode": "lastNode",
        "responseData": "allEntries",
        "onError": "continueRegularOutput",
        "alwaysOutputData": true
      }
    }
  ]
}
```

**Transformations:**
- Intent Analysis
- Node Discovery
- Selection

### Session State (Baseline)
```json
{
  "sessionId": "complete_e2e_custom_test_1754848626030",
  "createdAt": "2025-08-10T17:57:06.514Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Create a simple webhook that sends data to Slack",
    "discovered": [
      {
        "id": "node_2",
        "type": "nodes-base.slack",
        "config": {
          "text": "",
          "channel": "",
          "onError": "continueRegularOutput",
          "maxTries": 2,
          "resource": "message",
          "operation": "post",
          "retryOnFail": true,
          "waitBetweenTries": 2000
        },
        "purpose": "Send a message to Slack channel",
        "displayName": "send slack message",
        "isPreConfigured": true
      },
      {
        "id": "node_1",
        "type": "nodes-base.webhook",
        "config": {
          "path": "webhook",
          "onError": "continueRegularOutput",
          "httpMethod": "POST",
          "responseData": "allEntries",
          "responseMode": "lastNode",
          "alwaysOutputData": true
        },
        "purpose": "Set up a webhook to receive data from external services",
        "displayName": "receive webhook",
        "isPreConfigured": true
      }
    ],
    "selected": [
      "node_2",
      "node_1"
    ],
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
        "node": {
          "id": "node_2",
          "type": "nodes-base.slack",
          "config": {
            "text": "",
            "channel": "",
            "onError": "continueRegularOutput",
            "maxTries": 2,
            "resource": "message",
            "operation": "post",
            "retryOnFail": true,
            "waitBetweenTries": 2000
          },
          "purpose": "Send a message to Slack channel",
          "displayName": "send slack message",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-10T17:57:13.726Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_2",
        "timestamp": "2025-08-10T17:57:13.726Z"
      },
      {
        "node": {
          "id": "node_1",
          "type": "nodes-base.webhook",
          "config": {
            "path": "webhook",
            "onError": "continueRegularOutput",
            "httpMethod": "POST",
            "responseData": "allEntries",
            "responseMode": "lastNode",
            "alwaysOutputData": true
          },
          "purpose": "Set up a webhook to receive data from external services",
          "displayName": "receive webhook",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-10T17:57:13.726Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_1",
        "timestamp": "2025-08-10T17:57:13.726Z"
      },
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-10T17:57:13.726Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== CONFIGURATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 7753ms
**Memory Delta:** -8MB

### Logs
```
2025-08-10T17:57:14.440Z [INFO] [Orchestrator] Starting configuration phase
2025-08-10T17:57:14.440Z [DEBUG] [Claude] Sending request for configuration phase
2025-08-10T17:57:19.652Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T17:57:19.652Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.webhook","config":{"path":"slack-webhook","httpMethod":"POST","responseData":"allEntries","responseMode":"lastNode"},"profile":"ai-friendly"}
2025-08-10T17:57:19.914Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T17:57:20.579Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T17:57:20.579Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"New webhook data received: {{$json}}","channel":"#general","resource":"message","operation":"post"},"profile":"ai-friendly"}
2025-08-10T17:57:20.728Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T17:57:20.728Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T17:57:20.728Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"New webhook data received: {{$json}}","channel":"#general","resource":"message","operation":"post"},"profile":"ai-friendly"}
2025-08-10T17:57:20.910Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T17:57:20.910Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T17:57:20.910Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"New webhook data received: {{$json}}","channel":"#general","resource":"message","operation":"post"},"profile":"ai-friendly"}
2025-08-10T17:57:21.032Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T17:57:21.032Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T17:57:21.032Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"New webhook data received: {{$json}}","channel":"#general","resource":"message","operation":"post"},"profile":"ai-friendly"}
2025-08-10T17:57:21.164Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T17:57:22.038Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-10T17:57:22.038Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-10T17:57:22.192Z [DEBUG] [Orchestrator] Session state updated
2025-08-10T17:57:22.193Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.slack** (ID: node_2)
  - Purpose: Send a message to Slack channel
  - Validation: invalid
- **nodes-base.webhook** (ID: node_1)
  - Purpose: Set up a webhook to receive data from external services
  - Validation: valid

### Errors
1. **validation**: 1 nodes failed validation

### Data Flow
**Input:**
```json
{
  "discoveredNodes": [
    {
      "id": "node_2",
      "type": "nodes-base.slack",
      "displayName": "send slack message",
      "purpose": "Send a message to Slack channel",
      "isPreConfigured": true,
      "config": {
        "resource": "message",
        "operation": "post",
        "channel": "",
        "text": "",
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 2,
        "waitBetweenTries": 2000
      }
    },
    {
      "id": "node_1",
      "type": "nodes-base.webhook",
      "displayName": "receive webhook",
      "purpose": "Set up a webhook to receive data from external services",
      "isPreConfigured": true,
      "config": {
        "httpMethod": "POST",
        "path": "webhook",
        "responseMode": "lastNode",
        "responseData": "allEntries",
        "onError": "continueRegularOutput",
        "alwaysOutputData": true
      }
    }
  ]
}
```

**Output:**
```json
{
  "configuredNodes": [
    {
      "id": "node_2",
      "type": "nodes-base.slack",
      "purpose": "Send a message to Slack channel",
      "config": {
        "onError": "continueRegularOutput",
        "maxTries": 2,
        "retryOnFail": true,
        "waitBetweenTries": 2000,
        "typeVersion": 3,
        "notes": "Send webhook data to Slack channel - customized for webhook integration",
        "parameters": {
          "text": "New webhook data received: {{$json}}",
          "channel": "#general",
          "resource": "message",
          "operation": "post"
        }
      },
      "validated": false,
      "validationErrors": []
    },
    {
      "id": "node_1",
      "type": "nodes-base.webhook",
      "purpose": "Set up a webhook to receive data from external services",
      "config": {
        "onError": "continueRegularOutput",
        "alwaysOutputData": true,
        "typeVersion": 1,
        "notes": "Webhook endpoint to receive data from external services and forward to Slack",
        "parameters": {
          "path": "slack-webhook",
          "httpMethod": "POST",
          "responseData": "allEntries",
          "responseMode": "lastNode"
        }
      },
      "validated": true
    }
  ]
}
```

**Transformations:**
- Parameter Configuration
- Validation
- Type Checking

### Session State Changes
**Changed from discovery phase:**

**Modified:**
- `state`: {11 fields} → {11 fields}

**Unchanged (2 fields):** sessionId, createdAt

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
