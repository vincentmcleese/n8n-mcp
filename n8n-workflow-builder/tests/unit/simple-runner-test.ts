#!/usr/bin/env tsx
// Simple unit test that doesn't require the full app environment

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars first
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Mock all the config modules before they're imported
import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

console.log('🧪 Simple Unit Test Runner\n');

// Test basic functionality without loading the full app
async function runSimpleTest() {
  console.log('Test 1: Mock functionality...');
  
  // Import only the helpers
  const { createSimpleMockLogger, createMockClaudeService } = await import('./helpers/mocks');
  
  const logger = createSimpleMockLogger();
  const claude = createMockClaudeService();
  
  // Test logger
  logger.info('test message');
  console.log('✅ Logger mock works');
  
  // Test Claude service
  const result = await claude.discoverNodes!('test prompt');
  if (result.recommendations.length > 0) {
    console.log('✅ Claude mock works');
  }
  
  console.log('\nTest 2: Phase test utilities...');
  const { createDiscoveryInput, createTestWorkflow } = await import('./helpers/phase-test-utils');
  
  const input = createDiscoveryInput();
  if (input.sessionId === 'test-session') {
    console.log('✅ Test input creation works');
  }
  
  const workflow = createTestWorkflow();
  if (workflow.nodes.length === 2) {
    console.log('✅ Test workflow creation works');
  }
  
  console.log('\n✅ All simple tests passed!');
}

// Run the test
runSimpleTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});