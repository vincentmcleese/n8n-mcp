import { describe, test, expect } from '../helpers/test-framework';
import { ValidationRunner } from '@/lib/orchestrator/runners/validation.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockMCPClient,
  createMockSessionRepo
} from '../helpers/mocks';
import { createValidationInput, createTestWorkflow } from '../helpers/phase-test-utils';
import type { ValidationRunnerDeps } from '@/lib/orchestrator/contracts/validation.types';

describe('ValidationRunner', () => {
  let runner: ValidationRunner;
  let mockDeps: ValidationRunnerDeps;
  
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
      mcp: createMockMCPClient() as any,
      sessionRepo: createMockSessionRepo()
    };
    
    runner = new ValidationRunner(mockDeps);
  });
  
  test('should validate workflow successfully', async () => {
    // Pre-populate session with built workflow
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'documentation');
    expect.equal(result.isValid, true);
    expect.equal(result.errors.length, 0);
  });
  
  test('should detect validation errors', async () => {
    // Mock Claude to return validation errors
    mockDeps.claude.validateWorkflow = async () => ({
      isValid: false,
      errors: [
        {
          nodeId: 'webhook-1',
          field: 'parameters.path',
          message: 'Webhook path is required',
          severity: 'error'
        }
      ],
      warnings: [],
      suggestions: []
    });
    
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'validation'); // Stays in validation due to errors
    expect.equal(result.isValid, false);
    expect.equal(result.errors.length, 1);
    expect.equal(result.errors[0].message, 'Webhook path is required');
  });
  
  test('should include warnings and suggestions', async () => {
    mockDeps.claude.validateWorkflow = async () => ({
      isValid: true,
      errors: [],
      warnings: [
        {
          nodeId: 'webhook-1',
          field: 'parameters.method',
          message: 'Consider using POST for webhook endpoints',
          severity: 'warning'
        }
      ],
      suggestions: [
        {
          nodeId: 'webhook-1',
          type: 'improvement',
          message: 'Add authentication to secure your webhook',
          priority: 'medium'
        }
      ]
    });
    
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'documentation');
    expect.equal(result.isValid, true);
    expect.equal(result.warnings.length, 1);
    expect.equal(result.suggestions.length, 1);
  });
  
  test('should handle missing workflow', async () => {
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('No workflow found'), true);
    }
  });
  
  test('should validate node connections', async () => {
    // Create workflow with invalid connections
    const workflow = {
      ...createTestWorkflow(),
      connections: {
        'webhook-1': {
          main: [
            [
              {
                node: 'non-existent-node',
                type: 'main',
                index: 0
              }
            ]
          ]
        }
      }
    };
    
    mockDeps.claude.validateWorkflow = async () => ({
      isValid: false,
      errors: [
        {
          nodeId: 'webhook-1',
          field: 'connections',
          message: 'Connection points to non-existent node',
          severity: 'error'
        }
      ],
      warnings: [],
      suggestions: []
    });
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.isValid, false);
    expect.equal(result.errors[0].message.includes('non-existent'), true);
  });
  
  test('should log validation operations', async () => {
    let savedOperations: any[] = [];
    mockDeps.sessionRepo.save = async (sessionId, state) => {
      if (state.operations) {
        savedOperations = state.operations;
      }
    };
    
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'building',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createValidationInput();
    await runner.run(input);
    
    expect.equal(savedOperations.some(op => op.type === 'validation'), true);
  });
});

// Helper function for beforeEach
function beforeEach(fn: () => void) {
  // Called manually in each test
}