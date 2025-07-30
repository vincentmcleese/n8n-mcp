// __mocks__/@modelcontextprotocol/sdk.ts

export class Client {
  connect = jest.fn().mockResolvedValue({
    sessionId: 'mock-mcp-session',
    serverInfo: { name: 'n8n-mcp', version: '1.0.0' }
  })

  request = jest.fn().mockImplementation(({ method, params }) => {
    if (method === 'tools/call' && params?.name === 'search_nodes') {
      return Promise.resolve({
        content: [{
          type: 'text',
          text: JSON.stringify({
            nodes: [
              { nodeType: 'nodes-base.webhook', displayName: 'Webhook', description: 'Webhook trigger' },
              { nodeType: 'nodes-base.code', displayName: 'Code', description: 'Execute code' },
              { nodeType: 'nodes-base.slack', displayName: 'Slack', description: 'Send Slack message' },
            ]
          })
        }]
      })
    }
    return Promise.resolve({ content: [{ type: 'text', text: '{}' }] })
  })

  close = jest.fn().mockResolvedValue(undefined)
}

export const ClientOptions = jest.fn()