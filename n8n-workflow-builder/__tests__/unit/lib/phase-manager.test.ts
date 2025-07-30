// __tests__/unit/lib/phase-manager.test.ts

import { PhaseManager } from '@/lib/phase-manager'
import { WorkflowPhase, WorkflowSession } from '@/types/workflow'
import { createMockSession } from '@/__tests__/test-utils'

describe('PhaseManager', () => {
  let phaseManager: PhaseManager

  beforeEach(() => {
    phaseManager = new PhaseManager()
  })

  describe('canTransition', () => {
    describe('Discovery Phase', () => {
      it('should allow transition when nodes are selected', () => {
        const session = createMockSession({
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

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(true)
        expect(result.autoTransition).toBe(false) // Discovery requires manual confirmation
        expect(result.nextPhase).toBe('configuration')
      })

      it('should prevent transition without selected nodes', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'discovery',
            discovered: [
              { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Webhook' }
            ],
            selected: [] // No selected nodes
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(false)
        expect(result.reason).toContain('No nodes selected')
      })

      it('should prevent transition with pending clarifications', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'discovery',
            selected: ['node_1'],
            pendingClarifications: [{
              questionId: 'q1',
              question: 'What format?',
              context: {},
              timestamp: new Date()
            }]
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(false)
        expect(result.reason).toContain('clarification')
      })
    })

    describe('Configuration Phase', () => {
      it('should auto-transition when all nodes configured', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'configuration',
            selected: ['node_1', 'node_2'],
            configured: new Map([
              ['node_1', { nodeId: 'node_1', nodeType: 'nodes-base.webhook', parameters: {} }],
              ['node_2', { nodeId: 'node_2', nodeType: 'nodes-base.slack', parameters: {} }]
            ])
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(true)
        expect(result.autoTransition).toBe(true)
        expect(result.nextPhase).toBe('validation')
      })

      it('should prevent transition with unconfigured nodes', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'configuration',
            selected: ['node_1', 'node_2'],
            configured: new Map([
              ['node_1', { nodeId: 'node_1', nodeType: 'nodes-base.webhook', parameters: {} }]
              // node_2 not configured
            ])
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(false)
        expect(result.reason).toContain('1 node(s) still need configuration')
      })
    })

    describe('Validation Phase', () => {
      it('should auto-transition to building when all valid', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'validation',
            configured: new Map([
              ['node_1', { nodeId: 'node_1', nodeType: 'nodes-base.webhook', parameters: {} }],
              ['node_2', { nodeId: 'node_2', nodeType: 'nodes-base.slack', parameters: {} }]
            ]),
            validated: new Map([
              ['node_1', { valid: true }],
              ['node_2', { valid: true }]
            ])
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(true)
        expect(result.autoTransition).toBe(true)
        expect(result.nextPhase).toBe('building')
      })

      it('should auto-transition back to configuration on errors', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'validation',
            configured: new Map([
              ['node_1', { nodeId: 'node_1', nodeType: 'nodes-base.webhook', parameters: {} }],
              ['node_2', { nodeId: 'node_2', nodeType: 'nodes-base.slack', parameters: {} }]
            ]),
            validated: new Map([
              ['node_1', { valid: true }],
              ['node_2', { 
                valid: false, 
                errors: [{ nodeId: 'node_2', message: 'Missing channel', severity: 'error' }] 
              }]
            ])
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(true)
        expect(result.autoTransition).toBe(true)
        expect(result.nextPhase).toBe('configuration')
        expect(result.reason).toContain('errors found')
      })
    })

    describe('Building Phase', () => {
      it('should auto-transition to complete when workflow built', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'building',
            workflow: {
              nodes: [
                { id: 'node_1', type: 'nodes-base.webhook', position: [100, 100], parameters: {} },
                { id: 'node_2', type: 'nodes-base.slack', position: [300, 100], parameters: {} }
              ],
              connections: [
                { source: 'node_1', target: 'node_2' }
              ],
              settings: { name: 'Test Workflow' }
            }
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(true)
        expect(result.autoTransition).toBe(true)
        expect(result.nextPhase).toBe('complete')
      })

      it('should prevent transition without nodes', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'building',
            workflow: {
              nodes: [],
              connections: [],
              settings: { name: 'Test' }
            }
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(false)
        expect(result.reason).toContain('No nodes in workflow')
      })
    })

    describe('Complete Phase', () => {
      it('should not allow transition from complete phase', () => {
        const session = createMockSession({
          state: {
            ...createMockSession().state,
            phase: 'complete'
          }
        })

        const result = phaseManager.canTransition(session.state)

        expect(result.canProgress).toBe(false)
        expect(result.reason).toContain('already complete')
      })
    })
  })

  describe('getAllowedOperations', () => {
    it('should return correct operations for discovery phase', () => {
      const operations = phaseManager.getAllowedOperations('discovery')

      expect(operations).toContain('discoverNode')
      expect(operations).toContain('selectNode')
      expect(operations).toContain('deselectNode')
      expect(operations).toContain('requestClarification')
      expect(operations).toContain('clarificationResponse')
      expect(operations).not.toContain('configureNode')
      expect(operations).not.toContain('validateNode')
    })

    it('should return correct operations for configuration phase', () => {
      const operations = phaseManager.getAllowedOperations('configuration')

      expect(operations).toContain('configureNode')
      expect(operations).toContain('updateNodeConfig')
      expect(operations).not.toContain('discoverNode')
      expect(operations).not.toContain('validateNode')
    })

    it('should return correct operations for validation phase', () => {
      const operations = phaseManager.getAllowedOperations('validation')

      expect(operations).toContain('validateNode')
      expect(operations).toContain('addValidationError')
      expect(operations).not.toContain('configureNode')
      expect(operations).not.toContain('addToWorkflow')
    })

    it('should return correct operations for building phase', () => {
      const operations = phaseManager.getAllowedOperations('building')

      expect(operations).toContain('addToWorkflow')
      expect(operations).toContain('addConnection')
      expect(operations).toContain('updateWorkflowSettings')
      expect(operations).not.toContain('discoverNode')
      expect(operations).not.toContain('validateNode')
    })

    it('should return empty array for complete phase', () => {
      const operations = phaseManager.getAllowedOperations('complete')

      expect(operations).toEqual([])
    })
  })

  describe('validateOperation', () => {
    it('should validate operations for current phase', () => {
      const discoveryOp = { type: 'discoverNode' as const, node: { id: '1', type: 'test', purpose: 'test' } }
      const configOp = { type: 'configureNode' as const, nodeId: '1', config: {} }

      expect(phaseManager.validateOperation(discoveryOp, 'discovery')).toBe(true)
      expect(phaseManager.validateOperation(discoveryOp, 'configuration')).toBe(false)
      expect(phaseManager.validateOperation(configOp, 'configuration')).toBe(true)
      expect(phaseManager.validateOperation(configOp, 'discovery')).toBe(false)
    })

    it('should always allow phase transition operations', () => {
      const setPhaseOp = { type: 'setPhase' as const, phase: 'configuration' as WorkflowPhase }
      const completePhaseOp = { type: 'completePhase' as const, phase: 'discovery' as WorkflowPhase }

      // Should be allowed in any phase
      expect(phaseManager.validateOperation(setPhaseOp, 'discovery')).toBe(true)
      expect(phaseManager.validateOperation(setPhaseOp, 'validation')).toBe(true)
      expect(phaseManager.validateOperation(completePhaseOp, 'building')).toBe(true)
    })
  })

  describe('getPhaseTools', () => {
    it('should return correct MCP tools for discovery phase', () => {
      const tools = phaseManager.getPhaseTools('discovery')

      expect(tools).toContain('search_nodes')
      expect(tools).toContain('get_node_info')
      expect(tools).toContain('list_node_types')
      expect(tools).not.toContain('validate_workflow')
    })

    it('should return correct tools for configuration phase', () => {
      const tools = phaseManager.getPhaseTools('configuration')

      expect(tools).toContain('get_node_essentials')
      expect(tools).toContain('get_node_schema')
      expect(tools).toContain('validate_params')
      expect(tools).not.toContain('search_nodes')
    })

    it('should return correct tools for validation phase', () => {
      const tools = phaseManager.getPhaseTools('validation')

      expect(tools).toContain('validate_workflow')
      expect(tools).toContain('check_connections')
      expect(tools).toContain('get_input_schema')
      expect(tools).toContain('get_output_schema')
    })

    it('should return correct tools for building phase', () => {
      const tools = phaseManager.getPhaseTools('building')

      expect(tools).toContain('generate_workflow')
      expect(tools).toContain('optimize_workflow')
      expect(tools).not.toContain('validate_workflow')
    })

    it('should return empty array for complete phase', () => {
      const tools = phaseManager.getPhaseTools('complete')

      expect(tools).toEqual([])
    })
  })
})