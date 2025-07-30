#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV to test for faster model
process.env.NODE_ENV = 'test';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';

async function testSingleScenario() {
  console.log('🚀 Testing Single Validation Scenario\n');
  
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-validation-single-' + Date.now();
  
  const brokenWorkflow = {
    name: 'Test Workflow - Missing Fields',
    nodes: [
      {
        id: 'webhook_1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          // Missing required 'path' parameter
          httpMethod: 'POST',
          responseMode: 'onReceived'
        }
      },
      {
        id: 'http_1',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [450, 300],
        parameters: {
          // Missing required 'url' parameter
          method: 'GET',
          authentication: 'none'
        }
      },
      {
        id: 'slack_1',
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        position: [650, 300],
        parameters: {
          resource: 'message',
          operation: 'send',
          messageType: 'text',
          message: 'Test message'
        }
      }
    ],
    connections: {
      'Webhook': {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
      },
      'HTTP Request': {
        main: [[{ node: 'Slack', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1'
    }
  };
  
  try {
    console.log('Running validation phase...');
    const result = await orchestrator.runValidationPhase(sessionId, {
      success: true,
      phase: 'building',
      workflow: brokenWorkflow
    });
    
    console.log('\nValidation completed!');
    console.log('Success:', result.success);
    console.log('Workflow valid:', result.workflow?.valid);
    
    if (result.validationReport?.fixesApplied) {
      console.log('\nFixes applied:', result.validationReport.fixesApplied.length);
      result.validationReport.fixesApplied.forEach((fix: any, idx: number) => {
        console.log(`${idx + 1}. ${fix.type}: ${fix.description}`);
      });
    }
    
    // Check specific fixes
    const webhook = result.workflow?.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
    console.log('\nWebhook path added:', !!webhook?.parameters?.path);
    
    const http = result.workflow?.nodes.find((n: any) => n.type === 'n8n-nodes-base.httpRequest');
    console.log('HTTP URL added:', !!http?.parameters?.url);
    
    const slack = result.workflow?.nodes.find((n: any) => n.type === 'n8n-nodes-base.slack');
    console.log('Slack config:', JSON.stringify(slack?.parameters, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSingleScenario().catch(console.error);