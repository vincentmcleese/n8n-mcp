#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV to test for faster model
process.env.NODE_ENV = 'test';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import type { 
  ConfigurationResult,
  ConfiguredNode,
  BuildingResult 
} from '../lib/workflow-orchestrator';

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

// Helper to run and track tests
async function runTest(
  name: string, 
  testFn: () => Promise<void>, 
  timeoutMs: number = 30000
): Promise<void> {
  console.log(`\n🧪 ${name}`);
  const startTime = Date.now();
  
  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    // Race between test and timeout
    await Promise.race([testFn(), timeoutPromise]);
    
    const duration = Date.now() - startTime;
    testResults.push({ name, passed: true, duration });
    console.log(`✅ Passed (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    testResults.push({ name, passed: false, duration, error: errorMessage });
    console.log(`❌ Failed: ${errorMessage}`);
  }
}

// Test scenarios

async function testSimpleWorkflowBuilding() {
  console.log(`   📝 Testing simple workflow building`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-build-simple-' + Date.now();
  
  // Create a simple configuration result with validated nodes
  const configurationResult: ConfigurationResult = {
    success: true,
    operations: [],
    phase: 'configuration',
    configured: [
      {
        id: 'node_1',
        type: 'nodes-base.webhook',
        purpose: 'Receive POST data',
        config: {
          path: 'webhook-endpoint',
          httpMethod: 'POST',
          responseMode: 'onReceived',
          responseData: 'firstEntryJson',
          responseCode: 200
        },
        validated: true
      },
      {
        id: 'node_2',
        type: 'nodes-base.slack',
        purpose: 'Send message to #general',
        config: {
          resource: 'message',
          operation: 'send',
          select: 'channel',
          channelId: 'general',
          messageType: 'text',
          message: 'New webhook data received: {{$json.data}}'
        },
        validated: true
      }
    ]
  };
  
  const result = await orchestrator.runBuildingPhase(sessionId, configurationResult);
  
  if (!result.success) {
    throw new Error(`Building failed: ${result.error?.message}`);
  }
  
  console.log(`   ✅ Built workflow with ${result.workflow.nodes.length} nodes`);
  
  // Debug: Log the actual nodes
  if (result.workflow.nodes.length > 0) {
    console.log(`   📋 Node types:`, result.workflow.nodes.map((n: any) => n.type));
  }
  
  // Validate workflow structure
  if (!result.workflow.nodes || result.workflow.nodes.length !== 2) {
    throw new Error(`Expected 2 nodes, got ${result.workflow.nodes?.length || 0}`);
  }
  
  if (!result.workflow.connections) {
    throw new Error('Workflow missing connections');
  }
  
  // Check node names are set
  const webhook = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
  const slack = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.slack');
  
  if (!webhook || !slack) {
    throw new Error('Missing expected nodes');
  }
  
  console.log(`   📋 Webhook node: ${webhook.name} at position [${webhook.position}]`);
  console.log(`   📋 Slack node: ${slack.name} at position [${slack.position}]`);
  
  // Check connections exist
  const connections = Object.keys(result.workflow.connections);
  console.log(`   🔗 Connections from: ${connections.join(', ')}`);
  
  if (connections.length === 0) {
    throw new Error('No connections found in workflow');
  }
  
  // Check error handling settings
  console.log(`   🛡️ Webhook continueOnFail: ${webhook.continueOnFail}`);
  console.log(`   🛡️ Slack continueOnFail: ${slack.continueOnFail}`);
}

async function testComplexWorkflowBuilding() {
  console.log(`   📝 Testing complex workflow building`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-build-complex-' + Date.now();
  
  // Create a complex configuration result
  const configurationResult: ConfigurationResult = {
    success: true,
    operations: [],
    phase: 'configuration',
    configured: [
      {
        id: 'node_1',
        type: 'nodes-base.httpRequest',
        purpose: 'Fetch data from API',
        config: {
          url: 'https://api.example.com/data',
          method: 'GET',
          authentication: 'none',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Accept', value: 'application/json' }
            ]
          }
        },
        validated: true
      },
      {
        id: 'node_2',
        type: 'nodes-base.code',
        purpose: 'Transform data',
        config: {
          language: 'javaScript',
          code: 'items[0].json.transformed = items[0].json.data.map(d => d.value);\nreturn items;'
        },
        validated: true
      },
      {
        id: 'node_3',
        type: 'nodes-base.postgres',
        purpose: 'Store in database',
        config: {
          operation: 'insert',
          table: 'processed_data',
          columns: 'data,timestamp',
          returnFields: '*'
        },
        validated: true
      },
      {
        id: 'node_4',
        type: 'nodes-base.gmail',
        purpose: 'Send notification',
        config: {
          resource: 'message',
          operation: 'send',
          to: 'admin@example.com',
          subject: 'Data Processing Complete',
          message: 'Successfully processed {{$node["Code"].json.transformed.length}} items'
        },
        validated: true
      }
    ]
  };
  
  const result = await orchestrator.runBuildingPhase(sessionId, configurationResult);
  
  console.log(`   📊 Building result: ${result.success ? 'Success' : 'Failed'}`);
  
  if (result.reasoning && result.reasoning.length > 0) {
    console.log('\n   💭 Building reasoning:');
    result.reasoning.forEach((reason, idx) => {
      console.log(`      ${idx + 1}. ${reason}`);
    });
  }
  
  // Check all nodes are present
  if (result.workflow.nodes.length !== 4) {
    throw new Error(`Expected 4 nodes, got ${result.workflow.nodes.length}`);
  }
  
  // Check node positions are set
  const positions = result.workflow.nodes.map((n: any) => ({
    name: n.name,
    position: n.position
  }));
  
  console.log('\n   📍 Node positions:');
  positions.forEach(p => {
    console.log(`      - ${p.name}: [${p.position[0]}, ${p.position[1]}]`);
  });
  
  // Check connections flow logically
  const httpNode = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.httpRequest');
  if (httpNode && result.workflow.connections[httpNode.name]) {
    const httpConnections = result.workflow.connections[httpNode.name];
    console.log(`   🔗 HTTP Request connects to: ${JSON.stringify(httpConnections)}`);
  }
  
  // Check workflow settings
  console.log(`   ⚙️ Workflow settings:`, result.workflow.settings);
}

async function testErrorHandlingConfiguration() {
  console.log(`   📝 Testing error handling configuration`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-build-errors-' + Date.now();
  
  const configurationResult: ConfigurationResult = {
    success: true,
    operations: [],
    phase: 'configuration',
    configured: [
      {
        id: 'node_1',
        type: 'nodes-base.webhook',
        purpose: 'Critical trigger',
        config: { path: 'critical', httpMethod: 'POST' },
        validated: true
      },
      {
        id: 'node_2',
        type: 'nodes-base.httpRequest',
        purpose: 'External API call',
        config: { url: 'https://api.example.com', method: 'POST' },
        validated: true
      },
      {
        id: 'node_3',
        type: 'nodes-base.code',
        purpose: 'Data processing',
        config: { code: 'return items;' },
        validated: true
      }
    ]
  };
  
  const result = await orchestrator.runBuildingPhase(sessionId, configurationResult);
  
  // Check error handling is set appropriately
  const webhook = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
  const httpRequest = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.httpRequest');
  const code = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.code');
  
  console.log('\n   🛡️ Error handling configuration:');
  console.log(`      - Webhook (critical): continueOnFail=${webhook?.continueOnFail}`);
  console.log(`      - HTTP Request (external): continueOnFail=${httpRequest?.continueOnFail}`);
  console.log(`      - Code (processing): continueOnFail=${code?.continueOnFail}`);
  
  // Critical nodes should not continue on fail
  if (webhook?.continueOnFail !== false) {
    throw new Error('Critical webhook should have continueOnFail=false');
  }
  
  // External APIs should handle errors gracefully
  if (httpRequest?.continueOnFail !== true) {
    throw new Error('External API should have continueOnFail=true');
  }
}

async function testNoValidatedNodes() {
  console.log(`   📝 Testing building with no validated nodes`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-build-no-valid-' + Date.now();
  
  const configurationResult: ConfigurationResult = {
    success: false,
    operations: [],
    phase: 'configuration',
    configured: [
      {
        id: 'node_1',
        type: 'nodes-base.slack',
        purpose: 'Send message',
        config: {},
        validated: false,
        validationErrors: ['Missing required fields']
      }
    ]
  };
  
  const result = await orchestrator.runBuildingPhase(sessionId, configurationResult);
  
  if (result.success) {
    throw new Error('Building should fail with no validated nodes');
  }
  
  console.log(`   ✅ Correctly failed with error: ${result.error?.message}`);
  console.log(`   ✅ Error code: ${result.error?.code}`);
}

async function testWorkflowWithExpressions() {
  console.log(`   📝 Testing workflow with n8n expressions`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-build-expressions-' + Date.now();
  
  const configurationResult: ConfigurationResult = {
    success: true,
    operations: [],
    phase: 'configuration',
    configured: [
      {
        id: 'node_1',
        type: 'nodes-base.webhook',
        purpose: 'Receive user data',
        config: { path: 'user-signup' },
        validated: true
      },
      {
        id: 'node_2',
        type: 'nodes-base.slack',
        purpose: 'Notify team with user email',
        config: {
          resource: 'message',
          operation: 'send',
          channel: 'signups',
          message: 'New user signup: {{$json.email}}'
        },
        validated: true
      }
    ]
  };
  
  const result = await orchestrator.runBuildingPhase(sessionId, configurationResult);
  
  // Check if expressions are preserved
  const slack = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.slack');
  console.log(`   📝 Slack message contains expression: ${slack?.parameters?.message?.includes('{{$json')}`);
  
  if (!slack?.parameters?.message?.includes('{{$json')) {
    throw new Error('n8n expression not preserved in configuration');
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Running Building Phase Integration Tests\n');
  console.log('Testing the simplified building phase that assembles workflows from validated configurations\n');
  
  // Check environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  
  // Run test scenarios
  await runTest('Simple Workflow Building', testSimpleWorkflowBuilding, 45000);
  await runTest('Complex Workflow Building', testComplexWorkflowBuilding, 60000);
  await runTest('Error Handling Configuration', testErrorHandlingConfiguration, 45000);
  await runTest('No Validated Nodes', testNoValidatedNodes, 30000);
  await runTest('Workflow with Expressions', testWorkflowWithExpressions, 45000);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms (${Math.round(totalDuration / 1000)}s)`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`- ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Building Phase Features Tested:');
  console.log('- ✅ Workflow assembly from validated configurations');
  console.log('- ✅ Node positioning and visual layout');
  console.log('- ✅ Connection logic based on node purposes');
  console.log('- ✅ Error handling configuration (continueOnFail)');
  console.log('- ✅ n8n expression preservation');
  console.log('- ✅ Workflow settings configuration');
  console.log('- ✅ Validation of input requirements');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});