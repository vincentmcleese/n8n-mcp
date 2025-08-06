#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createRequire } from 'module';

// Load env vars
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Create a custom require for mocking
const require = createRequire(import.meta.url);

// Mock problematic modules
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
  // Mock the config modules that cause issues
  if (id.includes('lib/config/supabase')) {
    return {
      supabaseAdmin: null,
      supabase: null
    };
  }
  if (id.includes('lib/supabase')) {
    return {
      createClient: () => null
    };
  }
  return originalRequire.apply(this, arguments);
};

async function runTest() {
  console.log('🧪 Running Discovery Runner Test with Mocks\n');
  
  try {
    // Now we can safely import the runner
    const { DiscoveryRunner } = await import('@/lib/orchestrator/runners/discovery.runner');
    const { 
      createSimpleMockLogger,
      createMockClaudeService,
      createMockSessionRepo,
      createMockNodeContextService
    } = await import('./helpers/mocks');
    const { createDiscoveryInput } = await import('./helpers/phase-test-utils');
    
    // Create mocks
    const mockDeps = {
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
    
    // Run test
    console.log('Test: Basic discovery...');
    const input = createDiscoveryInput({
      prompt: 'Create a webhook that responds with success'
    });
    
    const result = await runner.run(input);
    
    if (result.success && result.phase === 'configuration' && result.discovered.length > 0) {
      console.log('✅ Discovery test passed!');
      console.log('  - Success:', result.success);
      console.log('  - Phase:', result.phase);
      console.log('  - Discovered nodes:', result.discovered.length);
    } else {
      console.error('❌ Discovery test failed:', result);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

runTest();