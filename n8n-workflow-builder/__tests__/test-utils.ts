// __tests__/test-utils.ts

import { WorkflowOperation, WorkflowPhase, WorkflowSession } from '@/types/workflow'

/**
 * Creates a mock workflow session for testing
 */
export function createMockSession(overrides?: Partial<WorkflowSession>): WorkflowSession {
  return {
    sessionId: 'test-session-123',
    createdAt: new Date(),
    state: {
      phase: 'discovery' as WorkflowPhase,
      userPrompt: 'Create a webhook to Slack workflow',
      discovered: [],
      selected: [],
      configured: new Map(),
      validated: new Map(),
      workflow: {
        nodes: [],
        connections: [],
        settings: { name: 'Test Workflow' }
      },
      operationHistory: [],
      pendingClarifications: [],
      clarificationHistory: []
    },
    ...overrides
  }
}

/**
 * Creates mock workflow operations for testing
 */
export function createMockOperations(): WorkflowOperation[] {
  return [
    {
      type: 'discoverNode',
      node: { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Receive webhook data' }
    },
    {
      type: 'discoverNode',
      node: { id: 'node_2', type: 'nodes-base.code', purpose: 'Process data' }
    },
    {
      type: 'selectNode',
      nodeId: 'node_1'
    },
    {
      type: 'selectNode',
      nodeId: 'node_2'
    }
  ]
}

/**
 * Mock response utilities
 */
export const mockSuccessResponse = (data: any) => ({
  ok: true,
  json: async () => data,
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
})

export const mockErrorResponse = (status: number, error: any) => ({
  ok: false,
  json: async () => error,
  status,
  statusText: status === 500 ? 'Internal Server Error' : 'Bad Request',
  headers: new Headers(),
})

/**
 * Wait for async operations to complete
 */
export const waitForAsync = () => new Promise(resolve => setImmediate(resolve))

/**
 * Mock API route handlers
 */
export function mockApiHandler(handler: Function) {
  return async (req: any) => {
    try {
      const response = await handler(req)
      return response
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}