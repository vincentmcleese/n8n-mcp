// Test environment setup
export function setupTestEnvironment() {
  // Set all required environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Mock all required env vars
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.ANTHROPIC_API_KEY = 'sk-test-key';
  process.env.MCP_SERVER_URL = 'http://localhost:3001';
  process.env.MCP_API_KEY = 'test-mcp-key';
  process.env.MCP_PROFILE = 'test';
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  
  // Additional test flags
  process.env.SKIP_ENV_VALIDATION = 'true';
  process.env.TEST_MODE = 'true';
}