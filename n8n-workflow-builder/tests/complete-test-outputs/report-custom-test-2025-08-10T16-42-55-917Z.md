# n8n Workflow Builder Test Report

**Test Name:** Custom Test
**Timestamp:** 2025-08-10T16:42:38.133Z
**Duration:** 17783ms
**Success:** ❌ No

## User Prompt
```
Create webhook to Slack workflow
```

## Session ID: `complete_e2e_custom_test_1754844158133`

## ========== DISCOVERY PHASE ==========

**Status:** ✅ Success
**Duration:** 9423ms
**Memory Delta:** 6MB

### Logs
```
2025-08-10T16:42:38.694Z [INFO] [Orchestrator] Starting discovery phase
2025-08-10T16:42:38.694Z [DEBUG] [Claude] Sending request for discovery phase
2025-08-10T16:42:47.030Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-10T16:42:47.030Z [DEBUG] [MCP] Parameters: {"task":"receive_webhook"}
2025-08-10T16:42:47.031Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-10T16:42:47.031Z [DEBUG] [MCP] Parameters: {"task":"send_slack_message"}
2025-08-10T16:42:47.236Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-10T16:42:47.240Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-10T16:42:47.992Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-10T16:42:47.992Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-10T16:42:48.116Z [DEBUG] [Orchestrator] Session state updated
2025-08-10T16:42:48.117Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.webhook** (ID: node_1)
  - Purpose: Set up a webhook to receive data from external services
- **nodes-base.slack** (ID: node_2)
  - Purpose: Send a message to Slack channel

### Data Flow
**Input:**
```json
{
  "prompt": "Create webhook to Slack workflow"
}
```

**Output:**
```json
{
  "nodes": [
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
    },
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
    }
  ]
}
```

**Transformations:**
- Intent Analysis
- Node Discovery
- Selection

### Session State
```json
{
  "sessionId": "complete_e2e_custom_test_1754844158133",
  "createdAt": "2025-08-10T16:42:38.717Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Create webhook to Slack workflow",
    "discovered": [
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
      },
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
      }
    ],
    "selected": [
      "node_1",
      "node_2"
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
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_1",
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
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
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_2",
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-10T16:42:47.242Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== CONFIGURATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 7799ms
**Memory Delta:** -5MB

### Logs
```
2025-08-10T16:42:48.117Z [INFO] [Orchestrator] Starting configuration phase
2025-08-10T16:42:48.117Z [DEBUG] [Claude] Sending request for configuration phase
2025-08-10T16:42:54.148Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T16:42:54.148Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.webhook","config":{"path":"webhook","httpMethod":"POST","responseData":"allEntries","responseMode":"lastNode"},"profile":"ai-friendly"}
2025-08-10T16:42:54.429Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T16:42:54.439Z [INFO] [MCP] Calling tool: validate_node_operation
2025-08-10T16:42:54.439Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"New webhook notification: {{$json.message || 'Webhook received'}}","channel":"#general","resource":"message","operation":"post"},"profile":"ai-friendly"}
2025-08-10T16:42:54.584Z [DEBUG] [MCP] Tool validate_node_operation completed successfully
2025-08-10T16:42:55.814Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-10T16:42:55.814Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-10T16:42:55.916Z [DEBUG] [Orchestrator] Session state updated
2025-08-10T16:42:55.916Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.webhook** (ID: node_1)
  - Purpose: Set up a webhook to receive data from external services
  - Validation: valid
- **nodes-base.slack** (ID: node_2)
  - Purpose: Send a message to Slack channel
  - Validation: invalid

### Errors
1. **validation**: 1 nodes failed validation

### Data Flow
**Input:**
```json
{
  "discoveredNodes": [
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
    },
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
    }
  ]
}
```

**Output:**
```json
{
  "configuredNodes": [
    {
      "id": "node_1",
      "type": "nodes-base.webhook",
      "purpose": "Set up a webhook to receive data from external services",
      "config": {
        "onError": "continueRegularOutput",
        "alwaysOutputData": true,
        "typeVersion": 1,
        "notes": "Webhook endpoint to receive data from external services and forward to Slack workflow",
        "parameters": {
          "path": "webhook",
          "httpMethod": "POST",
          "responseData": "allEntries",
          "responseMode": "lastNode"
        }
      },
      "validated": true
    },
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
        "notes": "Send message to Slack channel when webhook is triggered",
        "parameters": {
          "text": "New webhook notification: {{$json.message || 'Webhook received'}}",
          "channel": "#general",
          "resource": "message",
          "operation": "post"
        }
      },
      "validated": false,
      "validationErrors": []
    }
  ]
}
```

**Transformations:**
- Parameter Configuration
- Validation
- Type Checking

### Session State
```json
{
  "sessionId": "complete_e2e_custom_test_1754844158133",
  "createdAt": "2025-08-10T16:42:38.717Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Create webhook to Slack workflow",
    "discovered": [
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
      },
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
      }
    ],
    "selected": [
      "node_1",
      "node_2"
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
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_1",
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
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
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "selectNode",
        "nodeId": "node_2",
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-10T16:42:47.242Z"
      },
      {
        "type": "setPhase",
        "phase": "configuration",
        "timestamp": "2025-08-10T16:42:54.585Z"
      },
      {
        "type": "configureNode",
        "config": {
          "notes": "Webhook endpoint to receive data from external services and forward to Slack workflow",
          "onError": "continueRegularOutput",
          "parameters": {
            "path": "webhook",
            "httpMethod": "POST",
            "responseData": "allEntries",
            "responseMode": "lastNode"
          },
          "typeVersion": 1,
          "alwaysOutputData": true
        },
        "nodeId": "node_1",
        "purpose": "Set up a webhook to receive data from external services",
        "nodeType": "nodes-base.webhook",
        "reasoning": "The template configuration is already well-suited for a webhook to Slack workflow",
        "timestamp": "2025-08-10T16:42:54.868Z",
        "operationIndex": 0,
        "customizedFromTemplate": true
      },
      {
        "type": "validateNode",
        "nodeId": "node_1",
        "result": {
          "valid": true,
          "errors": []
        },
        "timestamp": "2025-08-10T16:42:55.259Z"
      },
      {
        "type": "configureNode",
        "config": {
          "notes": "Send message to Slack channel when webhook is triggered",
          "onError": "continueRegularOutput",
          "maxTries": 2,
          "parameters": {
            "text": "New webhook notification: {{$json.message || 'Webhook received'}}",
            "channel": "#general",
            "resource": "message",
            "operation": "post"
          },
          "retryOnFail": true,
          "typeVersion": 3,
          "waitBetweenTries": 2000
        },
        "nodeId": "node_2",
        "purpose": "Send a message to Slack channel",
        "nodeType": "nodes-base.slack",
        "reasoning": "Customized the template for webhook-to-Slack workflow by setting a dynamic message text that uses webhook payload data",
        "timestamp": "2025-08-10T16:42:55.259Z",
        "operationIndex": 0,
        "customizedFromTemplate": true
      },
      {
        "type": "validateNode",
        "nodeId": "node_2",
        "result": {
          "valid": false,
          "errors": []
        },
        "timestamp": "2025-08-10T16:42:55.585Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== BUILDING PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

### Data Flow
**Input:**
```json
null
```

**Output:**
```json
null
```

### Session State
```json
{}
```

## ========== VALIDATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

### Data Flow
**Input:**
```json
null
```

**Output:**
```json
null
```

### Session State
```json
{}
```

## ========== DOCUMENTATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 0ms

### Logs
```
```

### Data Flow
**Input:**
```json
null
```

**Output:**
```json
null
```

### Session State
```json
{}
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
