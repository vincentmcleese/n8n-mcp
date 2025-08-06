#!/usr/bin/env tsx

// Setup test environment BEFORE any imports
import { setupTestEnvironment } from './setup-test-env';
setupTestEnvironment();

// Now import everything else
import { DiscoveryRunner } from '@/lib/orchestrator/runners/discovery.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockSessionRepo,
  createMockNodeContextService
} from './helpers/mocks';
import { createDiscoveryInput } from './helpers/phase-test-utils';
import type { DiscoveryRunnerDeps } from '@/lib/orchestrator/contracts/discovery.types';

async function runDiscoveryTests() {
  console.log('🧪 Discovery Runner Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Create base mock dependencies
  const createMockDeps = (): DiscoveryRunnerDeps => ({
    loggers: {
      app: createSimpleMockLogger(),
      claude: createSimpleMockLogger(),
      mcp: createSimpleMockLogger(),
      orchestrator: createSimpleMockLogger(),
      supabase: createSimpleMockLogger()
    },
    claudeService: createMockClaudeService() as any,
    nodeContext: createMockNodeContextService(),
    sessionRepo: createMockSessionRepo()
  });
  
  // Test 1: Basic discovery
  try {
    console.log('Test 1: Basic discovery');
    const mockDeps = createMockDeps();
    const runner = new DiscoveryRunner(mockDeps);
    
    const input = createDiscoveryInput({
      prompt: 'Create a webhook that responds with success'
    });
    
    const result = await runner.run(input);
    
    if (result.success && result.operations.length > 0) {
      console.log('✅ Test 1 passed\n');
      console.log('  - Found operations:', result.operations.length);
      passed++;
    } else {
      console.error('❌ Test 1 failed:', result);
      failed++;
    }
  } catch (error) {
    console.error('❌ Test 1 error:', error);
    failed++;
  }
  
  // Test 2: Clarification handling
  try {
    console.log('Test 2: Clarification handling');
    const mockDeps = createMockDeps();
    
    // Override Claude to request clarification
    mockDeps.claudeService.processWorkflowPhase = async () => ({
      phase: 'discovery',
      discoveredNodes: [],
      selectedNodeIds: [],
      nextPhase: 'discovery',
      clarificationNeeded: true,
      clarificationQuestion: 'What type of webhook do you need?',
      operations: [
        {
          type: 'requestClarification',
          timestamp: new Date().toISOString(),
          questionId: 'webhook-type',
          question: 'What type of webhook do you need?'
        }
      ]
    });
    
    const runner = new DiscoveryRunner(mockDeps);
    const input = createDiscoveryInput({ prompt: 'Create a webhook' });
    const result = await runner.run(input);
    
    if (result.success && result.pendingClarification?.question) {
      console.log('✅ Test 2 passed\n');
      console.log('  - Clarification needed:', result.pendingClarification.question);
      passed++;
    } else {
      console.error('❌ Test 2 failed:', result);
      failed++;
    }
  } catch (error) {
    console.error('❌ Test 2 error:', error);
    failed++;
  }
  
  // Test 3: Error handling
  try {
    console.log('Test 3: Error handling');
    const mockDeps = createMockDeps();
    
    // Make Claude throw an error
    mockDeps.claudeService.analyzeWorkflowIntent = async () => {
      throw new Error('API error');
    };
    
    const runner = new DiscoveryRunner(mockDeps);
    const input = createDiscoveryInput();
    
    const result = await runner.run(input);
    
    // The runner wraps errors and returns them in the result
    if (!result.success && result.error?.message.includes('API error')) {
      console.log('✅ Test 3 passed\n');
      console.log('  - Error caught:', result.error.message);
      passed++;
    } else {
      console.error('❌ Test 3 failed:', result);
      failed++;
    }
  } catch (error) {
    console.error('❌ Test 3 error:', error);
    failed++;
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runDiscoveryTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});