import { describe, test, expect } from '../helpers/test-framework';
import { DiscoveryRunner } from '@/lib/orchestrator/runners/discovery.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockMCPClient,
  createMockSessionRepo,
  createMockNodeContextService,
  createMockOperationLogger
} from '../helpers/mocks';
import { createDiscoveryInput } from '../helpers/phase-test-utils';
import type { DiscoveryRunnerDeps } from '@/lib/orchestrator/contracts/discovery.types';

describe('DiscoveryRunner', () => {
  let runner: DiscoveryRunner;
  let mockDeps: DiscoveryRunnerDeps;
  
  // Setup before each test
  beforeEach(() => {
    mockDeps = {
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
    
    runner = new DiscoveryRunner(mockDeps);
  });
  
  test('should successfully discover nodes for a simple prompt', async () => {
    const input = createDiscoveryInput({
      prompt: 'Create a webhook that responds with success'
    });
    
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'configuration');
    expect.equal(result.discovered.length > 0, true);
    expect.equal(result.operations.length > 0, true);
  });
  
  test('should handle clarification requests', async () => {
    // Mock Claude to request clarification
    mockDeps.claude.discoverNodes = async () => ({
      query: 'test query',
      recommendations: [],
      reasoning: 'Need more information',
      clarificationNeeded: true,
      clarificationQuestion: 'What type of webhook do you need?'
    });
    
    const input = createDiscoveryInput({
      prompt: 'Create a webhook'
    });
    
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'discovery');
    expect.equal(result.clarificationNeeded, true);
    expect.equal(result.clarificationQuestion, 'What type of webhook do you need?');
  });
  
  test('should handle errors gracefully', async () => {
    // Mock Claude to throw an error
    mockDeps.claude.discoverNodes = async () => {
      throw new Error('API error');
    };
    
    const input = createDiscoveryInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('API error'), true);
    }
  });
  
  test('should recover from existing session', async () => {
    // Pre-populate session repo with existing data
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [
        {
          id: 'webhook-1',
          nodeType: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Existing webhook',
          confidence: 0.9,
          category: 'trigger'
        }
      ],
      configured: [],
      workflow: null,
      operations: []
    });
    
    const input = createDiscoveryInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'configuration');
    expect.equal(result.discovered.length, 1);
    expect.equal(result.discovered[0].description, 'Existing webhook');
  });
  
  test('should handle clarification responses', async () => {
    const input = createDiscoveryInput({
      prompt: 'I need a POST webhook that accepts JSON',
      clarificationResponse: 'POST webhook with JSON body'
    });
    
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'configuration');
    expect.equal(result.discovered.length > 0, true);
  });
  
  test('should log operations correctly', async () => {
    const operations: any[] = [];
    mockDeps.sessionRepo.save = async (sessionId, state) => {
      if (state.operations) {
        operations.push(...state.operations);
      }
    };
    
    const input = createDiscoveryInput();
    await runner.run(input);
    
    expect.equal(operations.length > 0, true);
    expect.equal(operations.some(op => op.type === 'discovery'), true);
  });
});

// Helper function for beforeEach since Node test doesn't have it built-in
function beforeEach(fn: () => void) {
  // This will be called manually in each test
  // In a real implementation, we'd track this and call it automatically
}