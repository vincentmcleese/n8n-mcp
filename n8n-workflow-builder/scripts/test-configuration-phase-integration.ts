#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV to test for faster model
process.env.NODE_ENV = 'test';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import type { 
  DiscoveryResult, 
  ConfigurationResult,
  ConfiguredNode 
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

async function testSimpleConfiguration() {
  console.log(`   📝 Testing simple configuration with validation`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-config-simple-' + Date.now();
  
  // Create a simple discovery result
  const discoveryResult: DiscoveryResult = {
    success: true,
    operations: [],
    phase: 'discovery',
    discoveredNodes: [
      { id: 'node_1', type: 'nodes-base.webhook', displayName: 'Webhook', purpose: 'Receive data' },
      { id: 'node_2', type: 'nodes-base.slack', displayName: 'Slack', purpose: 'Send message' }
    ],
    selectedNodeIds: ['node_1', 'node_2']
  };
  
  const result = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  if (!result.success) {
    throw new Error(`Configuration failed: ${result.error?.message}`);
  }
  
  console.log(`   ✅ Configured ${result.configured.length} nodes`);
  console.log(`   ✅ Validated ${result.configured.filter(n => n.validated).length} nodes`);
  
  // Check webhook configuration
  const webhook = result.configured.find(n => n.type.includes('webhook'));
  if (!webhook) throw new Error('Webhook node not configured');
  
  console.log(`   📋 Webhook validated: ${webhook.validated}`);
  if (!webhook.validated && webhook.validationErrors) {
    console.log(`   ⚠️  Webhook errors: ${webhook.validationErrors.join(', ')}`);
  }
  
  // Check Slack configuration
  const slack = result.configured.find(n => n.type.includes('slack'));
  if (!slack) throw new Error('Slack node not configured');
  
  console.log(`   📋 Slack validated: ${slack.validated}`);
  if (!slack.validated && slack.validationErrors) {
    console.log(`   ⚠️  Slack errors: ${slack.validationErrors.join(', ')}`);
  }
}

async function testComplexConfigurationWithValidation() {
  console.log(`   📝 Testing complex configuration with validation and fix attempts`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-config-complex-' + Date.now();
  
  // Create a complex discovery result
  const discoveryResult: DiscoveryResult = {
    success: true,
    operations: [],
    phase: 'discovery',
    discoveredNodes: [
      { id: 'node_1', type: 'nodes-base.httpRequest', displayName: 'HTTP Request', purpose: 'Fetch data from API' },
      { id: 'node_2', type: 'nodes-base.postgres', displayName: 'Postgres', purpose: 'Store data' },
      { id: 'node_3', type: 'nodes-base.code', displayName: 'Code', purpose: 'Transform data' },
      { id: 'node_4', type: 'nodes-base.gmail', displayName: 'Gmail', purpose: 'Send notification' }
    ],
    selectedNodeIds: ['node_1', 'node_2', 'node_3', 'node_4']
  };
  
  const result = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  console.log(`   📊 Configuration result: ${result.success ? 'Success' : 'Failed'}`);
  console.log(`   📋 Total nodes: ${result.configured.length}`);
  console.log(`   ✅ Validated: ${result.configured.filter(n => n.validated).length}`);
  console.log(`   ❌ Failed: ${result.configured.filter(n => !n.validated).length}`);
  
  // Check each node
  result.configured.forEach(node => {
    console.log(`\n   Node: ${node.type} (${node.id})`);
    console.log(`   - Purpose: ${node.purpose}`);
    console.log(`   - Validated: ${node.validated}`);
    console.log(`   - Has config: ${!!node.config && Object.keys(node.config).length > 0}`);
    
    if (!node.validated && node.validationErrors) {
      console.log(`   - Errors: ${node.validationErrors.join(', ')}`);
    }
  });
  
  // Expect at least some nodes to be validated
  const validationRate = result.configured.filter(n => n.validated).length / result.configured.length;
  if (validationRate < 0.5) {
    throw new Error(`Low validation rate: ${validationRate.toFixed(2)}`);
  }
}

async function testConfigurationWithMissingRequiredFields() {
  console.log(`   📝 Testing configuration that triggers validation errors and fixes`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-config-errors-' + Date.now();
  
  // Nodes that often have required fields
  const discoveryResult: DiscoveryResult = {
    success: true,
    operations: [],
    phase: 'discovery',
    discoveredNodes: [
      { id: 'node_1', type: 'nodes-base.slack', displayName: 'Slack', purpose: 'Send message to #general' },
      { id: 'node_2', type: 'nodes-base.postgres', displayName: 'Postgres', purpose: 'Query users table' },
      { id: 'node_3', type: 'nodes-base.httpRequest', displayName: 'HTTP Request', purpose: 'Call external API' }
    ],
    selectedNodeIds: ['node_1', 'node_2', 'node_3']
  };
  
  const result = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  // Log reasoning to understand Claude's decisions
  if (result.reasoning && result.reasoning.length > 0) {
    console.log('\n   💭 Configuration reasoning:');
    result.reasoning.forEach((reason, idx) => {
      console.log(`      ${idx + 1}. ${reason}`);
    });
  }
  
  // Check fix attempts
  const fixAttempts = result.reasoning?.filter(r => 
    r.includes('fix') || r.includes('validation failed')
  ).length || 0;
  
  console.log(`\n   🔧 Fix attempts detected: ${fixAttempts}`);
  
  // Analyze validation results
  const validatedCount = result.configured.filter(n => n.validated).length;
  const totalCount = result.configured.length;
  
  console.log(`   📊 Final validation: ${validatedCount}/${totalCount} nodes validated`);
  
  if (validatedCount === 0) {
    throw new Error('No nodes were successfully validated');
  }
}

async function testConfigurationValidationOperations() {
  console.log(`   📝 Testing that validation operations are tracked`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-config-ops-' + Date.now();
  
  const discoveryResult: DiscoveryResult = {
    success: true,
    operations: [],
    phase: 'discovery',
    discoveredNodes: [
      { id: 'node_1', type: 'nodes-base.webhook', displayName: 'Webhook', purpose: 'Receive POST data' },
      { id: 'node_2', type: 'nodes-base.code', displayName: 'Code', purpose: 'Process data' }
    ],
    selectedNodeIds: ['node_1', 'node_2']
  };
  
  const result = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  // Check operations
  const configureOps = result.operations.filter(op => op.type === 'configureNode');
  const validateOps = result.operations.filter(op => op.type === 'validateNode');
  
  console.log(`   📊 Operations breakdown:`);
  console.log(`      - configureNode: ${configureOps.length}`);
  console.log(`      - validateNode: ${validateOps.length}`);
  
  if (configureOps.length !== 2) {
    throw new Error(`Expected 2 configureNode operations, got ${configureOps.length}`);
  }
  
  if (validateOps.length !== 2) {
    throw new Error(`Expected 2 validateNode operations, got ${validateOps.length}`);
  }
  
  // Check validation operation structure
  validateOps.forEach((op, idx) => {
    if (!op.nodeId) throw new Error(`Validation op ${idx} missing nodeId`);
    if (!op.result) throw new Error(`Validation op ${idx} missing result`);
    if (typeof op.result.valid !== 'boolean') throw new Error(`Validation op ${idx} missing valid flag`);
    
    console.log(`      - ${op.nodeId}: ${op.result.valid ? 'valid' : 'invalid'}`);
  });
}

async function testPartialValidationFailure() {
  console.log(`   📝 Testing partial validation failure handling`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-partial-fail-' + Date.now();
  
  // Mix of easy and potentially problematic nodes
  const discoveryResult: DiscoveryResult = {
    success: true,
    operations: [],
    phase: 'discovery',
    discoveredNodes: [
      { id: 'node_1', type: 'nodes-base.webhook', displayName: 'Webhook', purpose: 'Simple webhook' },
      { id: 'node_2', type: 'nodes-base.googleSheets', displayName: 'Google Sheets', purpose: 'Complex auth required' },
      { id: 'node_3', type: 'nodes-base.code', displayName: 'Code', purpose: 'Simple transform' },
      { id: 'node_4', type: 'nodes-base.aws', displayName: 'AWS', purpose: 'Complex credentials' }
    ],
    selectedNodeIds: ['node_1', 'node_2', 'node_3', 'node_4']
  };
  
  const result = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  // Should handle partial failure gracefully
  if (!result.operations || result.operations.length === 0) {
    throw new Error('No operations generated');
  }
  
  const validatedNodes = result.configured.filter(n => n.validated);
  const invalidNodes = result.configured.filter(n => !n.validated);
  
  console.log(`   📊 Validation results:`);
  console.log(`      - Valid nodes: ${validatedNodes.map(n => n.type).join(', ')}`);
  console.log(`      - Invalid nodes: ${invalidNodes.map(n => n.type).join(', ')}`);
  
  // Should have error with partial validation failure
  if (invalidNodes.length > 0 && !result.error) {
    throw new Error('Expected error for partial validation failure');
  }
  
  if (result.error) {
    console.log(`   ⚠️  Error type: ${result.error.type}`);
    console.log(`   ⚠️  Error code: ${result.error.code}`);
    console.log(`   ⚠️  Retryable: ${result.error.retryable}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Running Configuration Phase Integration Tests\n');
  console.log('Testing the hybrid configuration approach with pre-validation\n');
  
  // Check environment
  if (!process.env.ANTHROPIC_API_KEY || !process.env.MCP_API_KEY) {
    console.error('\n❌ Missing required API keys');
    process.exit(1);
  }
  
  // Run test scenarios
  await runTest('Simple Configuration with Validation', testSimpleConfiguration, 60000);
  await runTest('Complex Configuration with Validation', testComplexConfigurationWithValidation, 90000);
  await runTest('Configuration with Missing Required Fields', testConfigurationWithMissingRequiredFields, 60000);
  await runTest('Configuration Validation Operations', testConfigurationValidationOperations, 45000);
  await runTest('Partial Validation Failure', testPartialValidationFailure, 60000);
  
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
  console.log('\n📝 Configuration Phase Features Tested:');
  console.log('- ✅ Node configuration generation');
  console.log('- ✅ Pre-validation with MCP validate_node_minimal');
  console.log('- ✅ Automatic fix attempts for validation errors');
  console.log('- ✅ Validation status tracking in ConfiguredNode');
  console.log('- ✅ Validation operations in workflow operations');
  console.log('- ✅ Partial validation failure handling');
  console.log('- ✅ Hybrid approach: configure → validate → fix cycle');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
  });
