// __tests__/unit/services/claude-service.test.ts

import { ClaudeService } from '@/lib/services/claude-service'
import { WorkflowPhase } from '@/types/workflow'

// For integration tests, we'll use real services
// Comment out the mock to use real Anthropic API
// jest.mock('@anthropic-ai/sdk')

describe('ClaudeService - Integration Tests', () => {
  let claudeService: ClaudeService

  beforeEach(() => {
    // Use real API key from environment
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY must be set for integration tests')
    }
    claudeService = new ClaudeService()
  })

  describe('processWorkflowPhase', () => {
    describe('Discovery Phase', () => {
      it('should process discovery phase and return operations', async () => {
        const prompt = 'Create a webhook to Slack workflow'
        const phase: WorkflowPhase = 'discovery'

        const result = await claudeService.processWorkflowPhase(
          phase,
          prompt,
          'session-123'
        )

        // With real Claude, we check structure not exact values
        expect(result).toBeDefined()
        expect(result.operations).toBeDefined()
        expect(Array.isArray(result.operations)).toBe(true)
        
        // Should have some operations
        expect(result.operations.length).toBeGreaterThan(0)
        
        // Should have discover and select operations
        const discoverOps = result.operations.filter(op => op.type === 'discoverNode')
        const selectOps = result.operations.filter(op => op.type === 'selectNode')
        
        expect(discoverOps.length).toBeGreaterThan(0)
        expect(selectOps.length).toBeGreaterThan(0)
        
        // Check reasoning is provided
        expect(result.reasoning).toBeDefined()
        expect(Array.isArray(result.reasoning)).toBe(true)
      }, 30000) // Increase timeout for API call

      it.skip('should handle malformed Claude responses', async () => {
        // Skip this test for real API - we can't force Claude to return malformed JSON
      })

      it('should handle various response formats from Claude', async () => {
        const prompt = 'Create a simple webhook workflow'
        const phase: WorkflowPhase = 'discovery'

        const result = await claudeService.processWorkflowPhase(
          phase,
          prompt,
          'session-123'
        )

        // Real Claude might return with or without markdown blocks
        expect(result).toBeDefined()
        expect(result.operations).toBeDefined()
        expect(result.operations.length).toBeGreaterThan(0)
      }, 30000)

      it('should use correct node naming convention', async () => {
        const prompt = 'Create webhook workflow'
        const phase: WorkflowPhase = 'discovery'

        const result = await claudeService.processWorkflowPhase(
          phase,
          prompt,
          'session-123'
        )

        // Verify all discovered nodes use nodes-base.* naming
        const discoveredNodes = result.operations
          .filter(op => op.type === 'discoverNode')
          .map(op => (op as any).node.type)

        discoveredNodes.forEach(nodeType => {
          expect(nodeType).toMatch(/^nodes-base\./)
          expect(nodeType).not.toMatch(/^n8n-nodes-base\./)
        })
      })
    })

    describe('Configuration Phase', () => {
      it('should generate configuration operations', async () => {
        const phase: WorkflowPhase = 'configuration'
        const selectedNodes = ['node_1', 'node_2']
        const context = {
          nodes: [
            { id: 'node_1', type: 'nodes-base.webhook' },
            { id: 'node_2', type: 'nodes-base.slack' }
          ]
        }

        mockAnthropicClient.messages.create = jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              operations: [
                {
                  type: 'configureNode',
                  nodeId: 'node_1',
                  config: { path: '/webhook', method: 'POST' }
                },
                {
                  type: 'configureNode',
                  nodeId: 'node_2',
                  config: { channel: '#general', text: 'Hello' }
                }
              ],
              reasoning: ['Configured webhook', 'Configured Slack']
            })
          }]
        })

        const result = await claudeService.processWorkflowPhase(
          phase,
          'Configure nodes',
          'session-123',
          selectedNodes,
          context
        )

        expect(result.operations).toHaveLength(2)
        expect(result.operations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'configureNode',
              nodeId: 'node_1'
            }),
            expect.objectContaining({
              type: 'configureNode',
              nodeId: 'node_2'
            })
          ])
        )
      })
    })

    describe('Validation Phase', () => {
      it('should generate validation operations', async () => {
        const phase: WorkflowPhase = 'validation'
        const context = {
          configured: [
            { nodeId: 'node_1', parameters: {} },
            { nodeId: 'node_2', parameters: {} }
          ]
        }

        mockAnthropicClient.messages.create = jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              operations: [
                {
                  type: 'validateNode',
                  nodeId: 'node_1',
                  result: { valid: true }
                },
                {
                  type: 'validateNode',
                  nodeId: 'node_2',
                  result: { valid: false, errors: [{ message: 'Missing channel' }] }
                }
              ],
              reasoning: ['Validated configurations']
            })
          }]
        })

        const result = await claudeService.processWorkflowPhase(
          phase,
          'Validate nodes',
          'session-123',
          undefined,
          context
        )

        expect(result.operations).toHaveLength(2)
        const validationOps = result.operations.filter(op => op.type === 'validateNode')
        expect(validationOps).toHaveLength(2)
      })
    })

    describe('Building Phase', () => {
      it('should generate building operations', async () => {
        const phase: WorkflowPhase = 'building'
        const context = {
          validated: [
            { nodeId: 'node_1', nodeType: 'nodes-base.webhook' },
            { nodeId: 'node_2', nodeType: 'nodes-base.slack' }
          ]
        }

        mockAnthropicClient.messages.create = jest.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              operations: [
                {
                  type: 'addToWorkflow',
                  nodeId: 'node_1',
                  position: [100, 100]
                },
                {
                  type: 'addToWorkflow',
                  nodeId: 'node_2',
                  position: [300, 100]
                },
                {
                  type: 'addConnection',
                  source: 'node_1',
                  target: 'node_2'
                },
                {
                  type: 'updateWorkflowSettings',
                  settings: { name: 'Webhook to Slack' }
                }
              ],
              reasoning: ['Built workflow structure']
            })
          }]
        })

        const result = await claudeService.processWorkflowPhase(
          phase,
          'Build workflow',
          'session-123',
          undefined,
          context
        )

        expect(result.operations).toHaveLength(4)
        expect(result.operations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'addToWorkflow' }),
            expect.objectContaining({ type: 'addConnection' }),
            expect.objectContaining({ type: 'updateWorkflowSettings' })
          ])
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors with retryable flag', async () => {
      mockAnthropicClient.messages.create = jest.fn()
        .mockRejectedValue(new Error('Rate limit exceeded'))

      await expect(
        claudeService.processWorkflowPhase('discovery', 'test', 'session-123')
      ).rejects.toThrow('Rate limit exceeded')
    })

    it('should handle missing API key', async () => {
      delete process.env.ANTHROPIC_API_KEY
      
      expect(() => new ClaudeService()).toThrow('ANTHROPIC_API_KEY is not configured')
    })

    it('should validate operations have required fields', async () => {
      mockAnthropicClient.messages.create = jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            operations: [
              { type: 'discoverNode' }, // Missing node field
              { type: 'selectNode' } // Missing nodeId field
            ]
          })
        }]
      })

      const result = await claudeService.processWorkflowPhase(
        'discovery',
        'test',
        'session-123'
      )

      // Should filter out invalid operations
      expect(result.operations.length).toBeLessThan(2)
    })
  })

  describe('Context Handling', () => {
    it('should include clarification history in context', async () => {
      const phase: WorkflowPhase = 'discovery'
      const context = {
        clarificationHistory: [
          {
            questionId: 'q1',
            question: 'What data format?',
            response: 'JSON',
            timestamp: new Date()
          }
        ]
      }

      await claudeService.processWorkflowPhase(
        phase,
        'Continue discovery',
        'session-123',
        undefined,
        context
      )

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('clarification')
            })
          ])
        })
      )
    })
  })
})