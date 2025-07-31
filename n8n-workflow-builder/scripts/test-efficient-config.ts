#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';

async function testEfficientConfiguration() {
  const orchestrator = new WorkflowOrchestrator();
  
  console.log('🧪 Testing Efficient Configuration (No Property Guessing)\n');
  
  // Test 1: Slack message with task template
  console.log('📋 Test 1: Slack Message (Should use task template)');
  console.log('Expected: No property searches, just template fetch\n');
  
  const discoveryResult1 = {
    success: true,
    phase: 'discovery' as const,
    operations: [],
    selectedNodeIds: ['node_1'],
    discoveredNodes: [
      {
        id: 'node_1',
        type: 'nodes-base.slack',
        displayName: 'Slack',
        purpose: 'Send message to #general channel'
      }
    ]
  };
  
  const startTime1 = Date.now();
  const configResult1 = await orchestrator.runConfigurationPhase(
    'test-slack-' + Date.now(),
    discoveryResult1
  );
  const duration1 = Date.now() - startTime1;
  
  console.log(`✅ Configuration completed in ${duration1}ms`);
  console.log(`📊 Nodes configured: ${configResult1.configured.length}`);
  console.log(`✓ All validated: ${configResult1.configured.every(n => n.validated)}\n`);
  
  // Test 2: Complex IF node (no task template)
  console.log('📋 Test 2: IF Node (Should only search for conditions)');
  console.log('Expected: Only search for properties NOT in essentials\n');
  
  const discoveryResult2 = {
    success: true,
    phase: 'discovery' as const,
    operations: [],
    selectedNodeIds: ['node_2'],
    discoveredNodes: [
      {
        id: 'node_2',
        type: 'nodes-base.if',
        displayName: 'If',
        purpose: 'Check if score is greater than 80'
      }
    ]
  };
  
  const startTime2 = Date.now();
  const configResult2 = await orchestrator.runConfigurationPhase(
    'test-if-' + Date.now(),
    discoveryResult2
  );
  const duration2 = Date.now() - startTime2;
  
  console.log(`✅ Configuration completed in ${duration2}ms`);
  console.log(`📊 Nodes configured: ${configResult2.configured.length}`);
  console.log(`✓ All validated: ${configResult2.configured.every(n => n.validated)}\n`);
  
  // Test 3: HTTP Request with webhook task
  console.log('📋 Test 3: HTTP Request (Should use webhook task template)');
  console.log('Expected: Template fetch only\n');
  
  const discoveryResult3 = {
    success: true,
    phase: 'discovery' as const,
    operations: [],
    selectedNodeIds: ['node_3'],
    discoveredNodes: [
      {
        id: 'node_3',
        type: 'nodes-base.httpRequest',
        displayName: 'HTTP Request',
        purpose: 'Receive webhook POST data'
      }
    ]
  };
  
  const startTime3 = Date.now();
  const configResult3 = await orchestrator.runConfigurationPhase(
    'test-http-' + Date.now(),
    discoveryResult3
  );
  const duration3 = Date.now() - startTime3;
  
  console.log(`✅ Configuration completed in ${duration3}ms`);
  console.log(`📊 Nodes configured: ${configResult3.configured.length}`);
  console.log(`✓ All validated: ${configResult3.configured.every(n => n.validated)}\n`);
  
  // Summary
  console.log('📊 Efficiency Summary:');
  console.log(`- Slack (with template): ${duration1}ms`);
  console.log(`- IF (no template): ${duration2}ms`);
  console.log(`- HTTP (with template): ${duration3}ms`);
  console.log(`- Average time: ${Math.round((duration1 + duration2 + duration3) / 3)}ms`);
  
  // Check for unnecessary searches in logs
  console.log('\n💡 Optimization Notes:');
  console.log('- Task templates should eliminate property searches');
  console.log('- Essentials should provide most needed properties');
  console.log('- Only search for properties explicitly needed and not in essentials');
}

testEfficientConfiguration().catch(console.error);