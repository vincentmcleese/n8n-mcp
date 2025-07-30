// __mocks__/@anthropic-ai/sdk.ts

export class Anthropic {
  messages = {
    create: jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          operations: [
            { type: 'discoverNode', node: { id: 'node_1', type: 'nodes-base.webhook', purpose: 'Receive webhook data' } },
            { type: 'discoverNode', node: { id: 'node_2', type: 'nodes-base.code', purpose: 'Process data' } },
            { type: 'discoverNode', node: { id: 'node_3', type: 'nodes-base.slack', purpose: 'Send to Slack' } },
            { type: 'selectNode', nodeId: 'node_1' },
            { type: 'selectNode', nodeId: 'node_2' },
            { type: 'selectNode', nodeId: 'node_3' },
          ],
          reasoning: ['Analyzing user request', 'Identified webhook, processing, and notification needs']
        })
      }]
    })
  }

  constructor(config: any) {
    // Mock constructor
  }
}