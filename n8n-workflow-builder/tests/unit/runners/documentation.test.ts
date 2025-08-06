import { describe, test, expect } from '../helpers/test-framework';
import { DocumentationRunner } from '@/lib/orchestrator/runners/documentation.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockSessionRepo
} from '../helpers/mocks';
import { createDocumentationInput, createTestWorkflow } from '../helpers/phase-test-utils';
import type { DocumentationRunnerDeps } from '@/lib/orchestrator/contracts/documentation.types';

describe('DocumentationRunner', () => {
  let runner: DocumentationRunner;
  let mockDeps: DocumentationRunnerDeps;
  
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
    
    runner = new DocumentationRunner(mockDeps);
  });
  
  test('should generate documentation successfully', async () => {
    // Pre-populate session with validated workflow
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Create a webhook that responds with success'
    });
    
    const input = createDocumentationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'complete');
    expect.equal(result.documentation !== null, true);
    expect.equal(result.documentation.title, 'Test Workflow');
    expect.equal(result.documentation.sections.overview !== undefined, true);
  });
  
  test('should support different documentation formats', async () => {
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    // Test with detailed format
    const input = createDocumentationInput({ format: 'detailed' });
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.documentation.sections.setup !== undefined, true);
    expect.equal(result.documentation.sections.usage !== undefined, true);
    expect.equal(result.documentation.sections.technical !== undefined, true);
  });
  
  test('should include workflow metadata in documentation', async () => {
    const testWorkflow = {
      ...createTestWorkflow(),
      name: 'My Custom Workflow',
      tags: ['webhook', 'api', 'automation'],
      notes: 'This workflow handles incoming webhooks'
    };
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [],
      configured: [],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createDocumentationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.documentation.title, 'My Custom Workflow');
    expect.equal(result.documentation.metadata.tags?.length, 3);
    expect.equal(result.documentation.description.includes('webhooks'), true);
  });
  
  test('should handle missing workflow', async () => {
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [],
      configured: [],
      workflow: null,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createDocumentationInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('No workflow found'), true);
    }
  });
  
  test('should include troubleshooting section for complex workflows', async () => {
    // Create a more complex workflow
    const complexWorkflow = {
      ...createTestWorkflow(),
      nodes: [
        ...createTestWorkflow().nodes,
        {
          id: 'httpRequest-1',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 1,
          position: [400, 0],
          parameters: {
            url: 'https://api.example.com',
            method: 'POST'
          },
          name: 'HTTP Request'
        }
      ]
    };
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [],
      configured: [],
      workflow: complexWorkflow,
      operations: [],
      userPrompt: 'Complex workflow with API calls'
    });
    
    mockDeps.claude.generateDocumentation = async () => ({
      title: 'Complex API Workflow',
      description: 'Workflow with external API integration',
      sections: {
        overview: 'Overview of complex workflow',
        setup: 'Setup instructions',
        usage: 'Usage guide',
        technical: 'Technical details',
        troubleshooting: 'Common issues and solutions'
      },
      metadata: {
        version: '1.0.0',
        author: 'Test',
        tags: ['api', 'complex']
      }
    });
    
    const input = createDocumentationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.documentation.sections.troubleshooting !== undefined, true);
  });
  
  test('should save complete state with all phases', async () => {
    let savedState: any = null;
    mockDeps.sessionRepo.save = async (sessionId, state) => {
      savedState = state;
    };
    
    const testWorkflow = createTestWorkflow();
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'validation',
      discovered: [{
        id: 'webhook-1',
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook',
        confidence: 0.9,
        category: 'trigger'
      }],
      configured: [{
        id: 'webhook-1',
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        parameters: { path: 'test', method: 'POST' },
        position: [0, 0],
        credentials: {},
        settings: {}
      }],
      workflow: testWorkflow,
      operations: [],
      userPrompt: 'Test workflow'
    });
    
    const input = createDocumentationInput();
    await runner.run(input);
    
    expect.equal(savedState.phase, 'complete');
    expect.equal(savedState.documentation !== null, true);
    expect.equal(savedState.operations.some(op => op.type === 'documentation'), true);
  });
});

// Helper function for beforeEach
function beforeEach(fn: () => void) {
  // Called manually in each test
}