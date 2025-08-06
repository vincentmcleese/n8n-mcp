#!/usr/bin/env tsx
// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Simple test runner for individual phase tests
import { DiscoveryRunner } from '@/lib/orchestrator/runners/discovery.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockMCPClient,
  createMockSessionRepo,
  createMockNodeContextService
} from './helpers/mocks';
import { createDiscoveryInput } from './helpers/phase-test-utils';
import type { DiscoveryRunnerDeps } from '@/lib/orchestrator/contracts/discovery.types';

async function runDiscoveryTest() {
  console.log('🧪 Testing Discovery Phase Runner\n');
  
  const mockDeps: DiscoveryRunnerDeps = {
    loggers: {
      app: createSimpleMockLogger(),
      claude: createSimpleMockLogger(),
      mcp: createSimpleMockLogger(),
      orchestrator: createSimpleMockLogger(),
      supabase: createSimpleMockLogger()
    },
    claude: createMockClaudeService() as any,
    nodeContext: createMockNodeContextService(),
    sessionRepo: createMockSessionRepo()
  };
  
  const runner = new DiscoveryRunner(mockDeps);
  
  try {
    // Test 1: Basic discovery
    console.log('Test 1: Basic discovery...');
    const input = createDiscoveryInput({
      prompt: 'Create a webhook that responds with success'
    });
    
    const result = await runner.run(input);
    
    if (result.success && result.phase === 'configuration' && result.discovered.length > 0) {
      console.log('✅ Test 1 passed');
    } else {
      console.error('❌ Test 1 failed:', result);
    }
    
    // Test 2: Clarification handling
    console.log('\nTest 2: Clarification handling...');
    mockDeps.claude.discoverNodes = async () => ({
      query: 'test query',
      recommendations: [],
      reasoning: 'Need more information',
      clarificationNeeded: true,
      clarificationQuestion: 'What type of webhook do you need?'
    });
    
    const result2 = await runner.run(createDiscoveryInput({ prompt: 'Create a webhook' }));
    
    if (result2.success && result2.clarificationNeeded) {
      console.log('✅ Test 2 passed');
    } else {
      console.error('❌ Test 2 failed:', result2);
    }
    
    console.log('\n✅ All discovery tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
runDiscoveryTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});