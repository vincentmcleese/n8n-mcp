// __tests__/integration/discovery-phase.test.ts

import { WorkflowOrchestrator } from '@/lib/workflow-orchestrator'
import { ClaudeService } from '@/lib/services/claude-service'
import { createMockSession } from '@/__tests__/test-utils'
import { loggers } from '@/lib/utils/logger'

// Only mock the database for integration tests
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: createMockSession(),
        error: null
      })
    })
  }
}))

describe('Discovery Phase - Real Integration Tests', () => {
  let orchestrator: WorkflowOrchestrator
  let claudeService: ClaudeService

  beforeAll(() => {
    // Ensure we have real API keys
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY must be set for integration tests')
    }
    if (!process.env.MCP_API_KEY) {
      throw new Error('MCP_API_KEY must be set for integration tests')
    }
  })

  beforeEach(() => {
    orchestrator = new WorkflowOrchestrator()
    claudeService = new ClaudeService()
  })

  describe('End-to-End Discovery Flow', () => {
    it('should discover webhook and Slack nodes for a simple workflow', async () => {
      const prompt = 'Create a webhook that sends data to Slack'
      
      // Test with real Claude
      const result = await orchestrator.runDiscoveryPhase(
        'test-session-001',
        prompt
      )

      expect(result.success).toBe(true)
      expect(result.operations).toBeDefined()
      expect(result.operations.length).toBeGreaterThan(0)

      // Should discover relevant nodes
      const discoveredNodeTypes = result.discoveredNodes.map(n => n.type)
      expect(discoveredNodeTypes).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/webhook/i),
          expect.stringMatching(/slack/i)
        ])
      )

      // Should have reasoning from Claude
      expect(result.reasoning).toBeDefined()
      expect(result.reasoning.length).toBeGreaterThan(0)
      
      loggers.test.info('Claude reasoning:', result.reasoning)
      loggers.test.info('Discovered nodes:', result.discoveredNodes)
    }, 30000)

    it('should handle clarification requests for ambiguous prompts', async () => {
      const ambiguousPrompt = 'Process some data'
      
      const result = await orchestrator.runDiscoveryPhase(
        'test-session-002',
        ambiguousPrompt
      )

      // Claude might ask for clarification
      if (result.pendingClarification) {
        expect(result.pendingClarification.question).toBeDefined()
        expect(result.pendingClarification.questionId).toBeDefined()
        loggers.test.info('Clarification requested:', result.pendingClarification.question)
      } else {
        // Or it might make assumptions and discover nodes
        expect(result.discoveredNodes.length).toBeGreaterThan(0)
      }
    }, 30000)

    it('should discover appropriate nodes for complex workflows', async () => {
      const complexPrompt = `
        Create a workflow that:
        1. Receives webhook data
        2. Transforms the JSON data
        3. Sends to multiple Slack channels based on content
        4. Logs results to a database
      `
      
      const result = await orchestrator.runDiscoveryPhase(
        'test-session-003',
        complexPrompt
      )

      expect(result.success).toBe(true)
      
      // Should discover multiple node types
      const nodeTypes = result.discoveredNodes.map(n => n.type)
      loggers.test.verbose('Discovered node types:', nodeTypes)
      
      // Should include webhook, code/transform, slack, and database nodes
      expect(nodeTypes.length).toBeGreaterThanOrEqual(4)
      
      // Check for expected node types (flexible matching)
      const hasWebhook = nodeTypes.some(t => t.includes('webhook'))
      const hasTransform = nodeTypes.some(t => 
        t.includes('code') || t.includes('function') || t.includes('transform')
      )
      const hasSlack = nodeTypes.some(t => t.includes('slack'))
      const hasDatabase = nodeTypes.some(t => 
        t.includes('database') || t.includes('postgres') || t.includes('mysql')
      )
      
      expect(hasWebhook).toBe(true)
      expect(hasTransform).toBe(true)
      expect(hasSlack).toBe(true)
      expect(hasDatabase).toBe(true)
    }, 30000)
  })

  describe('Claude Service Direct Tests', () => {
    it('should generate proper workflow operations structure', async () => {
      const result = await claudeService.processWorkflowPhase(
        'discovery',
        'Create a simple webhook to email workflow',
        'test-session-004'
      )

      // Verify response structure
      expect(result).toHaveProperty('operations')
      expect(result).toHaveProperty('reasoning')
      
      // All operations should be valid
      result.operations.forEach(op => {
        expect(op).toHaveProperty('type')
        expect(op.type).toMatch(/^(discoverNode|selectNode|deselectNode|requestClarification|clarificationResponse)$/)
        
        if (op.type === 'discoverNode') {
          expect(op).toHaveProperty('node')
          expect(op.node).toHaveProperty('id')
          expect(op.node).toHaveProperty('type')
          expect(op.node).toHaveProperty('purpose')
          
          // Should use correct naming convention
          expect(op.node.type).toMatch(/^nodes-base\./)
        }
        
        if (op.type === 'selectNode') {
          expect(op).toHaveProperty('nodeId')
        }
      })
    }, 30000)

    it('should provide meaningful reasoning for decisions', async () => {
      const result = await claudeService.processWorkflowPhase(
        'discovery',
        'I need to sync data from Google Sheets to a MySQL database every hour',
        'test-session-005'
      )

      expect(result.reasoning).toBeDefined()
      expect(Array.isArray(result.reasoning)).toBe(true)
      expect(result.reasoning.length).toBeGreaterThan(0)
      
      // Reasoning should mention key aspects
      const reasoningText = result.reasoning.join(' ').toLowerCase()
      expect(reasoningText).toMatch(/google sheets|sheets/i)
      expect(reasoningText).toMatch(/mysql|database/i)
      expect(reasoningText).toMatch(/schedule|hour|cron|interval/i)
      
      loggers.test.verbose('Full reasoning:', result.reasoning)
    }, 30000)
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Temporarily break the API key
      const originalKey = process.env.ANTHROPIC_API_KEY
      process.env.ANTHROPIC_API_KEY = 'invalid-key'
      
      const brokenOrchestrator = new WorkflowOrchestrator()
      
      const result = await brokenOrchestrator.runDiscoveryPhase(
        'test-session-006',
        'Create workflow'
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.type).toBe('claude_api')
      expect(result.error.retryable).toBe(true)
      
      // Restore key
      process.env.ANTHROPIC_API_KEY = originalKey
    }, 30000)
  })
})