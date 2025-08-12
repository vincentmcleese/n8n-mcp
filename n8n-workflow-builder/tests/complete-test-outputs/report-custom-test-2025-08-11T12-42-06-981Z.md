# n8n Workflow Builder Test Report

**Test Name:** Custom Test
**Timestamp:** 2025-08-11T12:41:15.365Z
**Duration:** 51615ms
**Success:** ❌ No

## User Prompt
```
Design a workflow triggered by new social media posts that uses AI to analyze content for inappropriate material, automatically flags suspicious content, generates summary reports, stores results in a database, and sends daily digest emails to moderators with statistics and flagged items. The database is postgresSQL
```

## Session ID: `complete_e2e_custom_test_1754916075365`

## ========== DISCOVERY PHASE ==========

**Status:** ✅ Success
**Duration:** 20084ms
**Memory Delta:** 1MB

### Logs
```
2025-08-11T12:41:15.649Z [INFO] [Orchestrator] Starting discovery phase
2025-08-11T12:41:15.649Z [DEBUG] [Claude] Sending request for discovery phase
2025-08-11T12:41:29.045Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T12:41:29.045Z [DEBUG] [MCP] Parameters: {"task":"process_webhook_data"}
2025-08-11T12:41:29.045Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T12:41:29.045Z [DEBUG] [MCP] Parameters: {"task":"chat_with_ai"}
2025-08-11T12:41:29.046Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T12:41:29.046Z [DEBUG] [MCP] Parameters: {"task":"insert_postgres_data"}
2025-08-11T12:41:29.046Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T12:41:29.046Z [DEBUG] [MCP] Parameters: {"task":"transform_data"}
2025-08-11T12:41:29.046Z [INFO] [MCP] Calling tool: get_node_for_task
2025-08-11T12:41:29.046Z [DEBUG] [MCP] Parameters: {"task":"send_email"}
2025-08-11T12:41:29.205Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T12:41:29.215Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T12:41:29.218Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T12:41:29.223Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T12:41:29.229Z [DEBUG] [MCP] Tool get_node_for_task completed successfully
2025-08-11T12:41:29.232Z [INFO] [MCP] Calling tool: search_nodes
2025-08-11T12:41:29.232Z [DEBUG] [MCP] Parameters: {"query":"twitter","limit":20}
2025-08-11T12:41:29.232Z [INFO] [MCP] Calling tool: search_nodes
2025-08-11T12:41:29.232Z [DEBUG] [MCP] Parameters: {"query":"if","limit":20}
2025-08-11T12:41:29.232Z [INFO] [MCP] Calling tool: search_nodes
2025-08-11T12:41:29.232Z [DEBUG] [MCP] Parameters: {"query":"schedule","limit":20}
2025-08-11T12:41:29.363Z [DEBUG] [MCP] Tool search_nodes completed successfully
2025-08-11T12:41:29.367Z [DEBUG] [MCP] Tool search_nodes completed successfully
2025-08-11T12:41:29.372Z [DEBUG] [MCP] Tool search_nodes completed successfully
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.postgres (Insert data into PostgreSQL table)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.openAi (Send a message to an AI model and get response)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.emailSend (Send an email notification)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.code (Process incoming webhook data with Code node (shows correct data access))
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.code (Transform data structure using JavaScript)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.if (Route items based on conditions to flag suspicious content)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.scheduleTrigger (Trigger daily digest email generation on schedule)
2025-08-11T12:41:35.676Z [INFO] [Tools] Added node: nodes-base.twitter (Monitor social media posts for content analysis)
2025-08-11T12:41:35.733Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T12:41:35.733Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.postgres** (ID: task_node_3)
  - Purpose: Insert data into PostgreSQL table
- **nodes-base.openAi** (ID: task_node_2)
  - Purpose: Send a message to an AI model and get response
- **nodes-base.emailSend** (ID: task_node_5)
  - Purpose: Send an email notification
- **nodes-base.code** (ID: task_node_1)
  - Purpose: Process incoming webhook data with Code node (shows correct data access)
- **nodes-base.code** (ID: task_node_4)
  - Purpose: Transform data structure using JavaScript
- **nodes-base.if** (ID: search_node_1)
  - Purpose: Route items based on conditions to flag suspicious content
- **nodes-base.scheduleTrigger** (ID: search_node_2)
  - Purpose: Trigger daily digest email generation on schedule
- **nodes-base.twitter** (ID: search_node_3)
  - Purpose: Monitor social media posts for content analysis

### Data Flow
**Input:**
```json
{
  "prompt": "Design a workflow triggered by new social media posts that uses AI to analyze content for inappropriate material, automatically flags suspicious content, generates summary reports, stores results in a database, and sends daily digest emails to moderators with statistics and flagged items. The database is postgresSQL"
}
```

**Output:**
```json
{
  "nodes": [
    {
      "id": "task_node_3",
      "type": "nodes-base.postgres",
      "displayName": "insert postgres data",
      "purpose": "Insert data into PostgreSQL table",
      "isPreConfigured": true,
      "config": {
        "operation": "insert",
        "table": "",
        "columns": "",
        "returnFields": "*",
        "onError": "stopWorkflow",
        "retryOnFail": true,
        "maxTries": 2,
        "waitBetweenTries": 1000
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
      "id": "task_node_5",
      "type": "nodes-base.emailSend",
      "displayName": "send email",
      "purpose": "Send an email notification",
      "isPreConfigured": true,
      "config": {
        "fromEmail": "",
        "toEmail": "",
        "subject": "",
        "text": "",
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 3,
        "waitBetweenTries": 3000,
        "alwaysOutputData": true
      }
    },
    {
      "id": "task_node_1",
      "type": "nodes-base.code",
      "displayName": "process webhook data",
      "purpose": "Process incoming webhook data with Code node (shows correct data access)",
      "isPreConfigured": true,
      "config": {
        "language": "javaScript",
        "jsCode": "// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Common mistake to avoid:\n// const command = items[0].json.testCommand;  // ❌ WRONG - will be undefined!\n// const command = items[0].json.body.testCommand;  // ✅ CORRECT\n\n// Process the webhook data\ntry {\n  // Validate required fields\n  if (!webhookData.command) {\n    throw new Error('Missing required field: command');\n  }\n  \n  // Process based on command\n  let result = {};\n  switch (webhookData.command) {\n    case 'process':\n      result = {\n        status: 'processed',\n        data: webhookData.data,\n        processedAt: DateTime.now().toISO()\n      };\n      break;\n      \n    case 'validate':\n      result = {\n        status: 'validated',\n        isValid: true,\n        validatedFields: Object.keys(webhookData.data || {})\n      };\n      break;\n      \n    default:\n      result = {\n        status: 'unknown_command',\n        command: webhookData.command\n      };\n  }\n  \n  // Return processed data\n  return [{\n    json: {\n      ...result,\n      requestId: headers['x-request-id'] || crypto.randomUUID(),\n      source: query.source || 'webhook',\n      originalCommand: webhookData.command,\n      metadata: {\n        httpMethod: items[0].json.httpMethod,\n        webhookPath: items[0].json.webhookPath,\n        timestamp: DateTime.now().toISO()\n      }\n    }\n  }];\n  \n} catch (error) {\n  // Return error response\n  return [{\n    json: {\n      status: 'error',\n      error: error.message,\n      timestamp: DateTime.now().toISO()\n    }\n  }];\n}",
        "onError": "continueRegularOutput"
      }
    },
    {
      "id": "task_node_4",
      "type": "nodes-base.code",
      "displayName": "transform data",
      "purpose": "Transform data structure using JavaScript",
      "isPreConfigured": true,
      "config": {
        "language": "javaScript",
        "jsCode": "// Transform each item\nconst results = [];\n\nfor (const item of items) {\n  results.push({\n    json: {\n      // Transform your data here\n      id: item.json.id,\n      processedAt: new Date().toISOString()\n    }\n  });\n}\n\nreturn results;"
      }
    },
    {
      "id": "search_node_1",
      "type": "nodes-base.if",
      "displayName": "nodes-base.if",
      "purpose": "Route items based on conditions to flag suspicious content",
      "needsConfiguration": true
    },
    {
      "id": "search_node_2",
      "type": "nodes-base.scheduleTrigger",
      "displayName": "nodes-base.scheduleTrigger",
      "purpose": "Trigger daily digest email generation on schedule",
      "needsConfiguration": true
    },
    {
      "id": "search_node_3",
      "type": "nodes-base.twitter",
      "displayName": "nodes-base.twitter",
      "purpose": "Monitor social media posts for content analysis",
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
  "sessionId": "complete_e2e_custom_test_1754916075365",
  "createdAt": "2025-08-11T12:41:15.656Z",
  "state": {
    "phase": "configuration",
    "userPrompt": "Design a workflow triggered by new social media posts that uses AI to analyze content for inappropriate material, automatically flags suspicious content, generates summary reports, stores results in a database, and sends daily digest emails to moderators with statistics and flagged items. The database is postgresSQL",
    "discovered": [
      {
        "id": "task_node_3",
        "type": "nodes-base.postgres",
        "config": {
          "table": "",
          "columns": "",
          "onError": "stopWorkflow",
          "maxTries": 2,
          "operation": "insert",
          "retryOnFail": true,
          "returnFields": "*",
          "waitBetweenTries": 1000
        },
        "purpose": "Insert data into PostgreSQL table",
        "displayName": "insert postgres data",
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
        "id": "task_node_5",
        "type": "nodes-base.emailSend",
        "config": {
          "text": "",
          "onError": "continueRegularOutput",
          "subject": "",
          "toEmail": "",
          "maxTries": 3,
          "fromEmail": "",
          "retryOnFail": true,
          "alwaysOutputData": true,
          "waitBetweenTries": 3000
        },
        "purpose": "Send an email notification",
        "displayName": "send email",
        "isPreConfigured": true
      },
      {
        "id": "task_node_1",
        "type": "nodes-base.code",
        "config": {
          "jsCode": "// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Common mistake to avoid:\n// const command = items[0].json.testCommand;  // ❌ WRONG - will be undefined!\n// const command = items[0].json.body.testCommand;  // ✅ CORRECT\n\n// Process the webhook data\ntry {\n  // Validate required fields\n  if (!webhookData.command) {\n    throw new Error('Missing required field: command');\n  }\n  \n  // Process based on command\n  let result = {};\n  switch (webhookData.command) {\n    case 'process':\n      result = {\n        status: 'processed',\n        data: webhookData.data,\n        processedAt: DateTime.now().toISO()\n      };\n      break;\n      \n    case 'validate':\n      result = {\n        status: 'validated',\n        isValid: true,\n        validatedFields: Object.keys(webhookData.data || {})\n      };\n      break;\n      \n    default:\n      result = {\n        status: 'unknown_command',\n        command: webhookData.command\n      };\n  }\n  \n  // Return processed data\n  return [{\n    json: {\n      ...result,\n      requestId: headers['x-request-id'] || crypto.randomUUID(),\n      source: query.source || 'webhook',\n      originalCommand: webhookData.command,\n      metadata: {\n        httpMethod: items[0].json.httpMethod,\n        webhookPath: items[0].json.webhookPath,\n        timestamp: DateTime.now().toISO()\n      }\n    }\n  }];\n  \n} catch (error) {\n  // Return error response\n  return [{\n    json: {\n      status: 'error',\n      error: error.message,\n      timestamp: DateTime.now().toISO()\n    }\n  }];\n}",
          "onError": "continueRegularOutput",
          "language": "javaScript"
        },
        "purpose": "Process incoming webhook data with Code node (shows correct data access)",
        "displayName": "process webhook data",
        "isPreConfigured": true
      },
      {
        "id": "task_node_4",
        "type": "nodes-base.code",
        "config": {
          "jsCode": "// Transform each item\nconst results = [];\n\nfor (const item of items) {\n  results.push({\n    json: {\n      // Transform your data here\n      id: item.json.id,\n      processedAt: new Date().toISOString()\n    }\n  });\n}\n\nreturn results;",
          "language": "javaScript"
        },
        "purpose": "Transform data structure using JavaScript",
        "displayName": "transform data",
        "isPreConfigured": true
      },
      {
        "id": "search_node_1",
        "type": "nodes-base.if",
        "purpose": "Route items based on conditions to flag suspicious content"
      },
      {
        "id": "search_node_2",
        "type": "nodes-base.scheduleTrigger",
        "purpose": "Trigger daily digest email generation on schedule"
      },
      {
        "id": "search_node_3",
        "type": "nodes-base.twitter",
        "purpose": "Monitor social media posts for content analysis"
      }
    ],
    "selected": [
      "task_node_3",
      "task_node_2",
      "task_node_5",
      "task_node_1",
      "task_node_4",
      "search_node_1",
      "search_node_2",
      "search_node_3"
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
          "type": "nodes-base.postgres",
          "config": {
            "table": "",
            "columns": "",
            "onError": "stopWorkflow",
            "maxTries": 2,
            "operation": "insert",
            "retryOnFail": true,
            "returnFields": "*",
            "waitBetweenTries": 1000
          },
          "purpose": "Insert data into PostgreSQL table",
          "displayName": "insert postgres data",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_3",
        "timestamp": "2025-08-11T12:41:34.855Z"
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
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_2",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "node": {
          "id": "task_node_5",
          "type": "nodes-base.emailSend",
          "config": {
            "text": "",
            "onError": "continueRegularOutput",
            "subject": "",
            "toEmail": "",
            "maxTries": 3,
            "fromEmail": "",
            "retryOnFail": true,
            "alwaysOutputData": true,
            "waitBetweenTries": 3000
          },
          "purpose": "Send an email notification",
          "displayName": "send email",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_5",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "node": {
          "id": "task_node_1",
          "type": "nodes-base.code",
          "config": {
            "jsCode": "// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Common mistake to avoid:\n// const command = items[0].json.testCommand;  // ❌ WRONG - will be undefined!\n// const command = items[0].json.body.testCommand;  // ✅ CORRECT\n\n// Process the webhook data\ntry {\n  // Validate required fields\n  if (!webhookData.command) {\n    throw new Error('Missing required field: command');\n  }\n  \n  // Process based on command\n  let result = {};\n  switch (webhookData.command) {\n    case 'process':\n      result = {\n        status: 'processed',\n        data: webhookData.data,\n        processedAt: DateTime.now().toISO()\n      };\n      break;\n      \n    case 'validate':\n      result = {\n        status: 'validated',\n        isValid: true,\n        validatedFields: Object.keys(webhookData.data || {})\n      };\n      break;\n      \n    default:\n      result = {\n        status: 'unknown_command',\n        command: webhookData.command\n      };\n  }\n  \n  // Return processed data\n  return [{\n    json: {\n      ...result,\n      requestId: headers['x-request-id'] || crypto.randomUUID(),\n      source: query.source || 'webhook',\n      originalCommand: webhookData.command,\n      metadata: {\n        httpMethod: items[0].json.httpMethod,\n        webhookPath: items[0].json.webhookPath,\n        timestamp: DateTime.now().toISO()\n      }\n    }\n  }];\n  \n} catch (error) {\n  // Return error response\n  return [{\n    json: {\n      status: 'error',\n      error: error.message,\n      timestamp: DateTime.now().toISO()\n    }\n  }];\n}",
            "onError": "continueRegularOutput",
            "language": "javaScript"
          },
          "purpose": "Process incoming webhook data with Code node (shows correct data access)",
          "displayName": "process webhook data",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_1",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "node": {
          "id": "task_node_4",
          "type": "nodes-base.code",
          "config": {
            "jsCode": "// Transform each item\nconst results = [];\n\nfor (const item of items) {\n  results.push({\n    json: {\n      // Transform your data here\n      id: item.json.id,\n      processedAt: new Date().toISOString()\n    }\n  });\n}\n\nreturn results;",
            "language": "javaScript"
          },
          "purpose": "Transform data structure using JavaScript",
          "displayName": "transform data",
          "isPreConfigured": true
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "type": "selectNode",
        "nodeId": "task_node_4",
        "timestamp": "2025-08-11T12:41:34.855Z"
      },
      {
        "node": {
          "id": "search_node_1",
          "type": "nodes-base.if",
          "purpose": "Route items based on conditions to flag suspicious content"
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "type": "selectNode",
        "nodeId": "search_node_1",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "node": {
          "id": "search_node_2",
          "type": "nodes-base.scheduleTrigger",
          "purpose": "Trigger daily digest email generation on schedule"
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "type": "selectNode",
        "nodeId": "search_node_2",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "node": {
          "id": "search_node_3",
          "type": "nodes-base.twitter",
          "purpose": "Monitor social media posts for content analysis"
        },
        "type": "discoverNode",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "type": "selectNode",
        "nodeId": "search_node_3",
        "timestamp": "2025-08-11T12:41:35.130Z"
      },
      {
        "type": "completePhase",
        "phase": "discovery",
        "timestamp": "2025-08-11T12:41:35.130Z"
      }
    ],
    "pendingClarifications": [],
    "clarificationHistory": []
  }
}
```

## ========== CONFIGURATION PHASE ==========

**Status:** ❌ Failed
**Duration:** 31246ms
**Memory Delta:** 3MB

### Logs
```
2025-08-11T12:41:35.733Z [INFO] [Orchestrator] Starting configuration phase
2025-08-11T12:41:35.733Z [DEBUG] [Claude] Sending request for configuration phase
2025-08-11T12:41:43.442Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:43.442Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.postgres","config":{"table":"content_moderation","columns":"post_id, platform, content_text, analysis_result, inappropriate_flag, confidence_score, flagged_categories, created_at, processed_at","operation":"insert","returnFields":"*"}}
2025-08-11T12:41:43.617Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:43.619Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:43.619Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.postgres","config":{"table":"content_moderation","columns":"post_id, platform, content_text, analysis_result, inappropriate_flag, confidence_score, flagged_categories, created_at, processed_at","operation":"insert","returnFields":"*"}}
2025-08-11T12:41:43.769Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:45.292Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:45.292Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.openAi","config":{"modelId":"gpt-3.5-turbo","messages":{"values":[{"role":"system","content":"You are a content moderation AI. Analyze social media posts for inappropriate content including hate speech, harassment, spam, adult content, violence, and misinformation. Respond with a JSON object containing: {\"flagged\": boolean, \"confidence\": number (0-1), \"categories\": [array of violation types], \"severity\": \"low\"|\"medium\"|\"high\", \"summary\": \"brief explanation\"}"},{"role":"user","content":"Analyze this social media post for inappropriate content:\n\nPost Content: {{$json.content}}\nAuthor: {{$json.author}}\nPlatform: {{$json.platform}}\nPost ID: {{$json.post_id}}"}]},"resource":"chat","operation":"message"}}
2025-08-11T12:41:45.394Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:47.015Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:47.016Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.emailSend","config":{"text":"Daily Content Moderation Report\n\n📊 Statistics:\n- Total posts analyzed: {{$json.total_posts}}\n- Flagged items: {{$json.flagged_count}}\n- Clean content: {{$json.clean_count}}\n- Flag rate: {{$json.flag_percentage}}%\n\n🚨 Flagged Items Summary:\n{{$json.flagged_items_summary}}\n\n📈 Trend Analysis:\n{{$json.trend_analysis}}\n\nGenerated on: {{$now.format('YYYY-MM-DD HH:mm:ss')}}\n\nThis is an automated report from the content moderation system.","subject":"Daily Content Moderation Report - {{$now.format('YYYY-MM-DD')}}","toEmail":"moderators@company.com","fromEmail":"content-moderation@company.com"}}
2025-08-11T12:41:47.129Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:47.130Z [INFO] [MCP] Calling tool: get_node_essentials
2025-08-11T12:41:47.130Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.if"}
2025-08-11T12:41:47.237Z [DEBUG] [MCP] Tool get_node_essentials completed successfully
2025-08-11T12:41:53.437Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:53.437Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.if","config":{"conditions":{"conditions":[{"id":"1","leftValue":"={{ $json.ai_analysis.inappropriate_score }}","rightValue":0.7,"operator":{"type":"number","operation":"gte"}},{"id":"2","leftValue":"={{ $json.ai_analysis.confidence }}","rightValue":0.8,"operator":{"type":"number","operation":"gte"}}],"combineOperation":"all"}}}
2025-08-11T12:41:53.598Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:53.599Z [INFO] [MCP] Calling tool: get_node_essentials
2025-08-11T12:41:53.599Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.scheduleTrigger"}
2025-08-11T12:41:53.761Z [DEBUG] [MCP] Tool get_node_essentials completed successfully
2025-08-11T12:41:58.779Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:58.779Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.scheduleTrigger","config":{"notice":""}}
2025-08-11T12:41:58.927Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:41:58.928Z [INFO] [MCP] Calling tool: get_node_essentials
2025-08-11T12:41:58.928Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.twitter"}
2025-08-11T12:41:59.041Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:41:59.041Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.code","config":{"jsCode":"// Transform AI analysis results and social media data for database storage\nconst results = [];\n\nfor (const item of items) {\n  // Extract social media post data and AI analysis results\n  const postData = item.json.postData || item.json;\n  const aiAnalysis = item.json.aiAnalysis || item.json.analysis || {};\n  \n  // Determine content status based on AI analysis\n  const inappropriateScore = aiAnalysis.inappropriateScore || 0;\n  const contentFlags = aiAnalysis.flags || [];\n  const isFlagged = inappropriateScore > 0.7 || contentFlags.length > 0;\n  \n  // Create structured data for database\n  const transformedData = {\n    // Post identification\n    post_id: postData.id || postData.post_id,\n    platform: postData.platform || 'unknown',\n    author: postData.author || postData.username,\n    content: postData.content || postData.text,\n    post_url: postData.url || postData.link,\n    posted_at: postData.created_at || postData.timestamp,\n    \n    // AI Analysis results\n    inappropriate_score: inappropriateScore,\n    content_flags: JSON.stringify(contentFlags),\n    ai_summary: aiAnalysis.summary || '',\n    confidence_level: aiAnalysis.confidence || 0,\n    \n    // Moderation status\n    is_flagged: isFlagged,\n    moderation_status: isFlagged ? 'pending_review' : 'approved',\n    flagged_reason: contentFlags.join(', ') || null,\n    \n    // Processing metadata\n    processed_at: new Date().toISOString(),\n    workflow_run_id: $workflow.id,\n    \n    // Statistics for reporting\n    engagement_metrics: JSON.stringify({\n      likes: postData.likes || 0,\n      shares: postData.shares || 0,\n      comments: postData.comments || 0\n    })\n  };\n  \n  results.push({\n    json: transformedData\n  });\n}\n\nreturn results;","language":"javaScript"}}
2025-08-11T12:41:59.098Z [DEBUG] [MCP] Tool get_node_essentials completed successfully
2025-08-11T12:41:59.176Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:42:02.772Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:42:02.772Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.code","config":{"jsCode":"// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node receiving social media posts\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Process social media post data for content moderation\ntry {\n  // Validate required fields for social media post\n  if (!webhookData.postContent && !webhookData.content && !webhookData.text) {\n    throw new Error('Missing required field: post content');\n  }\n  \n  if (!webhookData.platform && !webhookData.source) {\n    throw new Error('Missing required field: social media platform');\n  }\n  \n  // Extract and normalize post data\n  const postContent = webhookData.postContent || webhookData.content || webhookData.text;\n  const platform = webhookData.platform || webhookData.source;\n  const userId = webhookData.userId || webhookData.user_id || webhookData.authorId;\n  const postId = webhookData.postId || webhookData.id || webhookData.post_id;\n  \n  // Prepare data for AI content analysis\n  const processedData = {\n    // Core content for AI analysis\n    content: postContent,\n    contentLength: postContent.length,\n    platform: platform.toLowerCase(),\n    \n    // Post metadata\n    postId: postId,\n    userId: userId,\n    username: webhookData.username || webhookData.author || 'unknown',\n    timestamp: webhookData.timestamp || webhookData.created_at || DateTime.now().toISO(),\n    \n    // Additional context for moderation\n    hasImages: !!(webhookData.images || webhookData.media || []).length,\n    hasVideo: !!(webhookData.videos || webhookData.video_urls || []).length,\n    hasLinks: /https?:\\/\\//.test(postContent),\n    hashtags: (postContent.match(/#\\w+/g) || []),\n    mentions: (postContent.match(/@\\w+/g) || []),\n    \n    // Processing metadata\n    processedAt: DateTime.now().toISO(),\n    requestId: headers['x-request-id'] || crypto.randomUUID(),\n    webhookSource: query.source || 'social_media_webhook',\n    \n    // Moderation workflow status\n    moderationStatus: 'pending_analysis',\n    flagged: false,\n    aiAnalysisRequired: true,\n    \n    // Original webhook data for reference\n    originalData: {\n      httpMethod: items[0].json.httpMethod,\n      webhookPath: items[0].json.webhookPath,\n      headers: {\n        userAgent: headers['user-agent'],\n        contentType: headers['content-type']\n      }\n    }\n  };\n  \n  // Return processed data ready for AI analysis\n  return [{\n    json: processedData\n  }];\n  \n} catch (error) {\n  // Return error response for failed processing\n  return [{\n    json: {\n      status: 'processing_error',\n      error: error.message,\n      timestamp: DateTime.now().toISO(),\n      moderationStatus: 'processing_failed',\n      originalPayload: webhookData,\n      requestId: headers['x-request-id'] || crypto.randomUUID()\n    }\n  }];\n}","language":"javaScript"}}
2025-08-11T12:42:03.207Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:42:04.936Z [INFO] [MCP] Calling tool: validate_node_minimal
2025-08-11T12:42:04.936Z [DEBUG] [MCP] Parameters: {"nodeType":"nodes-base.twitter","config":{"resource":"tweet","operation":"search","searchText":"#content OR #posts OR lang:en -is:retweet","returnAll":false,"limit":50}}
2025-08-11T12:42:05.047Z [DEBUG] [MCP] Tool validate_node_minimal completed successfully
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.postgres (Insert data into PostgreSQL table)
2025-08-11T12:42:06.830Z [WARN] [Orchestrator] Node task_node_3: Missing required field: Schema
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.openAi (Send a message to an AI model and get response)
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.emailSend (Send an email notification)
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.code (Process incoming webhook data with Code node (shows correct data access))
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.code (Transform data structure using JavaScript)
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.if (Route items based on conditions to flag suspicious content)
2025-08-11T12:42:06.830Z [INFO] [Tools] Added node: nodes-base.scheduleTrigger (Trigger daily digest email generation on schedule)
2025-08-11T12:42:06.831Z [INFO] [Tools] Added node: nodes-base.twitter (Monitor social media posts for content analysis)
2025-08-11T12:42:06.979Z [DEBUG] [Orchestrator] Session state updated
2025-08-11T12:42:06.979Z [INFO] [Orchestrator] Data flow captured: 3 transformations
```

### Nodes
- **nodes-base.postgres** (ID: task_node_3)
  - Purpose: Insert data into PostgreSQL table
  - Validation: invalid
  - Errors: Missing required field: Schema
- **nodes-base.openAi** (ID: task_node_2)
  - Purpose: Send a message to an AI model and get response
  - Validation: valid
- **nodes-base.emailSend** (ID: task_node_5)
  - Purpose: Send an email notification
  - Validation: valid
- **nodes-base.code** (ID: task_node_1)
  - Purpose: Process incoming webhook data with Code node (shows correct data access)
  - Validation: valid
- **nodes-base.code** (ID: task_node_4)
  - Purpose: Transform data structure using JavaScript
  - Validation: valid
- **nodes-base.if** (ID: search_node_1)
  - Purpose: Route items based on conditions to flag suspicious content
  - Validation: valid
- **nodes-base.scheduleTrigger** (ID: search_node_2)
  - Purpose: Trigger daily digest email generation on schedule
  - Validation: valid
- **nodes-base.twitter** (ID: search_node_3)
  - Purpose: Monitor social media posts for content analysis
  - Validation: valid

### Errors
1. **validation**: 1 nodes failed validation

### Warnings
1. Node task_node_3: Missing required field: Schema

### Data Flow
**Input:**
```json
{
  "discoveredNodes": [
    {
      "id": "task_node_3",
      "type": "nodes-base.postgres",
      "displayName": "insert postgres data",
      "purpose": "Insert data into PostgreSQL table",
      "isPreConfigured": true,
      "config": {
        "operation": "insert",
        "table": "",
        "columns": "",
        "returnFields": "*",
        "onError": "stopWorkflow",
        "retryOnFail": true,
        "maxTries": 2,
        "waitBetweenTries": 1000
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
      "id": "task_node_5",
      "type": "nodes-base.emailSend",
      "displayName": "send email",
      "purpose": "Send an email notification",
      "isPreConfigured": true,
      "config": {
        "fromEmail": "",
        "toEmail": "",
        "subject": "",
        "text": "",
        "onError": "continueRegularOutput",
        "retryOnFail": true,
        "maxTries": 3,
        "waitBetweenTries": 3000,
        "alwaysOutputData": true
      }
    },
    {
      "id": "task_node_1",
      "type": "nodes-base.code",
      "displayName": "process webhook data",
      "purpose": "Process incoming webhook data with Code node (shows correct data access)",
      "isPreConfigured": true,
      "config": {
        "language": "javaScript",
        "jsCode": "// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Common mistake to avoid:\n// const command = items[0].json.testCommand;  // ❌ WRONG - will be undefined!\n// const command = items[0].json.body.testCommand;  // ✅ CORRECT\n\n// Process the webhook data\ntry {\n  // Validate required fields\n  if (!webhookData.command) {\n    throw new Error('Missing required field: command');\n  }\n  \n  // Process based on command\n  let result = {};\n  switch (webhookData.command) {\n    case 'process':\n      result = {\n        status: 'processed',\n        data: webhookData.data,\n        processedAt: DateTime.now().toISO()\n      };\n      break;\n      \n    case 'validate':\n      result = {\n        status: 'validated',\n        isValid: true,\n        validatedFields: Object.keys(webhookData.data || {})\n      };\n      break;\n      \n    default:\n      result = {\n        status: 'unknown_command',\n        command: webhookData.command\n      };\n  }\n  \n  // Return processed data\n  return [{\n    json: {\n      ...result,\n      requestId: headers['x-request-id'] || crypto.randomUUID(),\n      source: query.source || 'webhook',\n      originalCommand: webhookData.command,\n      metadata: {\n        httpMethod: items[0].json.httpMethod,\n        webhookPath: items[0].json.webhookPath,\n        timestamp: DateTime.now().toISO()\n      }\n    }\n  }];\n  \n} catch (error) {\n  // Return error response\n  return [{\n    json: {\n      status: 'error',\n      error: error.message,\n      timestamp: DateTime.now().toISO()\n    }\n  }];\n}",
        "onError": "continueRegularOutput"
      }
    },
    {
      "id": "task_node_4",
      "type": "nodes-base.code",
      "displayName": "transform data",
      "purpose": "Transform data structure using JavaScript",
      "isPreConfigured": true,
      "config": {
        "language": "javaScript",
        "jsCode": "// Transform each item\nconst results = [];\n\nfor (const item of items) {\n  results.push({\n    json: {\n      // Transform your data here\n      id: item.json.id,\n      processedAt: new Date().toISOString()\n    }\n  });\n}\n\nreturn results;"
      }
    },
    {
      "id": "search_node_1",
      "type": "nodes-base.if",
      "displayName": "nodes-base.if",
      "purpose": "Route items based on conditions to flag suspicious content",
      "needsConfiguration": true
    },
    {
      "id": "search_node_2",
      "type": "nodes-base.scheduleTrigger",
      "displayName": "nodes-base.scheduleTrigger",
      "purpose": "Trigger daily digest email generation on schedule",
      "needsConfiguration": true
    },
    {
      "id": "search_node_3",
      "type": "nodes-base.twitter",
      "displayName": "nodes-base.twitter",
      "purpose": "Monitor social media posts for content analysis",
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
      "type": "nodes-base.postgres",
      "purpose": "Insert data into PostgreSQL table",
      "config": {
        "onError": "stopWorkflow",
        "maxTries": 2,
        "retryOnFail": true,
        "waitBetweenTries": 1000,
        "typeVersion": 2.4,
        "notes": "Insert social media content analysis results into PostgreSQL database, storing post data, AI analysis results, moderation flags, and timestamps for daily digest reporting",
        "parameters": {
          "table": "content_moderation",
          "columns": "post_id, platform, content_text, analysis_result, inappropriate_flag, confidence_score, flagged_categories, created_at, processed_at",
          "operation": "insert",
          "returnFields": "*"
        }
      },
      "validated": false,
      "validationErrors": [
        "Missing required field: Schema"
      ]
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
        "notes": "AI content moderation - analyzes social media posts for inappropriate material and flags suspicious content",
        "parameters": {
          "modelId": "gpt-3.5-turbo",
          "messages": {
            "values": [
              {
                "role": "system",
                "content": "You are a content moderation AI. Analyze social media posts for inappropriate content including hate speech, harassment, spam, adult content, violence, and misinformation. Respond with a JSON object containing: {\"flagged\": boolean, \"confidence\": number (0-1), \"categories\": [array of violation types], \"severity\": \"low\"|\"medium\"|\"high\", \"summary\": \"brief explanation\"}"
              },
              {
                "role": "user",
                "content": "Analyze this social media post for inappropriate content:\n\nPost Content: {{$json.content}}\nAuthor: {{$json.author}}\nPlatform: {{$json.platform}}\nPost ID: {{$json.post_id}}"
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
      "id": "task_node_5",
      "type": "nodes-base.emailSend",
      "purpose": "Send an email notification",
      "config": {
        "onError": "continueRegularOutput",
        "maxTries": 3,
        "retryOnFail": true,
        "alwaysOutputData": true,
        "waitBetweenTries": 3000,
        "notes": "Send daily digest email to moderators with content moderation statistics and flagged items summary",
        "parameters": {
          "text": "Daily Content Moderation Report\n\n📊 Statistics:\n- Total posts analyzed: {{$json.total_posts}}\n- Flagged items: {{$json.flagged_count}}\n- Clean content: {{$json.clean_count}}\n- Flag rate: {{$json.flag_percentage}}%\n\n🚨 Flagged Items Summary:\n{{$json.flagged_items_summary}}\n\n📈 Trend Analysis:\n{{$json.trend_analysis}}\n\nGenerated on: {{$now.format('YYYY-MM-DD HH:mm:ss')}}\n\nThis is an automated report from the content moderation system.",
          "subject": "Daily Content Moderation Report - {{$now.format('YYYY-MM-DD')}}",
          "toEmail": "moderators@company.com",
          "fromEmail": "content-moderation@company.com"
        }
      },
      "validated": true
    },
    {
      "id": "task_node_1",
      "type": "nodes-base.code",
      "purpose": "Process incoming webhook data with Code node (shows correct data access)",
      "config": {
        "onError": "continueRegularOutput",
        "notes": "Process incoming social media post data from webhook and prepare for AI content analysis. Extracts post content, metadata, and user information for moderation workflow.",
        "parameters": {
          "jsCode": "// ⚠️ CRITICAL: Webhook data is nested under 'body' property!\n// Connect this Code node after a Webhook node receiving social media posts\n\n// Access webhook payload data - it's under .body, not directly under .json\nconst webhookData = items[0].json.body;  // ✅ CORRECT\nconst headers = items[0].json.headers;   // HTTP headers\nconst query = items[0].json.query;       // Query parameters\n\n// Process social media post data for content moderation\ntry {\n  // Validate required fields for social media post\n  if (!webhookData.postContent && !webhookData.content && !webhookData.text) {\n    throw new Error('Missing required field: post content');\n  }\n  \n  if (!webhookData.platform && !webhookData.source) {\n    throw new Error('Missing required field: social media platform');\n  }\n  \n  // Extract and normalize post data\n  const postContent = webhookData.postContent || webhookData.content || webhookData.text;\n  const platform = webhookData.platform || webhookData.source;\n  const userId = webhookData.userId || webhookData.user_id || webhookData.authorId;\n  const postId = webhookData.postId || webhookData.id || webhookData.post_id;\n  \n  // Prepare data for AI content analysis\n  const processedData = {\n    // Core content for AI analysis\n    content: postContent,\n    contentLength: postContent.length,\n    platform: platform.toLowerCase(),\n    \n    // Post metadata\n    postId: postId,\n    userId: userId,\n    username: webhookData.username || webhookData.author || 'unknown',\n    timestamp: webhookData.timestamp || webhookData.created_at || DateTime.now().toISO(),\n    \n    // Additional context for moderation\n    hasImages: !!(webhookData.images || webhookData.media || []).length,\n    hasVideo: !!(webhookData.videos || webhookData.video_urls || []).length,\n    hasLinks: /https?:\\/\\//.test(postContent),\n    hashtags: (postContent.match(/#\\w+/g) || []),\n    mentions: (postContent.match(/@\\w+/g) || []),\n    \n    // Processing metadata\n    processedAt: DateTime.now().toISO(),\n    requestId: headers['x-request-id'] || crypto.randomUUID(),\n    webhookSource: query.source || 'social_media_webhook',\n    \n    // Moderation workflow status\n    moderationStatus: 'pending_analysis',\n    flagged: false,\n    aiAnalysisRequired: true,\n    \n    // Original webhook data for reference\n    originalData: {\n      httpMethod: items[0].json.httpMethod,\n      webhookPath: items[0].json.webhookPath,\n      headers: {\n        userAgent: headers['user-agent'],\n        contentType: headers['content-type']\n      }\n    }\n  };\n  \n  // Return processed data ready for AI analysis\n  return [{\n    json: processedData\n  }];\n  \n} catch (error) {\n  // Return error response for failed processing\n  return [{\n    json: {\n      status: 'processing_error',\n      error: error.message,\n      timestamp: DateTime.now().toISO(),\n      moderationStatus: 'processing_failed',\n      originalPayload: webhookData,\n      requestId: headers['x-request-id'] || crypto.randomUUID()\n    }\n  }];\n}",
          "language": "javaScript"
        }
      },
      "validated": true
    },
    {
      "id": "task_node_4",
      "type": "nodes-base.code",
      "purpose": "Transform data structure using JavaScript",
      "config": {
        "typeVersion": 2,
        "notes": "Transform AI analysis results and social media post data into structured format for database storage and reporting",
        "parameters": {
          "jsCode": "// Transform AI analysis results and social media data for database storage\nconst results = [];\n\nfor (const item of items) {\n  // Extract social media post data and AI analysis results\n  const postData = item.json.postData || item.json;\n  const aiAnalysis = item.json.aiAnalysis || item.json.analysis || {};\n  \n  // Determine content status based on AI analysis\n  const inappropriateScore = aiAnalysis.inappropriateScore || 0;\n  const contentFlags = aiAnalysis.flags || [];\n  const isFlagged = inappropriateScore > 0.7 || contentFlags.length > 0;\n  \n  // Create structured data for database\n  const transformedData = {\n    // Post identification\n    post_id: postData.id || postData.post_id,\n    platform: postData.platform || 'unknown',\n    author: postData.author || postData.username,\n    content: postData.content || postData.text,\n    post_url: postData.url || postData.link,\n    posted_at: postData.created_at || postData.timestamp,\n    \n    // AI Analysis results\n    inappropriate_score: inappropriateScore,\n    content_flags: JSON.stringify(contentFlags),\n    ai_summary: aiAnalysis.summary || '',\n    confidence_level: aiAnalysis.confidence || 0,\n    \n    // Moderation status\n    is_flagged: isFlagged,\n    moderation_status: isFlagged ? 'pending_review' : 'approved',\n    flagged_reason: contentFlags.join(', ') || null,\n    \n    // Processing metadata\n    processed_at: new Date().toISOString(),\n    workflow_run_id: $workflow.id,\n    \n    // Statistics for reporting\n    engagement_metrics: JSON.stringify({\n      likes: postData.likes || 0,\n      shares: postData.shares || 0,\n      comments: postData.comments || 0\n    })\n  };\n  \n  results.push({\n    json: transformedData\n  });\n}\n\nreturn results;",
          "language": "javaScript"
        }
      },
      "validated": true
    },
    {
      "id": "search_node_1",
      "type": "nodes-base.if",
      "purpose": "Route items based on conditions to flag suspicious content",
      "config": {
        "typeVersion": "2.2",
        "notes": "Routes social media posts based on AI analysis results to flag suspicious content for moderation",
        "parameters": {
          "conditions": {
            "conditions": [
              {
                "id": "1",
                "leftValue": "={{ $json.ai_analysis.inappropriate_score }}",
                "rightValue": 0.7,
                "operator": {
                  "type": "number",
                  "operation": "gte"
                }
              },
              {
                "id": "2",
                "leftValue": "={{ $json.ai_analysis.confidence }}",
                "rightValue": 0.8,
                "operator": {
                  "type": "number",
                  "operation": "gte"
                }
              }
            ],
            "combineOperation": "all"
          }
        }
      },
      "validated": true
    },
    {
      "id": "search_node_2",
      "type": "nodes-base.scheduleTrigger",
      "purpose": "Trigger daily digest email generation on schedule",
      "config": {
        "typeVersion": "1.2",
        "notes": "Triggers daily digest email generation for content moderation reports",
        "parameters": {
          "notice": ""
        }
      },
      "validated": true
    },
    {
      "id": "search_node_3",
      "type": "nodes-base.twitter",
      "purpose": "Monitor social media posts for content analysis",
      "config": {
        "typeVersion": "2",
        "notes": "Monitors Twitter for new posts to analyze for inappropriate content using search functionality",
        "parameters": {
          "resource": "tweet",
          "operation": "search",
          "searchText": "#content OR #posts OR lang:en -is:retweet",
          "returnAll": false,
          "limit": 50
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
- **Performance Score:** 20/100
- **Quality Score:** 100/100
- **Completeness Score:** 20/100

### Error Patterns
- **validation** (1 occurrences)
  - Suggested Fix: Review error details and adjust workflow accordingly

### Optimization Suggestions
- Consider optimizing discovery phase (took 20084ms)
- Consider optimizing configuration phase (took 31246ms)
