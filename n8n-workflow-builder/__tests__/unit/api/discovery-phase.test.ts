// __tests__/unit/api/discovery-phase.test.ts

import { POST as createSession } from '@/app/api/workflow/create/route'
import { POST as applyOperations } from '@/app/api/workflow/[sessionId]/apply/route'
import { GET as getState } from '@/app/api/workflow/[sessionId]/state/route'
import { POST as processClaude } from '@/app/api/claude/route'
import { createMockSession, mockSuccessResponse, mockErrorResponse } from '@/__tests__/test-utils'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
    })
  }
}))

jest.mock('@/lib/services/claude-service')
jest.mock('@/lib/workflow-orchestrator')

describe('Discovery Phase API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/workflow/create', () => {
    it('should create a new workflow session', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflow/create', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a webhook to Slack workflow',
          metadata: { name: 'Test Workflow' }
        })
      })

      const response = await createSession(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('sessionId')
      expect(data.sessionId).toMatch(/^wf_\d+_/)
      expect(data).toHaveProperty('createdAt')
      expect(data).toHaveProperty('expiresAt')
    })

    it('should validate required prompt field', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflow/create', {
        method: 'POST',
        body: JSON.stringify({ metadata: { name: 'Test' } })
      })

      const response = await createSession(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toHaveProperty('message')
      expect(data.error.message).toContain('prompt')
    })
  })

  describe('POST /api/claude', () => {
    it('should process discovery phase with Claude', async () => {
      const request = new NextRequest('http://localhost:3000/api/claude', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'test-session-123',
          phase: 'discovery',
          prompt: 'Create webhook to Slack workflow'
        })
      })

      // Mock ClaudeService
      const { ClaudeService } = require('@/lib/services/claude-service')
      ClaudeService.prototype.processWorkflowPhase = jest.fn().mockResolvedValue({
        operations: [
          {
            type: 'discoverNode',
            node: { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Webhook' }
          },
          { type: 'selectNode', nodeId: 'node_1' }
        ],
        reasoning: ['Found webhook node', 'Selected for workflow']
      })

      const response = await processClaude(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('operations')
      expect(data.operations).toHaveLength(2)
      expect(data.operations[0].type).toBe('discoverNode')
      expect(ClaudeService.prototype.processWorkflowPhase).toHaveBeenCalledWith(
        'discovery',
        'Create webhook to Slack workflow',
        'test-session-123',
        undefined,
        undefined
      )
    })

    it('should handle clarification requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/claude', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'test-session-123',
          phase: 'discovery',
          prompt: 'Process data'
        })
      })

      // Mock clarification response
      const { ClaudeService } = require('@/lib/services/claude-service')
      ClaudeService.prototype.processWorkflowPhase = jest.fn().mockResolvedValue({
        operations: [
          {
            type: 'requestClarification',
            questionId: 'q1',
            question: 'What type of data?',
            context: { options: ['JSON', 'CSV'] }
          }
        ],
        reasoning: ['Need more information']
      })

      const response = await processClaude(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.operations).toHaveLength(1)
      expect(data.operations[0].type).toBe('requestClarification')
    })
  })

  describe('POST /api/workflow/[sessionId]/apply', () => {
    it('should apply discovery operations', async () => {
      const sessionId = 'test-session-123'
      const request = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            operations: [
              {
                type: 'discoverNode',
                node: { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Webhook' }
              },
              { type: 'selectNode', nodeId: 'node_1' }
            ]
          })
        }
      )

      // Mock WorkflowOrchestrator
      const { WorkflowOrchestrator } = require('@/lib/workflow-orchestrator')
      WorkflowOrchestrator.prototype.applyOperations = jest.fn().mockResolvedValue({
        success: true,
        applied: 2,
        stateUpdate: {
          phase: 'discovery',
          discovered: 1,
          selected: 1
        }
      })

      const response = await applyOperations(request, { params: { sessionId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.applied).toBe(2)
      expect(data.stateUpdate.discovered).toBe(1)
      expect(data.stateUpdate.selected).toBe(1)
    })

    it('should handle clarification in apply', async () => {
      const sessionId = 'test-session-123'
      const request = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            operations: [
              {
                type: 'requestClarification',
                questionId: 'q1',
                question: 'What format?',
                context: {}
              }
            ]
          })
        }
      )

      const { WorkflowOrchestrator } = require('@/lib/workflow-orchestrator')
      WorkflowOrchestrator.prototype.applyOperations = jest.fn().mockResolvedValue({
        success: true,
        applied: 1,
        stateUpdate: { phase: 'discovery' },
        pendingClarification: {
          questionId: 'q1',
          question: 'What format?'
        }
      })

      const response = await applyOperations(request, { params: { sessionId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.pendingClarification).toBeDefined()
      expect(data.pendingClarification.question).toBe('What format?')
    })

    it('should validate operations before applying', async () => {
      const sessionId = 'test-session-123'
      const request = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            operations: [
              { type: 'invalidOperation' }, // Invalid operation type
              { type: 'selectNode' } // Missing nodeId
            ]
          })
        }
      )

      const response = await applyOperations(request, { params: { sessionId } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBeDefined()
      expect(data.error.type).toBe('validation')
    })
  })

  describe('GET /api/workflow/[sessionId]/state', () => {
    it('should return current discovery state', async () => {
      const sessionId = 'test-session-123'
      const request = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/state`
      )

      // Mock session retrieval
      const mockSession = createMockSession({
        state: {
          ...createMockSession().state,
          phase: 'discovery',
          discovered: [
            { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Webhook' },
            { id: 'node_2', type: 'nodes-base.slack', purpose: 'Slack' }
          ],
          selected: ['node_1', 'node_2']
        }
      })

      const { supabase } = require('@/lib/supabase')
      supabase.from().select().eq().single.mockResolvedValue({
        data: {
          session_id: sessionId,
          state: mockSession.state
        },
        error: null
      })

      const response = await getState(request, { params: { sessionId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.phase).toBe('discovery')
      expect(data.stats.discovered).toBe(2)
      expect(data.stats.selected).toBe(2)
    })

    it('should handle session not found', async () => {
      const sessionId = 'non-existent-session'
      const request = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/state`
      )

      const { supabase } = require('@/lib/supabase')
      supabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      })

      const response = await getState(request, { params: { sessionId } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.type).toBe('database')
      expect(data.error.code).toBe('SESSION_NOT_FOUND')
    })
  })

  describe('Discovery Phase Integration', () => {
    it('should complete full discovery flow', async () => {
      // 1. Create session
      const createReq = new NextRequest('http://localhost:3000/api/workflow/create', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Create webhook to Slack workflow' })
      })
      const createRes = await createSession(createReq)
      const { sessionId } = await createRes.json()

      // 2. Process with Claude
      const claudeReq = new NextRequest('http://localhost:3000/api/claude', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          phase: 'discovery',
          prompt: 'Create webhook to Slack workflow'
        })
      })

      const { ClaudeService } = require('@/lib/services/claude-service')
      ClaudeService.prototype.processWorkflowPhase = jest.fn().mockResolvedValue({
        operations: [
          {
            type: 'discoverNode',
            node: { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Webhook' }
          },
          {
            type: 'discoverNode',
            node: { id: 'node_2', type: 'nodes-base.slack', purpose: 'Slack' }
          },
          { type: 'selectNode', nodeId: 'node_1' },
          { type: 'selectNode', nodeId: 'node_2' }
        ],
        reasoning: ['Discovered nodes', 'Selected for workflow']
      })

      const claudeRes = await processClaude(claudeReq)
      const { operations } = await claudeRes.json()

      expect(operations).toHaveLength(4)

      // 3. Apply operations
      const applyReq = new NextRequest(
        `http://localhost:3000/api/workflow/${sessionId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({ operations })
        }
      )

      const { WorkflowOrchestrator } = require('@/lib/workflow-orchestrator')
      WorkflowOrchestrator.prototype.applyOperations = jest.fn().mockResolvedValue({
        success: true,
        applied: 4,
        stateUpdate: {
          phase: 'discovery',
          discovered: 2,
          selected: 2
        }
      })

      const applyRes = await applyOperations(applyReq, { params: { sessionId } })
      const applyData = await applyRes.json()

      expect(applyData.success).toBe(true)
      expect(applyData.stateUpdate.discovered).toBe(2)
      expect(applyData.stateUpdate.selected).toBe(2)
    })
  })
})