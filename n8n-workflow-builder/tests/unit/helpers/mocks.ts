import type { Logger } from '@/lib/utils/logger';
import type { ClaudeService } from '@/lib/services/claude-service';
import type { MCPClient } from '@/lib/mcp-client';
import type { SessionRepo } from '@/lib/orchestrator/context/SessionRepo';
import type { NodeContextService } from '@/lib/orchestrator/context/NodeContextService';
import type { OperationLogger } from '@/lib/orchestrator/utils/OperationLogger';
import type { DiscoveredNode, ConfiguredNode, WorkflowOperation } from '@/types/workflow';

// Mock Logger
export function createMockLogger(): Logger {
  const calls: { [key: string]: any[] } = {
    info: [],
    error: [],
    warn: [],
    debug: []
  };
  
  return {
    info: (...args: any[]) => { calls.info.push(args); },
    error: (...args: any[]) => { calls.error.push(args); },
    warn: (...args: any[]) => { calls.warn.push(args); },
    debug: (...args: any[]) => { calls.debug.push(args); },
    getCalls: () => calls
  } as any;
}

// Simple mock logger for non-Jest tests
export function createSimpleMockLogger(): Logger {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };
}

// Mock ClaudeService
export function createMockClaudeService(): Partial<ClaudeService> {
  return {
    setOnUsageCallback: (callback: any) => {
      // Mock implementation - do nothing
    },
    
    analyzeWorkflowIntent: async (prompt: string) => ({
      suggestedSearchTerms: ['webhook', 'respond'],
      nodeRecommendations: [
        { type: 'webhook', reason: 'To receive HTTP requests' },
        { type: 'respond', reason: 'To send responses' }
      ],
      reasoning: 'User wants a webhook that responds'
    }),
    
    processWorkflowPhase: async (phase: string, context: any) => ({
      phase: 'discovery',
      discoveredNodes: [
        {
          id: 'webhook-1',
          nodeType: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Receives HTTP requests',
          category: 'trigger',
          confidence: 0.9,
          parameters: {}
        },
        {
          id: 'respond-1',
          nodeType: 'n8n-nodes-base.respondToWebhook',
          displayName: 'Respond to Webhook',
          description: 'Sends HTTP response',
          category: 'output',
          confidence: 0.9,
          parameters: {}
        }
      ],
      selectedNodeIds: ['webhook-1', 'respond-1'],
      nextPhase: 'configuration',
      clarificationNeeded: false,
      operations: [
        {
          type: 'discovery',
          timestamp: new Date().toISOString(),
          nodeType: 'n8n-nodes-base.webhook',
          details: { action: 'discovered' }
        },
        {
          type: 'discovery',
          timestamp: new Date().toISOString(),
          nodeType: 'n8n-nodes-base.respondToWebhook',
          details: { action: 'discovered' }
        }
      ]
    }),
    
    discoverNodes: async () => ({
      query: 'test query',
      recommendations: [
        {
          nodeType: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Test webhook node',
          confidence: 0.9,
          reasoning: 'Test reasoning',
          category: 'trigger',
          parameters: {},
          requiredCredentials: []
        }
      ],
      reasoning: 'Test reasoning',
      clarificationNeeded: false
    }),
    
    selectNodes: async () => ({
      selectedNodeIds: ['webhook-1'],
      reasoning: 'Test selection',
      needsClarification: false
    }),
    
    configureNodes: async () => ({
      configuredNodes: [
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
      needsAdjustment: false,
      adjustmentReason: null
    }),
    
    buildWorkflow: async () => ({
      workflow: {
        nodes: [],
        connections: {},
        settings: {
          executionOrder: 'v1'
        },
        variables: {},
        meta: {
          instanceId: 'test'
        }
      },
      reasoning: 'Test build'
    }),
    
    validateWorkflow: async () => ({
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    }),
    
    generateDocumentation: async () => ({
      title: 'Test Workflow',
      description: 'Test workflow description',
      sections: {
        overview: 'Test overview',
        setup: 'Test setup',
        usage: 'Test usage',
        technical: 'Test technical details'
      },
      metadata: {
        version: '1.0.0',
        author: 'Test',
        tags: ['test']
      }
    })
  };
}

// Mock MCPClient
export function createMockMCPClient(): Partial<MCPClient> {
  return {
    searchNodes: async () => ({
      nodes: [
        {
          displayName: 'Webhook',
          name: 'webhook',
          group: ['trigger'],
          version: 1,
          description: 'Test webhook',
          icon: 'webhook',
          codex: { categories: ['trigger'] },
          typeVersion: 1,
          documentationUrl: 'test'
        }
      ]
    }),
    
    getNodeInfo: async () => ({
      schema: {
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook node',
        properties: []
      },
      documentation: 'Test documentation',
      examples: []
    }),
    
    validateNode: async () => ({
      valid: true,
      errors: [],
      warnings: []
    })
  };
}

// Mock SessionRepo
export function createMockSessionRepo(): SessionRepo {
  const sessions = new Map();
  
  return {
    initialize: async (sessionId: string, prompt: string) => {
      sessions.set(sessionId, {
        state: {
          phase: 'discovery',
          discovered: [],
          configured: [],
          workflow: null,
          operations: []
        }
      });
    },
    
    load: async (sessionId: string) => {
      return sessions.get(sessionId) || null;
    },
    
    save: async (sessionId: string, state: any) => {
      sessions.set(sessionId, { state });
    },
    
    recordError: async (sessionId: string, error: any) => {
      console.log('Mock recordError called:', sessionId, error);
    },
    
    createBatch: () => ({
      save: async (sessionId: string, state: any) => {
        sessions.set(sessionId, { state });
      },
      commit: async () => {}
    })
  };
}

// Mock NodeContextService  
export function createMockNodeContextService(): NodeContextService {
  return {
    searchNodes: async () => [
      {
        id: 'webhook-1',
        nodeType: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        description: 'Test webhook',
        confidence: 0.9,
        category: 'trigger',
        source: 'mcp'
      }
    ],
    
    getNodeInfo: async () => ({
      displayName: 'Webhook',
      description: 'Test webhook',
      category: 'trigger',
      properties: [],
      examples: []
    })
  };
}

// Mock OperationLogger
export function createMockOperationLogger(): OperationLogger {
  const operations: WorkflowOperation[] = [];
  
  return {
    logOperation: (op: WorkflowOperation) => {
      operations.push(op);
    },
    getOperations: () => operations
  };
}