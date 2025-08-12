# n8n Workflow Builder Test Report

**Test Name:** Custom Test
**Timestamp:** 2025-08-11T10:02:35.994Z
**Duration:** 44667ms
**Success:** ❌ No

## User Prompt
```
Create a workflow that receives support tickets via webhook, uses AI to categorize them (technical, billing, general), and routes them to different Slack channels based on the category using a switch node
```

## Session ID: `complete_e2e_custom_test_1754906555994`

## ========== DISCOVERY PHASE ==========

**Status:** ✅ Success
**Duration:** 18244ms
**Memory Delta:** 1MB

### Logs
```
2025-08-11T10:02:36.824Z [INFO] [Orchestrator] Starting discovery phase
2025-08-11T10:02:36.825Z [DEBUG] [Claude] Sending request for discovery phase
2025-08-11T10:02:48.813Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T10:02:48.814Z [DEBUG] [MCP] Parameters: {"task":"receive_webhook"}
2025-08-11T10:02:48.814Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T10:02:48.814Z [DEBUG] [MCP] Parameters: {"task":"chat_with_ai"}
2025-08-11T10:02:48.814Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T10:02:48.814Z [DEBUG] [MCP] Parameters: {"task":"send_slack_message"}
2025-08-11T10:02:48.963Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T10:02:48.966Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T10:02:48.981Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T10:02:48.982Z [INFO] [MCP] Calling tool: search_nodes
2025-08-11T10:02:48.982Z [DEBUG] [MCP] Parameters: {"query":"switch","limit":20}
2025-08-11T10:02:49.210Z [DEBUG] [MCP] Tool search_nodes completed successfully
2025-08-11T10:02:54.990Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-11T10:02:54.990Z [INFO] [Tools] Added node: nodes-base.openAi (Send a message to an AI model and get response)
2025-08-11T10:02:54.990Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-11T10:02:54.990Z [INFO] [Tools] Added node: nodes-base.switch (Route support tickets to different Slack channels based on AI categorization (technical, billing, general))
2025-08-11T10:02:55.067Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T10:02:55.067Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.slack** (ID: task_node_3)
  - Purpose: Send a message to Slack channel
- **nodes-base.openAi** (ID: task_node_2)
  - Purpose: Send a message to an AI model and get response
- **nodes-base.webhook** (ID: task_node_1)
  - Purpose: Set up a webhook to receive data from external services
- **nodes-base.switch** (ID: search_node_1)
  - Purpose: Route support tickets to different Slack channels based on AI categorization (technical, billing, general)

### Data Flow
**Input:**
```json
{
  "prompt": "Create a workflow that receives support tickets via webhook, uses AI to categorize them (technical, billing, general), and routes them to different Slack channels based on the category using a switch node"
}
```

**Output:**
```json
{
  "nodes": [
    {
      "id": "task_node_3",
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
        "waitBetweenTries": 2000,
        "parameters": {}
      }
    },
    {
      "id": "task_node_2",
      "type": "nodes-base.openAi",
      "displayName": "chat with ai",
      "purpose": "Send a message to an AI model and get response",
      "isPreConfigured": true,
      "config": {
        "resource": "chat",
        "operation": "message",
        "modelId": "gpt-3.5-turbo",
        "messages": {
          "values": [
            {
              "role": "user",
              "content": ""
            }
          ]
        },
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 3,
        "waitBetweenTries": 5000,
        "alwaysOutputData": true
      }
    },
    {
      "id": "task_node_1",
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
      "id": "search_node_1",
      "type": "nodes-base.switch",
      "displayName": "nodes-base.switch",
      "purpose": "Route support tickets to different Slack channels based on AI categorization (technical, billing, general)",
      "needsConfiguration": true
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
  "sessionId": "complete_e2e_custom_test_1754906555994",
  "createdAt": "2025-08-11T10:02:36.594Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Create a workflow that receives support tickets via webhook, uses AI to categorize them (technical, billing, general), and routes them to different Slack channels based on the category using a switch node",
    "discovered": [
      {
        "id": "task_node_3",
        "type": "nodes-base.slack",
        "config": {
          "text": "",
          "channel": "",
          "onError": "continueRegularOutput",
          "maxTries": 2,
          "resource": "message",
          "operation": "post",
          "parameters": {},
          "retryOnFail": true,
          "waitBetweenTries": 2000
        },
        "purpose": "Send a message to Slack channel",
        "displayName": "send slack message",
        "isPreConfigured": true
      },
      {
        "id": "task_node_2",
        "type": "nodes-base.openAi",
        "config": {
          "modelId": "gpt-3.5-turbo",
          "onError": "continueRegularOutput",
          "maxTries": 3,
          "messages": {
            "values": [
              {
                "role": "user",
                "content": ""
              }
            ]
          },
          "resource": "chat",
          "operation": "message",
          "retryOnFail": true,
          "alwaysOutputData": true,
          "waitBetweenTries": 5000
        },
        "purpose": "Send a message to an AI model and get response",
        "displayName": "chat with ai",
        "isPreConfigured": true
      },
      {
        "id": "task_node_1",
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
        "id": "search_node_1",
        "type": "nodes-base.switch",
        "purpose": "Route support tickets to different Slack channels based on AI categorization (technical, billing, general)"
      }
    ],
    "selected": [
      "task_node_3",
      "task_node_2",
      "task_node_1",
      "search_node_1"
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
          "id": "task_node_3",
          "type": "nodes-base.slack",
          "config": {
            "text": "",
            "channel": "",
            "onError": "continueRegularOutput",
            "maxTries": 2,
            "resource": "message",
            "operation": "post",
            "parameters": {},
            "retryOnFail": true,
            "waitBetweenTries": 2000
          },
          "purpose": "Send a message to Slack channel",
          "displayName": "send slack message",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_3",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "node": {
          "id": "task_node_2",
          "type": "nodes-base.openAi",
          "config": {
            "modelId": "gpt-3.5-turbo",
            "onError": "continueRegularOutput",
            "maxTries": 3,
            "messages": {
              "values": [
                {
                  "role": "user",
                  "content": ""
                }
              ]
            },
            "resource": "chat",
            "operation": "message",
            "retryOnFail": true,
            "alwaysOutputData": true,
            "waitBetweenTries": 5000
          },
          "purpose": "Send a message to an AI model and get response",
          "displayName": "chat with ai",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_2",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "node": {
          "id": "task_node_1",
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
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_1",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "node": {
          "id": "search_node_1",
          "type": "nodes-base.switch",
          "purpose": "Route support tickets to different Slack channels based on AI categorization (technical, billing, general)"
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "type": "selectNode",
        "nodeId": "search_node_1",
        "timestamp": "2025-08-11T10:02:54.461Z"
      },
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-11T10:02:54.461Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== CONFIGURATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 25593ms
**Memory Delta:** 1MB

### Logs
```
2025-08-11T10:02:55.068Z [INFO] [Orchestrator] Starting configuration phase
2025-08-11T10:02:55.068Z [DEBUG] [Claude] Sending request for configuration phase
2025-08-11T10:03:01.946Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T10:03:01.946Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.webhook","config":{"path":"support-tickets","httpMethod":"POST","responseData":"allEntries","responseMode":"lastNode"}}
2025-08-11T10:03:02.119Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T10:03:02.120Z [INFO] [MCP] Calling tool: get_node_essentials
2025-08-11T10:03:02.120Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.switch"}
2025-08-11T10:03:02.277Z [DEBUG] [MCP] Tool get_node_essentials completed successfully
2025-08-11T10:03:02.607Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T10:03:02.607Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.openAi","config":{"modelId":"gpt-3.5-turbo","messages":{"values":[{"role":"system","content":"You are a support ticket categorization assistant. Analyze the incoming support ticket and categorize it into exactly one of these categories: technical, billing, or general. Respond with only the category name in lowercase."},{"role":"user","content":"Please categorize this support ticket:\n\nSubject: {{$json.subject}}\nMessage: {{$json.message}}\nCustomer: {{$json.customer_email}}"}]},"resource":"chat","operation":"message"}}
2025-08-11T10:03:02.735Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T10:03:03.155Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T10:03:03.155Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.slack","config":{"text":"🎫 **New Support Ticket**\n\n**Category:** {{$json.category}}\n**Subject:** {{$json.subject}}\n**From:** {{$json.email}}\n**Priority:** {{$json.priority || 'Normal'}}\n\n**Description:**\n{{$json.description}}\n\n**Ticket ID:** {{$json.ticketId}}\n**Created:** {{$json.createdAt}}","resource":"message","operation":"post","parameters":{},"channelId":"{{$json.slackChannel}}","select":"channel"}}
2025-08-11T10:03:03.274Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T10:03:13.055Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T10:03:13.055Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.switch","config":{"typeVersion":3.2,"notes":"Routes support tickets to different Slack channels based on AI categorization (technical, billing, general)","parameters":{"mode":"rules","rules":{"values":[{"conditions":{"options":{"caseSensitive":true,"leftValue":"","typeValidation":"strict"},"conditions":[{"leftValue":"={{ $json.category }}","rightValue":"technical","operator":{"operation":"equals","type":"string"}}]},"renameOutput":true,"outputKey":"technical"},{"conditions":{"options":{"caseSensitive":true,"leftValue":"","typeValidation":"strict"},"conditions":[{"leftValue":"={{ $json.category }}","rightValue":"billing","operator":{"operation":"equals","type":"string"}}]},"renameOutput":true,"outputKey":"billing"},{"conditions":{"options":{"caseSensitive":true,"leftValue":"","typeValidation":"strict"},"conditions":[{"leftValue":"={{ $json.category }}","rightValue":"general","operator":{"operation":"equals","type":"string"}}]},"renameOutput":true,"outputKey":"general"}]}}}}
2025-08-11T10:03:13.213Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T10:03:20.599Z [INFO] [Tools] Added node: nodes-base.slack (Send a message to Slack channel)
2025-08-11T10:03:20.599Z [INFO] [Tools] Added node: nodes-base.openAi (Send a message to an AI model and get response)
2025-08-11T10:03:20.599Z [INFO] [Tools] Added node: nodes-base.webhook (Set up a webhook to receive data from external services)
2025-08-11T10:03:20.599Z [INFO] [Tools] Added node: nodes-base.switch (Route support tickets to different Slack channels based on AI categorization (technical, billing, general))
2025-08-11T10:03:20.599Z [WARN] [Orchestrator] Node search_node_1: Failed to generate configuration for nodes-base.switch
2025-08-11T10:03:20.661Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T10:03:20.661Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.slack** (ID: task_node_3)
  - Purpose: Send a message to Slack channel
  - Validation: valid
- **nodes-base.openAi** (ID: task_node_2)
  - Purpose: Send a message to an AI model and get response
  - Validation: valid
- **nodes-base.webhook** (ID: task_node_1)
  - Purpose: Set up a webhook to receive data from external services
  - Validation: valid
- **nodes-base.switch** (ID: search_node_1)
  - Purpose: Route support tickets to different Slack channels based on AI categorization (technical, billing, general)
  - Validation: invalid
  - Errors: Failed to generate configuration for nodes-base.switch

### Errors
1. **validation**: 1 nodes failed validation

### Warnings
1. Node search_node_1: Failed to generate configuration for nodes-base.switch

### Data Flow
**Input:**
```json
{
  "discoveredNodes": [
    {
      "id": "task_node_3",
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
        "waitBetweenTries": 2000,
        "parameters": {}
      }
    },
    {
      "id": "task_node_2",
      "type": "nodes-base.openAi",
      "displayName": "chat with ai",
      "purpose": "Send a message to an AI model and get response",
      "isPreConfigured": true,
      "config": {
        "resource": "chat",
        "operation": "message",
        "modelId": "gpt-3.5-turbo",
        "messages": {
          "values": [
            {
              "role": "user",
              "content": ""
            }
          ]
        },
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 3,
        "waitBetweenTries": 5000,
        "alwaysOutputData": true
      }
    },
    {
      "id": "task_node_1",
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
      "id": "search_node_1",
      "type": "nodes-base.switch",
      "displayName": "nodes-base.switch",
      "purpose": "Route support tickets to different Slack channels based on AI categorization (technical, billing, general)",
      "needsConfiguration": true
    }
  ]
}
```

**Output:**
```json
{
  "configuredNodes": [
    {
      "id": "task_node_3",
      "type": "nodes-base.slack",
      "purpose": "Send a message to Slack channel",
      "config": {
        "onError": "continueRegularOutput",
        "maxTries": 2,
        "retryOnFail": true,
        "waitBetweenTries": 2000,
        "typeVersion": 1,
        "notes": "Send categorized support ticket to appropriate Slack channel based on AI categorization (technical, billing, or general)",
        "parameters": {
          "text": "🎫 **New Support Ticket**\n\n**Category:** {{$json.category}}\n**Subject:** {{$json.subject}}\n**From:** {{$json.email}}\n**Priority:** {{$json.priority || 'Normal'}}\n\n**Description:**\n{{$json.description}}\n\n**Ticket ID:** {{$json.ticketId}}\n**Created:** {{$json.createdAt}}",
          "resource": "message",
          "operation": "post",
          "parameters": {},
          "channelId": "{{$json.slackChannel}}",
          "select": "channel"
        }
      },
      "validated": true
    },
    {
      "id": "task_node_2",
      "type": "nodes-base.openAi",
      "purpose": "Send a message to an AI model and get response",
      "config": {
        "onError": "continueRegularOutput",
        "maxTries": 3,
        "retryOnFail": true,
        "alwaysOutputData": true,
        "waitBetweenTries": 5000,
        "typeVersion": 1,
        "notes": "AI categorization node that analyzes support tickets and classifies them as technical, billing, or general for routing to appropriate Slack channels",
        "parameters": {
          "modelId": "gpt-3.5-turbo",
          "messages": {
            "values": [
              {
                "role": "system",
                "content": "You are a support ticket categorization assistant. Analyze the incoming support ticket and categorize it into exactly one of these categories: technical, billing, or general. Respond with only the category name in lowercase."
              },
              {
                "role": "user",
                "content": "Please categorize this support ticket:\n\nSubject: {{$json.subject}}\nMessage: {{$json.message}}\nCustomer: {{$json.customer_email}}"
              }
            ]
          },
          "resource": "chat",
          "operation": "message"
        }
      },
      "validated": true
    },
    {
      "id": "task_node_1",
      "type": "nodes-base.webhook",
      "purpose": "Set up a webhook to receive data from external services",
      "config": {
        "onError": "continueRegularOutput",
        "alwaysOutputData": true,
        "typeVersion": 1,
        "notes": "Webhook endpoint to receive support tickets from external systems. Configured to accept POST requests with ticket data that will be processed by AI for categorization and routing to appropriate Slack channels.",
        "parameters": {
          "path": "support-tickets",
          "httpMethod": "POST",
          "responseData": "allEntries",
          "responseMode": "lastNode"
        }
      },
      "validated": true
    },
    {
      "id": "search_node_1",
      "type": "nodes-base.switch",
      "purpose": "Route support tickets to different Slack channels based on AI categorization (technical, billing, general)",
      "config": {},
      "validated": false,
      "validationErrors": [
        "Failed to generate configuration for nodes-base.switch"
      ]
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
- **Performance Score:** 20/100
- **Quality Score:** 100/100
- **Completeness Score:** 20/100

### Error Patterns
- **validation** (1 occurrences)
  - Suggested Fix: Review error details and adjust workflow accordingly

### Optimization Suggestions
- Consider optimizing discovery phase (took 18244ms)
- Consider optimizing configuration phase (took 25593ms)
