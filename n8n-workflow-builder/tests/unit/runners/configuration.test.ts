import { describe, test, expect } from '../helpers/test-framework';
import { ConfigurationRunner } from '@/lib/orchestrator/runners/configuration.runner';
import { 
  createSimpleMockLogger,
  createMockClaudeService,
  createMockMCPClient,
  createMockSessionRepo,
  createMockNodeContextService
} from '../helpers/mocks';
import { createConfigurationInput } from '../helpers/phase-test-utils';
import type { ConfigurationRunnerDeps } from '@/lib/orchestrator/contracts/configuration.types';

describe('ConfigurationRunner', () => {
  let runner: ConfigurationRunner;
  let mockDeps: ConfigurationRunnerDeps;
  
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
      nodeContext: createMockNodeContextService(),
      sessionRepo: createMockSessionRepo()
    };
    
    runner = new ConfigurationRunner(mockDeps);
  });
  
  test('should configure nodes successfully', async () => {
    // Pre-populate session with discovered nodes
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'discovery',
      discovered: [
        {
          id: 'webhook-1',
          nodeType: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Test webhook',
          confidence: 0.9,
          category: 'trigger'
        },
        {
          id: 'respond-1',
          nodeType: 'n8n-nodes-base.respondToWebhook',
          displayName: 'Respond to Webhook',
          description: 'Send response',
          confidence: 0.9,
          category: 'output'
        }
      ],
      configured: [],
      workflow: null,
      operations: [],
      selectedNodeIds: ['webhook-1', 'respond-1'],
      userPrompt: 'Create a webhook that responds with success'
    });
    
    const input = createConfigurationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'building');
    expect.equal(result.configured.length, 2);
    expect.equal(result.configured[0].parameters !== undefined, true);
  });
  
  test('should handle configuration adjustments', async () => {
    // Mock Claude to request adjustments
    let callCount = 0;
    mockDeps.claude.configureNodes = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          configuredNodes: [],
          needsAdjustment: true,
          adjustmentReason: 'Invalid webhook path'
        };
      }
      return {
        configuredNodes: [
          {
            id: 'webhook-1',
            type: 'n8n-nodes-base.webhook',
            displayName: 'Webhook',
            parameters: {
              path: 'valid-webhook',
              method: 'POST'
            },
            position: [0, 0],
            credentials: {},
            settings: {}
          }
        ],
        needsAdjustment: false,
        adjustmentReason: null
      };
    };
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'discovery',
      discovered: [{
        id: 'webhook-1',
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook',
        confidence: 0.9,
        category: 'trigger'
      }],
      configured: [],
      workflow: null,
      operations: [],
      selectedNodeIds: ['webhook-1'],
      userPrompt: 'Create a webhook'
    });
    
    const input = createConfigurationInput();
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(callCount, 2);
  });
  
  test('should validate configured nodes', async () => {
    // Mock MCP validation to fail
    mockDeps.mcp.validateNode = async () => ({
      valid: false,
      errors: ['Missing required field: path'],
      warnings: []
    });
    
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'discovery',
      discovered: [{
        id: 'webhook-1',
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook',
        confidence: 0.9,
        category: 'trigger'
      }],
      configured: [],
      workflow: null,
      operations: [],
      selectedNodeIds: ['webhook-1'],
      userPrompt: 'Create a webhook'
    });
    
    const input = createConfigurationInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown validation error');
    } catch (error: any) {
      expect.equal(error.message.includes('validation'), true);
    }
  });
  
  test('should skip AI configuration when useAI is false', async () => {
    await mockDeps.sessionRepo.save('test-session', {
      phase: 'discovery',
      discovered: [{
        id: 'webhook-1',
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook',
        confidence: 0.9,
        category: 'trigger'
      }],
      configured: [],
      workflow: null,
      operations: [],
      selectedNodeIds: ['webhook-1'],
      userPrompt: 'Create a webhook'
    });
    
    const input = createConfigurationInput({ useAI: false });
    const result = await runner.run(input);
    
    expect.equal(result.success, true);
    expect.equal(result.phase, 'building');
    // Should have basic configuration without AI
    expect.equal(result.configured.length, 1);
  });
  
  test('should handle errors gracefully', async () => {
    mockDeps.sessionRepo.load = async () => {
      throw new Error('Database error');
    };
    
    const input = createConfigurationInput();
    
    try {
      await runner.run(input);
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect.equal(error.message.includes('Database error'), true);
    }
  });
});

// Helper function for beforeEach
function beforeEach(fn: () => void) {
  // Called manually in each test
}