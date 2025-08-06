import { describe, test, expect } from '../helpers/test-framework';
import { BuildingRunner } from '@/lib/orchestrator/runners/building.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockSessionRepo
} from '../helpers/mocks';
import { createBuildingInput, createTestWorkflow } from '../helpers/phase-test-utils';
import type { BuildingRunnerDeps } from '@/lib/orchestrator/contracts/building.types';

describe('BuildingRunner', () => {
  let runner: BuildingRunner;
  let mockDeps: BuildingRunnerDeps;
  
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
      sessionRepo: createMockSessionRepo()
    };
    
    // Mock buildWorkflow to return test workflow
    mockDeps.claude.buildWorkflow = async () => ({
      workflow: createTestWorkflow(),
      reasoning: 'Built test workflow'
    });
    
    runner = new BuildingRunner(mockDeps);
  });
  
  test('should build workflow successfully', async () => {
    // Pre-populate session with configured nodes
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [
        {
          id: 'webhook-1',
          nodeType: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Test webhook',
          confidence: 0.9,
          category: 'trigger'
        }
      ],
      configured: [
        {
          id: 'webhook-1',
          type: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          parameters: {
            path: 'test-webhook',
            method: 'POST'
          },
          position: [0, 0],
          credentials: {},
          settings: {}
        }
      ],
      workflow: null,
      operations: [],
      userPrompt: 'Create a webhook that responds with success'
    });
    
    const input = createBuildingInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'validation');
    expect.equal(result.workflow !== null, true);
    expect.equal(result.workflow?.nodes.length, 2);
    expect.equal(result.workflow?.connections['webhook-1'] !== undefined, true);
  });
  
  test('should include workflow metadata', async () => {
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [],
      configured: [{
        id: 'webhook-1',
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        parameters: { path: 'test', method: 'POST' },
        position: [0, 0],
        credentials: {},
        settings: {}
      }],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createBuildingInput({
      name: 'My Test Workflow',
      tags: ['test', 'webhook'],
      notes: 'This is a test workflow'
    });
    
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.workflow?.name, 'My Test Workflow');
    expect.equal(result.workflow?.tags?.length, 2);
    expect.equal(result.workflow?.notes, 'This is a test workflow');
  });
  
  test('should handle empty configured nodes', async () => {
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [],
      configured: [],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createBuildingInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('No configured nodes'), true);
    }
  });
  
  test('should handle build errors gracefully', async () => {
    mockDeps.claude.buildWorkflow = async () => {
      throw new Error('Failed to build workflow');
    };
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [],
      configured: [{
        id: 'webhook-1',
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        parameters: {},
        position: [0, 0],
        credentials: {},
        settings: {}
      }],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createBuildingInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('Failed to build workflow'), true);
    }
  });
  
  test('should save workflow state correctly', async () => {
    let savedState: any = null;
    mockDeps.sessionRepo.save = async (sessionId, state) => {
      savedState = state;
    };
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'configuration',
      discovered: [],
      configured: [{
        id: 'webhook-1',
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        parameters: {},
        position: [0, 0],
        credentials: {},
        settings: {}
      }],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createBuildingInput();
    await runner.run(input);
    
    expect.equal(savedState.phase, 'validation');
    expect.equal(savedState.workflow !== null, true);
    expect.equal(savedState.operations.length > 0, true);
  });
});

// Helper function for beforeEach
function beforeEach(fn: () => void) {
  // Called manually in each test
}