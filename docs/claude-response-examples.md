# Claude Response Examples Documentation

This document provides comprehensive examples of all JSON responses expected from Claude across all workflow phases. Each example includes the context, request, and expected response format.

## Table of Contents
1. [Discovery Phase](#discovery-phase)
2. [Configuration Phase](#configuration-phase)
3. [Building Phase](#building-phase)
4. [Validation Phase](#validation-phase)
5. [Error Scenarios](#error-scenarios)

---

## Discovery Phase

### 1. Workflow Intent Analysis

**Method**: `analyzeWorkflowIntent(prompt: string)`

**Purpose**: Initial analysis to understand what the user wants to build

**Example Request**:
```
User prompt: "I want to receive webhooks and send notifications to Slack when orders are placed"
```

**Expected Response**:
```json
{
  "intent": "Create a webhook receiver that sends Slack notifications for new orders",
  "requiredCapabilities": [
    "webhook-receiver",
    "message-sender",
    "data-processing"
  ],
  "suggestedSearchTerms": [
    "webhook",
    "slack",
    "notification",
    "http"
  ],
  "nodeRecommendations": [
    {
      "type": "webhook",
      "purpose": "Receive incoming order webhooks",
      "priority": "essential"
    },
    {
      "type": "slack",
      "purpose": "Send notifications to Slack channel",
      "priority": "essential"
    },
    {
      "type": "code",
      "purpose": "Process and format order data",
      "priority": "recommended"
    }
  ],
  "reasoning": [
    "User needs to receive external webhooks for order events",
    "Slack integration required for sending notifications",
    "May need data processing between webhook and Slack"
  ]
}
```

### 2. Node Discovery Operations

**Method**: `analyzeDiscoveryIntent(prompt: string, context: any)`

**Purpose**: Generate operations to discover and select nodes

**Example with Successful Discovery**:

**Context**: MCP found nodes for "webhook" and "slack"

**Expected Response** (with prefill `{"operations":[`):
```json
{
  "type": "discoverNode",
  "node": {
    "id": "node_1",
    "type": "nodes-base.webhook",
    "purpose": "Receive incoming HTTP webhooks"
  }
},
{
  "type": "discoverNode",
  "node": {
    "id": "node_2",
    "type": "nodes-base.slack",
    "purpose": "Send messages to Slack channels"
  }
},
{
  "type": "selectNode",
  "nodeId": "node_1"
},
{
  "type": "selectNode",
  "nodeId": "node_2"
}],
"reasoning": [
  "Webhook node will receive incoming order data",
  "Slack node will send notifications to the team",
  "Both nodes are essential for the workflow"
]}
```

### 3. Clarification Request

**Example when intent is unclear**:

**User prompt**: "process some data"

**Expected Response** (with prefill `{"operations":[`):
```json
{
  "type": "requestClarification",
  "questionId": "q1",
  "question": "What kind of data do you want to process and what should be done with it?",
  "context": {
    "reason": "The workflow intent is unclear - need to understand what data and what processing is required"
  }
}],
"reasoning": [
  "User said 'process some data' but didn't specify what data",
  "The processing requirements and end goal are unclear",
  "Need to understand the workflow's purpose before selecting nodes"
]}
```

### 4. Incremental Discovery

**Context**: User clarified they want to "store the processed data in a database"

**Expected Response** (incremental mode):
```json
{
  "type": "discoverNode",
  "node": {
    "id": "node_3",
    "type": "nodes-base.postgres",
    "purpose": "Store data in PostgreSQL database"
  }
},
{
  "type": "selectNode",
  "nodeId": "node_3"
}],
"reasoning": [
  "User clarified they need database storage",
  "PostgreSQL is a common choice for data persistence",
  "Adding database node to existing webhook and processing nodes"
]}
```

---

## Configuration Phase

### 1. Node Requirements Analysis

**Method**: `analyzeNodeRequirements(node, userPrompt, nodeEssentials)`

**Purpose**: Determine what additional information is needed to configure a node

**Example for Slack Node**:

**Input**:
- Node type: "nodes-base.slack"
- User prompt: "Send to #general channel"
- Node essentials show: resource, operation, but no channel field

**Expected Response**:
```json
{
  "needsAuth": true,
  "needsProperties": ["channelId", "select"],
  "suggestedTask": "send_slack_message",
  "needsDocumentation": false,
  "reasoning": [
    "Slack node requires authentication credentials",
    "Channel selection properties not shown in essentials",
    "Task template 'send_slack_message' provides complete configuration"
  ]
}
```

### 2. Node Configuration Operations

**Method**: `generateConfiguration(prompt, selectedNodes, context)`

**Purpose**: Generate configuration for selected nodes

**Example for Multiple Nodes**:

**Expected Response** (with prefill `{"operations":[`):
```json
{
  "type": "configureNode",
  "nodeId": "node_1",
  "config": {
    "httpMethod": "POST",
    "path": "order-webhook",
    "responseMode": "onReceived",
    "responseData": "success",
    "options": {}
  }
},
{
  "type": "configureNode",
  "nodeId": "node_2",
  "config": {
    "resource": "message",
    "operation": "post",
    "select": "channel",
    "channelId": "#general",
    "text": "New order received: {{$json.orderId}}",
    "otherOptions": {
      "includeLinkToWorkflow": false
    }
  }
}],
"reasoning": [
  "Configured webhook to receive POST requests at /order-webhook",
  "Set immediate response for webhook reliability",
  "Configured Slack to post to #general channel",
  "Used n8n expression to include order ID in message"
]}
```

### 3. Node Configuration Fix

**Method**: `fixNodeConfig(node, config, validationErrors, nodeContext)`

**Purpose**: Fix configuration based on validation errors

**Example Validation Error**: "Send Message To" field is required

**Expected Response** (raw config object):
```json
{
  "resource": "message",
  "operation": "post",
  "select": "channel",
  "channelId": "#general",
  "text": "Order notification",
  "authentication": "oAuth2"
}
```

---

## Building Phase

### 1. Workflow Building

**Method**: `buildWorkflow(context)`

**Purpose**: Assemble configured nodes into a complete workflow

**Context**: Configured webhook and Slack nodes

**Expected Response** (with prefill `{"name":"`):
```json
Webhook to Slack Notifications",
"nodes": [
  {
    "id": "node_1",
    "name": "Order Webhook",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 1.1,
    "position": [250, 300],
    "parameters": {
      "httpMethod": "POST",
      "path": "order-webhook",
      "responseMode": "onReceived",
      "responseData": "success"
    },
    "onError": "stopWorkflow"
  },
  {
    "id": "node_2",
    "name": "Send Slack Message",
    "type": "n8n-nodes-base.slack",
    "typeVersion": 2.2,
    "position": [550, 300],
    "parameters": {
      "resource": "message",
      "operation": "post",
      "select": "channel",
      "channelId": "#general",
      "text": "New order {{$json.orderId}} received!",
      "authentication": "oAuth2"
    },
    "onError": "continueErrorOutput",
    "retryOnFail": true,
    "maxTries": 3,
    "waitBetweenTries": 1000
  }
],
"connections": {
  "Order Webhook": {
    "main": [[
      {
        "node": "Send Slack Message",
        "type": "main",
        "index": 0
      }
    ]]
  }
},
"settings": {
  "executionOrder": "v1",
  "saveDataSuccessExecution": "all",
  "saveDataErrorExecution": "all",
  "saveManualExecutions": true,
  "timezone": "America/New_York"
},
"reasoning": [
  "Named workflow descriptively for easy identification",
  "Positioned webhook on left as entry point",
  "Connected webhook output to Slack input",
  "Added error handling with retry for Slack API reliability",
  "Configured to save all execution data for debugging"
]}
```

---

## Validation Phase

### 1. Validation Fixes Generation

**Method**: `generateValidationFixes(errors, workflow)`

**Purpose**: Generate fix operations for validation errors

**Example Validation Errors**:
```json
[
  {
    "node": "Send Slack Message",
    "property": "channelId",
    "message": "channelId is required"
  },
  {
    "node": "Order Webhook",
    "property": "onError",
    "message": "Node-level property 'onError' is in wrong location"
  }
]
```

**Expected Response** (array of fixes):
```json
[
  {
    "type": "addField",
    "nodeId": "node_2",
    "field": "channelId",
    "value": "#general"
  },
  {
    "type": "updateField",
    "nodeId": "node_1",
    "field": "onError",
    "value": "stopWorkflow"
  }
]
```

### 2. Complete Workflow Validation

**Method**: `validateWorkflow(context)`

**Purpose**: Validate and fix entire workflow using MCP tools

**Expected Response** (between `=== BEGIN RESULT ===` and `=== END RESULT ===` markers):
```json
{
  "workflow": {
    "name": "Order Processing Workflow",
    "nodes": [
      {
        "id": "node_1",
        "name": "Order Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 1.1,
        "position": [250, 300],
        "parameters": {
          "httpMethod": "POST",
          "path": "orders"
        },
        "onError": "stopWorkflow"
      },
      {
        "id": "node_2",
        "name": "Notify Slack",
        "type": "n8n-nodes-base.slack",
        "typeVersion": 2.2,
        "position": [550, 300],
        "parameters": {
          "resource": "message",
          "operation": "post",
          "select": "channel",
          "channelId": "#orders",
          "text": "New order: {{$json.orderId}}"
        }
      }
    ],
    "connections": {
      "Order Webhook": {
        "main": [[{"node": "Notify Slack", "type": "main", "index": 0}]]
      }
    },
    "settings": {
      "executionOrder": "v1",
      "saveDataSuccessExecution": "all",
      "saveDataErrorExecution": "all",
      "saveManualExecutions": true
    },
    "valid": true
  },
  "validationReport": {
    "initial": {
      "errors": [
        "Missing required field: channelId",
        "Missing workflow name"
      ]
    },
    "fixesApplied": [
      "Added channelId field with value '#orders'",
      "Set workflow name to 'Order Processing Workflow'"
    ],
    "final": {
      "errors": [],
      "warnings": []
    }
  },
  "reasoning": [
    "Validated workflow structure with MCP tools",
    "Fixed missing channelId in Slack node",
    "Added descriptive workflow name",
    "All validation checks now pass"
  ]
}
```

---

## Error Scenarios

### 1. Empty Prompt Handling

**Scenario**: User provides empty or whitespace-only prompt

**Expected Response** (Discovery phase):
```json
{
  "intent": "No workflow intent provided",
  "requiredCapabilities": [],
  "suggestedSearchTerms": [],
  "nodeRecommendations": [],
  "reasoning": ["Empty or invalid prompt provided"]
}
```

### 2. No Nodes Found

**Scenario**: MCP search returns no matching nodes

**Expected Response** (Discovery phase with clarification):
```json
{
  "type": "requestClarification",
  "questionId": "q1",
  "question": "I couldn't find nodes matching your request. Could you describe what you want to accomplish in more detail?",
  "context": {
    "reason": "No nodes found matching the search criteria"
  }
}],
"reasoning": [
  "MCP search returned no results",
  "Need more specific requirements from user"
]}
```

### 3. Parsing Failure Fallback

**Scenario**: Claude's response doesn't parse as valid JSON

**Fallback Response** (in error handler):
```json
{
  "operations": [],
  "reasoning": ["Failed to parse Claude response - using fallback"]
}
```

---

## Response Format Guidelines

### 1. With Prefill
When using prefill (e.g., `{"operations":[`), Claude continues from that point without repeating the prefilled portion.

### 2. Field Consistency
- Always include `reasoning` array with 1-5 clear explanations
- Use consistent node ID format: `node_1`, `node_2`, etc.
- Node types must match MCP database format: `nodes-base.nodeName`

### 3. Error Handling
- Validation errors should reference exact field names from error messages
- Fix operations should be minimal and targeted
- Always validate fixes don't introduce new errors

### 4. Expression Syntax
- Use n8n expression format: `{{$json.fieldName}}`
- Reference other nodes: `{{$node["Node Name"].json.field}}`
- Use proper escaping in JSON strings