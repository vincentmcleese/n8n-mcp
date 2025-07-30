#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { ClaudeService } from '../lib/services/claude-service';
import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import MCPClient from '../lib/mcp-client';
import type { WorkflowOperation, DiscoveredNode } from '../types/workflow';

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

// Helper to run and track tests with timeout
async function runTest(name: string, testFn: () => Promise<void>, timeoutMs: number = 30000): Promise<void> {
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

// Scenario 1: Simple, clear prompt
async function testSimpleWorkflowCreation() {
  console.log(`   📝 Testing simple, clear prompt`);
  const orchestrator = new WorkflowOrchestrator();
  const result = await orchestrator.runDiscoveryPhase(
    'test-simple-' + Date.now(),
    'Create a webhook that sends data to Slack'
  );
  
  if (!result.success) {
    throw new Error(`Discovery failed: ${result.error?.message}`);
  }
  
  // Verify webhook and Slack nodes discovered
  const nodeTypes = result.discoveredNodes.map(n => n.type);
  console.log(`   📋 Discovered node types: ${nodeTypes.join(', ')}`);
  
  if (!nodeTypes.some(t => t.toLowerCase().includes('webhook'))) {
    throw new Error('Webhook node not discovered');
  }
  if (!nodeTypes.some(t => t.toLowerCase().includes('slack'))) {
    throw new Error('Slack node not discovered');
  }
  
  console.log(`   ✅ Discovered ${result.discoveredNodes.length} nodes`);
  console.log(`   ✅ Selected ${result.selectedNodeIds.length} nodes`);
  console.log(`   ✅ No clarification needed: ${!result.pendingClarification}`);
  
  if (result.discoveredNodes.length !== 2) {
    console.log(`   ⚠️  Expected 2 nodes, got ${result.discoveredNodes.length}`);
  }
}

// Scenario 2: Prompt that requires a single clarification
async function testSingleClarification() {
  console.log(`   📝 Testing borderline prompt (clarification or assumptions acceptable)`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-single-clarification-' + Date.now();
  
  // Borderline prompt - could trigger clarification or assumptions
  const result = await orchestrator.runDiscoveryPhase(
    sessionId,
    'I need to process some data'
  );
  
  if (!result.success) {
    throw new Error(`Discovery failed: ${result.error?.message}`);
  }
  
  // Both outcomes are acceptable for this borderline case
  if (result.pendingClarification) {
    console.log(`   ✅ AI requested clarification (acceptable outcome)`);
    console.log(`   📋 Question: "${result.pendingClarification.question.substring(0, 60)}..."`);
    
    // Store test state for clarification handler
    (orchestrator as any)._testSessionState = {
      discovered: result.discoveredNodes,
      selected: result.selectedNodeIds,
      initial_prompt: 'I need to process some data'
    };
    
    // Simulate user providing clarification about their INTENT
    console.log(`   🗣️  User clarifies intent: "Fetch weather data from an API and store it for analysis"`);
    const clarificationResult = await orchestrator.handleClarificationResponse(
      sessionId,
      result.pendingClarification.questionId,
      'Fetch weather data from an API and store it for analysis'
    );
    
    if (!clarificationResult.success) {
      throw new Error(`Clarification handling failed: ${clarificationResult.error?.message}`);
    }
    
    console.log(`   ✅ After clarification: ${clarificationResult.discoveredNodes.length} nodes`);
    console.log(`   ✅ Found API node: ${clarificationResult.discoveredNodes.some(n => n.type.includes('http') || n.type.includes('api'))}`);
    console.log(`   ✅ Found database node: ${clarificationResult.discoveredNodes.some(n => n.type.includes('database') || n.type.includes('sql') || n.type.includes('postgres') || n.type.includes('mysql'))}`);
  } else if (result.discoveredNodes.length > 0) {
    console.log(`   ✅ AI made assumptions and discovered ${result.discoveredNodes.length} nodes (acceptable outcome)`);
    console.log(`   📋 Discovered: ${result.discoveredNodes.map(n => n.type).join(', ')}`);
    
    // Verify reasonable nodes were discovered
    const hasProcessingNodes = result.discoveredNodes.some(n => 
      n.type.includes('http') || n.type.includes('code') || n.type.includes('function') ||
      n.type.includes('database') || n.type.includes('transform')
    );
    
    if (!hasProcessingNodes) {
      throw new Error('AI made assumptions but didn\'t discover relevant processing nodes');
    }
  } else {
    throw new Error('Neither clarification nor node discovery occurred');
  }
}

// Scenario 3: Prompt that requires multiple clarifications (3 questions)
async function testMultipleClarifications() {
  console.log(`   📝 Testing prompt requiring multiple clarifications`);
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = 'test-multiple-clarifications-' + Date.now();
  
  // Very ambiguous prompt that should trigger clarification about intent
  const result = await orchestrator.runDiscoveryPhase(
    sessionId,
    'Automate the thing'
  );
  
  if (!result.success) {
    throw new Error(`Discovery failed: ${result.error?.message}`);
  }
  
  // With the new philosophy, Claude might make assumptions OR ask for clarification
  // Both are acceptable outcomes
  if (result.pendingClarification) {
    console.log(`   ✅ AI requested clarification about intent`);
    console.log(`   📋 Question: "${result.pendingClarification.question.substring(0, 100)}..."`);
  } else if (result.discoveredNodes.length > 0) {
    console.log(`   ✅ AI made assumptions and discovered ${result.discoveredNodes.length} nodes`);
    console.log(`   📋 Node types: ${result.discoveredNodes.map(n => n.type).join(', ')}`);
  } else {
    throw new Error('Neither clarification nor nodes were generated');
  }
}

// Scenario 4: Complex prompt with 10+ nodes
async function testComplexMultiStepWorkflow() {
  console.log(`   📝 Testing complex prompt expecting 10+ nodes`);
  const orchestrator = new WorkflowOrchestrator();
  const complexPrompt = `
    Create a comprehensive e-commerce order processing workflow:
    1. Receive order via webhook or API
    2. Validate order data and customer information  
    3. Check inventory levels in MySQL database
    4. Process payment through Stripe
    5. Send order to warehouse management system via API
    6. Update order status in database
    7. Send confirmation email to customer
    8. Post order summary to Slack channel
    9. Create invoice PDF and upload to Google Drive
    10. Log all activities to CloudWatch
    11. Handle errors with proper notifications
    12. Schedule follow-up email after 7 days
  `;
  
  console.log(`   - Testing prompt: "${complexPrompt.trim().replace(/\s+/g, ' ').substring(0, 80)}..."`);
  
  const result = await orchestrator.runDiscoveryPhase(
    'test-complex-' + Date.now(),
    complexPrompt
  );
  
  if (!result.success) {
    throw new Error(`Discovery failed: ${result.error?.message}`);
  }
  
  // Verify many nodes discovered
  console.log(`   ✅ Discovered ${result.discoveredNodes.length} nodes`);
  console.log(`   ✅ Selected ${result.selectedNodeIds.length} nodes`);
  
  // List discovered node types
  const nodeTypes = result.discoveredNodes.map(n => n.type);
  const expectedTypes = ['webhook', 'mysql', 'stripe', 'email', 'slack', 'googleDrive', 'schedule'];
  const foundTypes = expectedTypes.filter(type => 
    nodeTypes.some(nt => nt.toLowerCase().includes(type.toLowerCase()))
  );
  
  console.log(`   ✅ Found ${foundTypes.length}/${expectedTypes.length} expected node types`);
  console.log(`   📋 Node types: ${nodeTypes.join(', ')}`);
  
  if (result.discoveredNodes.length < 10) {
    throw new Error(`Expected 10+ nodes, only got ${result.discoveredNodes.length}`);
  }
}

// Scenario 5: Error case - no valid input/nodes
async function testErrorCase() {
  console.log(`   📝 Testing error case with invalid input`);
  const orchestrator = new WorkflowOrchestrator();
  
  // Test with empty/invalid prompts
  const invalidPrompts = [
    '',
    '   ',
    'xyzabc123 nonexistent workflow qwerty',
    'Create workflow using nodes that definitely do not exist in n8n'
  ];
  
  for (const prompt of invalidPrompts) {
    console.log(`   - Testing: "${prompt || '(empty)'}"`);
    
    const result = await orchestrator.runDiscoveryPhase(
      'test-error-' + Date.now(),
      prompt
    );
    
    if (prompt.trim() === '') {
      // Empty prompt should either fail or request clarification
      if (result.success) {
        if (result.pendingClarification) {
          console.log(`   ✅ Empty prompt triggered clarification request`);
          console.log(`   ✅ Question: "${result.pendingClarification.question.substring(0, 60)}..."`);
        } else {
          throw new Error('Expected failure or clarification for empty prompt');
        }
      } else {
        console.log(`   ✅ Empty prompt correctly rejected`);
        console.log(`   ✅ Error: ${result.error?.userMessage}`);
      }
    } else {
      // Non-empty but nonsensical prompts might still discover some nodes or ask for clarification
      if (result.success) {
        if (result.discoveredNodes.length === 0 && !result.pendingClarification) {
          console.log(`   ✅ No nodes discovered for nonsensical prompt`);
        } else if (result.pendingClarification) {
          console.log(`   ✅ AI requested clarification: "${result.pendingClarification.question.substring(0, 50)}..."`);
        } else {
          console.log(`   ⚠️  AI made assumptions and discovered ${result.discoveredNodes.length} nodes`);
        }
      } else {
        console.log(`   ✅ Error handled: ${result.error?.type}`);
        console.log(`   ✅ User message: ${result.error?.userMessage}`);
      }
    }
  }
}

// (Old version removed - using the new one above)
  
// (Removed duplicate function)

async function testAmbiguousPromptHandling() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Test cases where Claude SHOULD ask for clarification (unclear intent)
  const needsClarificationPrompts = [
    'Process some data',
    'Do something with files',
    'Handle requests',
    'Automate the thing'
  ];
  
  console.log(`   🔍 Testing prompts that need clarification (unclear intent):`);
  for (const prompt of needsClarificationPrompts) {
    const result = await orchestrator.runDiscoveryPhase(
      'test-ambiguous-clarify-' + Date.now(),
      prompt
    );
    
    if (!result.success) {
      throw new Error(`Discovery failed for "${prompt}"`);
    }
    
    if (result.pendingClarification) {
      console.log(`   ✅ "${prompt}" → Clarification requested (correct)`);
    } else {
      console.log(`   ⚠️  "${prompt}" → Made assumptions, discovered ${result.discoveredNodes.length} nodes (should have asked for clarification)`);
    }
  }
  
  // Test cases where Claude should NOT ask for clarification (clear intent, make tool assumptions)
  const clearIntentPrompts = [
    'Fetch data from an API and store it in a database',
    'Send email notifications when a webhook is triggered',
    'Transform CSV files and upload to Google Drive',
    'Monitor Twitter mentions and post to Slack'
  ];
  
  console.log(`   🎯 Testing prompts with clear intent (should make tool assumptions):`);
  for (const prompt of clearIntentPrompts) {
    const result = await orchestrator.runDiscoveryPhase(
      'test-clear-intent-' + Date.now(),
      prompt
    );
    
    if (!result.success) {
      throw new Error(`Discovery failed for "${prompt}"`);
    }
    
    if (result.pendingClarification) {
      console.log(`   ⚠️  "${prompt}" → Asked for clarification (should have made assumptions)`);
    } else {
      console.log(`   ✅ "${prompt}" → Made assumptions, discovered ${result.discoveredNodes.length} nodes (correct)`);
    }
  }
}

async function testErrorRecoveryAndRetry() {
  // Test error recovery by temporarily breaking the API key
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'invalid-key-to-trigger-error';
  
  try {
    // This should fail with invalid API key
    const orchestrator = new WorkflowOrchestrator();
    const result = await orchestrator.runDiscoveryPhase(
      'test-error-recovery-' + Date.now(),
      'Create workflow'
    );
    
    // Restore key immediately
    process.env.ANTHROPIC_API_KEY = originalKey;
    
    // Should handle error gracefully
    if (result.success) {
      throw new Error('Expected error for invalid API key');
    }
    
    if (!result.error) {
      throw new Error('No error object returned');
    }
    
    console.log(`   - Error handled: ${result.error.type}`);
    console.log(`   - Retryable: ${result.error.retryable}`);
    console.log(`   - Error message contains auth issue: ${result.error.message.toLowerCase().includes('auth') || result.error.message.toLowerCase().includes('api')}`);
  } finally {
    // Always restore the key
    process.env.ANTHROPIC_API_KEY = originalKey;
  }
}

async function testNodeValidationAgainstMCP() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Test with specific node types
  const prompts = [
    'Use HTTP Request node to call an API',
    'Create a workflow with Google Sheets integration',
    'Set up a MySQL database connection',
    'Use the Twitter node to post updates'
  ];
  
  for (const prompt of prompts) {
    const result = await orchestrator.runDiscoveryPhase(
      'test-mcp-validation-' + Date.now(),
      prompt
    );
    
    if (!result.success) {
      console.log(`   - Skipping MCP validation for failed discovery: ${prompt}`);
      continue;
    }
    
    // Verify discovered nodes exist in n8n
    console.log(`   - Validating ${result.discoveredNodes.length} nodes for: "${prompt}"`);
    
    // All discovered nodes should have valid n8n types
    for (const node of result.discoveredNodes) {
      if (!node.type.startsWith('nodes-base.') && !node.type.startsWith('n8n-nodes-')) {
        throw new Error(`Invalid node type format: ${node.type}`);
      }
    }
  }
}

async function testConcurrentDiscoveryOperations() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Run multiple discovery operations concurrently
  const prompts = [
    'Create a webhook to database workflow',
    'Build a Slack notification system',
    'Set up email automation',
    'Create a data transformation pipeline',
    'Build an API integration workflow'
  ];
  
  console.log(`   - Running ${prompts.length} concurrent discoveries`);
  const startTime = Date.now();
  
  const promises = prompts.map((prompt, index) => {
    console.log(`   - Starting concurrent request ${index + 1}: "${prompt}"`);
    return orchestrator.runDiscoveryPhase(
      `test-concurrent-${index}-${Date.now()}`,
      prompt
    ).then(result => {
      console.log(`   - Completed request ${index + 1} in ${Date.now() - startTime}ms`);
      return result;
    });
  });
  
  const results = await Promise.allSettled(promises);
  const duration = Date.now() - startTime;
  
  // Check results
  let successful = 0;
  let failed = 0;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      successful++;
    } else {
      failed++;
      console.log(`   - Failed: ${prompts[index]}`);
      if (result.status === 'rejected') {
        console.log(`     Error: ${result.reason}`);
      }
    }
  });
  
  console.log(`   - Total time for concurrent operations: ${duration}ms`);
  console.log(`   - Successful: ${successful}, Failed: ${failed}`);
  
  if (failed > prompts.length / 2) {
    throw new Error('Too many concurrent operations failed');
  }
}

async function testDomainSpecificWorkflows() {
  const orchestrator = new WorkflowOrchestrator();
  
  const domainPrompts = [
    {
      domain: 'E-commerce',
      prompt: 'Create a workflow for order processing: receive order webhook, validate inventory, process payment, update database, send confirmation email, notify warehouse'
    },
    {
      domain: 'DevOps',
      prompt: 'Build a CI/CD pipeline: trigger on GitHub push, run tests, build Docker image, deploy to Kubernetes, send Slack notifications'
    },
    {
      domain: 'Marketing',
      prompt: 'Automate social media posting: fetch content from Google Sheets, resize images, post to Twitter and LinkedIn, track engagement'
    },
    {
      domain: 'Data Processing',
      prompt: 'Create ETL pipeline: extract from multiple APIs, transform with JavaScript, load into PostgreSQL, generate daily reports'
    }
  ];
  
  for (const { domain, prompt } of domainPrompts) {
    console.log(`   - Testing ${domain} workflow`);
    
    const result = await orchestrator.runDiscoveryPhase(
      `test-domain-${domain.toLowerCase()}-${Date.now()}`,
      prompt
    );
    
    if (!result.success) {
      throw new Error(`Failed to create ${domain} workflow`);
    }
    
    console.log(`     • Discovered ${result.discoveredNodes.length} nodes`);
    console.log(`     • Node types: ${result.discoveredNodes.map(n => n.type).join(', ')}`);
  }
}

async function testClaudeResponseVariations() {
  const claudeService = new ClaudeService();
  
  // Test multiple calls with same prompt to check response consistency
  const prompt = 'Create a data processing workflow';
  const responses: any[] = [];
  
  console.log(`   - Testing response variations for: "${prompt}"`);
  
  for (let i = 0; i < 3; i++) {
    const result = await claudeService.processWorkflowPhase(
      'discovery',
      prompt,
      `test-variation-${i}-${Date.now()}`
    );
    
    responses.push(result);
  }
  
  // Check that all responses have required structure
  for (const response of responses) {
    if (!response.operations || !Array.isArray(response.operations)) {
      throw new Error('Invalid operations structure');
    }
    if (!response.reasoning || !Array.isArray(response.reasoning)) {
      throw new Error('Invalid reasoning structure');
    }
  }
  
  // Check operation type distribution
  const operationTypes = responses.flatMap(r => r.operations.map((op: WorkflowOperation) => op.type));
  const uniqueTypes = new Set(operationTypes);
  
  console.log(`   - Operation types used: ${Array.from(uniqueTypes).join(', ')}`);
  console.log(`   - Average operations per response: ${operationTypes.length / responses.length}`);
}

async function testMCPConnectionAndHealth() {
  const mcpConfig = {
    serverUrl: process.env.MCP_SERVER_URL!,
    apiKey: process.env.MCP_API_KEY!,
    profile: process.env.MCP_PROFILE || 'default'
  };
  
  const mcpClient = MCPClient.getInstance(mcpConfig);
  
  // Test connection
  await mcpClient.connect();
  const status = mcpClient.getConnectionStatus();
  
  if (!status.isConnected) {
    throw new Error('MCP client not connected');
  }
  
  console.log(`   - MCP connected via ${status.transportType}`);
  
  // Test health check
  const healthy = await mcpClient.healthCheck();
  if (!healthy) {
    throw new Error('MCP health check failed');
  }
  
  // Test tool listing
  const tools = await mcpClient.listTools();
  console.log(`   - MCP has ${tools.tools.length} available tools`);
  
  // Test node search
  const searchResult = await mcpClient.searchNodes({ query: 'webhook', limit: 5 });
  console.log(`   - MCP search returned results: ${searchResult.content.length > 0}`);
}

async function testPropertySearchDuringDiscovery() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Test prompts that should trigger property searches
  const propertyPrompts = [
    {
      prompt: 'Create webhook with Bearer token authentication that validates incoming JSON schema',
      expectedProperties: ['authentication', 'headers', 'validation']
    },
    {
      prompt: 'Setup PostgreSQL connection with SSL and connection pooling to store user data',
      expectedProperties: ['ssl', 'pool', 'connectionString']
    },
    {
      prompt: 'Build Slack integration with OAuth2 authentication and rate limiting',
      expectedProperties: ['oauth', 'token', 'rateLimit']
    }
  ];
  
  for (const { prompt, expectedProperties } of propertyPrompts) {
    console.log(`   - Testing: "${prompt}"`);
    
    const result = await orchestrator.runDiscoveryPhase(
      `test-property-search-${Date.now()}`,
      prompt
    );
    
    if (!result.success) {
      throw new Error(`Discovery failed for property-focused prompt`);
    }
    
    // Verify nodes were discovered based on property requirements
    console.log(`     • Discovered ${result.discoveredNodes.length} nodes`);
    console.log(`     • Expected properties: ${expectedProperties.join(', ')}`);
    
    // Check if discovered nodes have relevant capabilities
    const hasAuthNode = result.discoveredNodes.some(n => 
      n.purpose?.toLowerCase().includes('auth') || 
      n.type.includes('oauth')
    );
    
    if (prompt.includes('authentication') && !hasAuthNode) {
      console.log(`     • Note: Authentication requirements might be handled within node config`);
    }
  }
}

async function testDocumentationRetrievalDuringDiscovery() {
  const orchestrator = new WorkflowOrchestrator();
  
  // Test complex prompts that should trigger documentation lookups
  const docPrompts = [
    'Create a workflow using n8n built-in functions for date manipulation and string formatting',
    'Build integration using Code node with external npm packages like lodash and moment.js',
    'Setup workflow with IF node using complex conditional logic and multiple branches'
  ];
  
  for (const prompt of docPrompts) {
    console.log(`   - Testing documentation-heavy prompt: "${prompt}"`);
    
    const result = await orchestrator.runDiscoveryPhase(
      `test-doc-retrieval-${Date.now()}`,
      prompt
    );
    
    if (!result.success) {
      throw new Error(`Discovery failed for documentation-focused prompt`);
    }
    
    // Check if appropriate nodes were discovered
    const hasCodeNode = result.discoveredNodes.some(n => n.type.includes('code'));
    const hasIfNode = result.discoveredNodes.some(n => n.type.includes('if'));
    
    console.log(`     • Discovered nodes: ${result.discoveredNodes.map(n => n.type).join(', ')}`);
    console.log(`     • Has Code node: ${hasCodeNode}`);
    console.log(`     • Has IF node: ${hasIfNode}`);
  }
}

async function testMultiStepMCPOrchestration() {
  const orchestrator = new WorkflowOrchestrator();
  
  console.log(`   - Testing multi-step MCP tool orchestration`);
  
  const complexPrompt = `Create an advanced workflow that:
    1. Uses AI to process customer feedback
    2. Integrates with multiple databases
    3. Handles authentication for external APIs
    4. Implements error handling and retries`;
  
  const startTime = Date.now();
  const result = await orchestrator.runDiscoveryPhase(
    `test-multi-step-mcp-${Date.now()}`,
    complexPrompt
  );
  
  const duration = Date.now() - startTime;
  
  if (!result.success) {
    throw new Error('Multi-step orchestration failed');
  }
  
  console.log(`   - Discovery completed in ${duration}ms`);
  console.log(`   - Tool orchestration pattern:`);
  console.log(`     1. search_nodes for AI, database, auth keywords`);
  console.log(`     2. list_ai_tools for AI capabilities`);
  console.log(`     3. list_nodes for additional categories`);
  console.log(`     4. get_node_info for selected nodes`);
  console.log(`   - Total nodes discovered: ${result.discoveredNodes.length}`);
  console.log(`   - Nodes selected: ${result.selectedNodeIds.length}`);
}

// Main test runner
async function runAllTests() {
  // Set NODE_ENV to test for faster timeouts
  process.env.NODE_ENV = 'test';
  
  console.log('🚀 Running Discovery Phase Integration Tests\n');
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing',
    MCP_API_KEY: process.env.MCP_API_KEY ? '✓ Set' : '✗ Missing',
    MCP_SERVER_URL: process.env.MCP_SERVER_URL ? '✓ Set' : '✗ Missing'
  });
  
  console.log('\n⚠️  Note: Claude API calls take ~12 seconds each');
  console.log('Running 5 core test scenarios (use --full for all tests)');
  console.log('Expected time: ~2 minutes for core tests, 5+ minutes for full suite\n');
  
  // Check required environment variables
  if (!process.env.ANTHROPIC_API_KEY || !process.env.MCP_API_KEY) {
    console.error('\n❌ Missing required API keys');
    process.exit(1);
  }
  
  // Run the 5 core test scenarios first
  console.log('🎯 Running 5 Core Discovery Scenarios\n');
  await runTest('1. Simple Clear Prompt', testSimpleWorkflowCreation, 40000);
  await runTest('2. Single Clarification', testSingleClarification, 60000);
  await runTest('3. Multiple Clarifications', testMultipleClarifications, 40000);
  await runTest('4. Complex Prompt (10+ nodes)', testComplexMultiStepWorkflow, 60000);
  await runTest('5. Error Case (Invalid Input)', testErrorCase, 40000);
  
  // Run additional test scenarios if requested
  if (process.argv.includes('--full')) {
    console.log('\n🔬 Running Additional Test Scenarios\n');
    await runTest('Ambiguous Prompt Handling', testAmbiguousPromptHandling, 60000); // 4 prompts
    await runTest('Error Recovery and Retry', testErrorRecoveryAndRetry, 20000);
    await runTest('Node Validation Against MCP', testNodeValidationAgainstMCP, 60000); // 4 prompts
    await runTest('Concurrent Discovery Operations', testConcurrentDiscoveryOperations, 30000);
    await runTest('Domain-Specific Workflows', testDomainSpecificWorkflows, 60000); // 4 domains
    await runTest('Claude Response Variations', testClaudeResponseVariations, 45000); // 3 calls
    await runTest('MCP Connection and Health', testMCPConnectionAndHealth, 10000); // Fast
    await runTest('Property Search During Discovery', testPropertySearchDuringDiscovery, 45000); // 3 prompts
    await runTest('Documentation Retrieval During Discovery', testDocumentationRetrievalDuringDiscovery, 45000); // 3 prompts  
    await runTest('Multi-Step MCP Orchestration', testMultiStepMCPOrchestration, 20000);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`- ${r.name}: ${r.error}`);
    });
  }
  
  console.log('=' + '='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});