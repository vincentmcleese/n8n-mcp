// jest.setup.js
// Add custom jest matchers and global test setup

// For integration tests, use real API keys if available, otherwise use test keys
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key'
// Keep existing API keys for real integration tests
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key'
process.env.MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://test-mcp-server.com'
process.env.MCP_API_KEY = process.env.MCP_API_KEY || 'test-mcp-key'
process.env.MCP_PROFILE = process.env.MCP_PROFILE || 'test-profile'

// Polyfill for TextEncoder/TextDecoder for Node.js environment
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Add custom matchers if needed
expect.extend({
  toBeValidOperation(received) {
    const validTypes = [
      'discoverNode',
      'selectNode',
      'deselectNode',
      'requestClarification',
      'clarificationResponse',
      'configureNode',
      'updateNodeConfig',
      'validateNode',
      'addValidationError',
      'addToWorkflow',
      'addConnection',
      'updateWorkflowSettings',
      'setPhase',
      'completePhase',
    ]

    const pass = validTypes.includes(received.type)

    if (pass) {
      return {
        message: () => `expected ${received.type} not to be a valid operation type`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received.type} to be a valid operation type`,
        pass: false,
      }
    }
  },
})