#!/usr/bin/env tsx

import { MCPClient } from '../lib/mcp-client';

async function testValidation() {
  const mcpClient = MCPClient.getInstance({
    serverUrl: process.env.MCP_SERVER_URL || "https://mcp.smithery.ai",
    apiKey: process.env.MCP_API_KEY || "",
    profile: process.env.MCP_PROFILE || "default"
  });

  // Test workflow with node-level properties in wrong places
  const testWorkflow = {
    name: "Test Workflow",
    nodes: [
      {
        id: "node_1",
        name: "Send to Slack",
        type: "n8n-nodes-base.slack",
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          resource: "message",
          operation: "post",
          select: "channel",
          channelId: "#general",
          text: "Test message",
          // These are in the wrong place - should be at node level
          onError: "continueErrorOutput",
          retryOnFail: true,
          maxTries: 3,
          waitBetweenTries: 1000
        },
        // This is at the correct level
        continueOnFail: true
      }
    ],
    connections: {},
    settings: {
      executionOrder: "v1",
      saveDataSuccessExecution: "all",
      saveDataErrorExecution: "all",
      saveManualExecutions: true
    }
  };

  console.log('Testing workflow validation...\n');
  
  try {
    const result = await mcpClient.callTool('validate_workflow', {
      workflow: testWorkflow,
      options: {
        validateNodes: true,
        validateConnections: true,
        validateExpressions: true,
        profile: 'runtime'
      }
    });

    if (result?.content?.[0]?.type === 'text') {
      const validation = JSON.parse(result.content[0].text);
      
      console.log('Validation result:', {
        valid: validation.valid,
        errorCount: validation.errors?.length || 0,
        warningCount: validation.warnings?.length || 0
      });

      if (validation.errors && validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach((error: any, idx: number) => {
          console.log(`\n${idx + 1}. Error in node: ${error.node}`);
          console.log(`   Message: ${error.message}`);
          if (error.details) {
            console.log('   Details:', JSON.stringify(error.details, null, 2));
          }
        });
      }

      if (validation.warnings && validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach((warning: any, idx: number) => {
          console.log(`\n${idx + 1}. Warning in node: ${warning.node}`);
          console.log(`   Message: ${warning.message}`);
        });
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testValidation().catch(console.error);