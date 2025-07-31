#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';

async function testValidationCycle() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Create the exact workflow from the user's example - it has both errors
  const testWorkflow = {
    name: "Webhook to Slack Message Workflow",
    nodes: [
      {
        id: "node_1",
        name: "Webhook Trigger",
        type: "n8n-nodes-base.webhook",
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          path: "webhook-trigger",
          httpMethod: "POST",
          responseMode: "onReceived",
          authentication: "none"
        },
        continueOnFail: false
      },
      {
        id: "node_2",
        name: "Send to Slack",
        type: "n8n-nodes-base.slack",
        typeVersion: 1,
        position: [550, 300],
        parameters: {
          resource: "message",
          operation: "post",
          select: "channel",
          channelId: "={{ $json.channel || '#general' }}",
          text: "={{ $json.message || 'Webhook received: ' + JSON.stringify($json) }}",
          messageType: "text"
        },
        continueOnFail: false,  // This conflicts with onError!
        onError: "stopWorkflow",
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 1000
      },
      {
        id: "node_3",
        name: "Webhook Response",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1,
        position: [850, 300],
        parameters: {
          respondWith: "json",
          responseBody: "={{ { \"status\": \"success\", \"message\": \"Slack message sent\", \"timestamp\": new Date().toISOString() } }}"
        },
        continueOnFail: false
      }
    ],
    connections: {
      "Webhook Trigger": {
        main: [[{
          node: "Send to Slack",
          type: "main",
          index: 0
        }]]
      },
      "Send to Slack": {
        main: [[{
          node: "Webhook Response",
          type: "main",
          index: 0
        }]]
      }
    },
    settings: {
      executionOrder: "v1",
      saveDataSuccessExecution: "all",
      saveDataErrorExecution: "all",
      saveManualExecutions: true
    },
    valid: false
  };

  console.log('🔄 Testing validation cycle (like n8n-mcp)...\n');
  console.log('Initial workflow has:');
  console.log('- Send to Slack node with BOTH continueOnFail and onError (conflict!)');
  console.log('- All nodes using continueOnFail instead of modern onError\n');
  
  const result = await orchestrator.runValidationPhase('test-session', {
    success: true,
    phase: 'building',
    workflow: testWorkflow
  });

  console.log('\n📊 Validation Results:');
  console.log('- Success:', result.success);
  console.log('- Workflow valid:', result.workflow.valid);
  console.log('- Validation attempts:', result.validationReport?.attempts || 0);
  console.log('- Total fixes applied:', result.validationReport?.fixesApplied?.length || 0);
  
  if (result.validationReport?.fixesApplied && result.validationReport.fixesApplied.length > 0) {
    console.log('\n🔧 Fixes applied:');
    const fixesByType = result.validationReport.fixesApplied.reduce((acc: any, fix: any) => {
      const key = `${fix.type}: ${fix.field || fix.from || 'n/a'}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(fixesByType).forEach(([fixType, count]) => {
      console.log(`  - ${fixType} (${count}x)`);
    });
  }

  // Check specific fixes
  console.log('\n✅ Verification:');
  const slackNode = result.workflow.nodes.find((n: any) => n.name === 'Send to Slack');
  if (slackNode) {
    console.log('Send to Slack node:');
    console.log('  - Has continueOnFail:', 'continueOnFail' in slackNode);
    console.log('  - Has onError:', 'onError' in slackNode);
    console.log('  - onError value:', slackNode.onError);
  }

  // Final validation status
  if (result.workflow.valid) {
    console.log('\n🎉 Workflow is now VALID and ready for n8n!');
  } else {
    console.log('\n⚠️  Workflow still has validation issues');
    if (result.validationReport?.final?.workflow?.errors) {
      console.log('Remaining errors:', result.validationReport.final.workflow.errors);
    }
  }

  // Save the valid workflow
  if (result.workflow.valid) {
    const fs = require('fs');
    fs.writeFileSync(
      'validated-workflow.json',
      JSON.stringify(result.workflow, null, 2)
    );
    console.log('\n💾 Valid workflow saved to validated-workflow.json');
  }
}

testValidationCycle().catch(console.error);