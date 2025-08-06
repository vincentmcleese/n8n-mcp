import type { 
  DiscoveryInput, 
  DiscoveryOutput,
  ConfigurationInput,
  ConfigurationOutput,
  BuildingInput,
  BuildingOutput,
  ValidationPhaseInput,
  ValidationPhaseOutput,
  DocumentationPhaseInput,
  DocumentationPhaseOutput
} from '@/lib/workflow-orchestrator';

// Helper to create test inputs for each phase
export function createDiscoveryInput(overrides?: Partial<DiscoveryInput>): DiscoveryInput {
  return {
    sessionId: 'test-session',
    prompt: 'Test workflow prompt',
    ...overrides
  };
}

export function createConfigurationInput(overrides?: Partial<ConfigurationInput>): ConfigurationInput {
  return {
    sessionId: 'test-session',
    useAI: true,
    ...overrides
  };
}

export function createBuildingInput(overrides?: Partial<BuildingInput>): BuildingInput {
  return {
    sessionId: 'test-session',
    name: 'Test Workflow',
    tags: ['test'],
    notes: 'Test notes',
    ...overrides
  };
}

export function createValidationInput(overrides?: Partial<ValidationPhaseInput>): ValidationPhaseInput {
  return {
    sessionId: 'test-session',
    ...overrides
  };
}

export function createDocumentationInput(overrides?: Partial<DocumentationPhaseInput>): DocumentationPhaseInput {
  return {
    sessionId: 'test-session',
    format: 'standard',
    ...overrides
  };
}

// Helper to wait for async operations
export async function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!condition()) {
    throw new Error('Timeout waiting for condition');
  }
}

// Helper to create test workflow data
export function createTestWorkflow() {
  return {
    nodes: [
      {
        id: 'webhook-1',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [0, 0],
        parameters: {
          path: 'test-webhook',
          method: 'POST'
        },
        name: 'Webhook'
      },
      {
        id: 'respondToWebhook-1',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [200, 0],
        parameters: {
          respondWith: 'text',
          responseBody: 'Success'
        },
        name: 'Respond to Webhook'
      }
    ],
    connections: {
      'webhook-1': {
        main: [
          [
            {
              node: 'respondToWebhook-1',
              type: 'main',
              index: 0
            }
          ]
        ]
      }
    },
    settings: {
      executionOrder: 'v1'
    },
    meta: {
      instanceId: 'test'
    }
  };
}