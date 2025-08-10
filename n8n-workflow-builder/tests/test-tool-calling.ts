/**
 * Simple test to verify tool calling works
 */

import { MCPClient } from '@/lib/mcp-client';
import { ConfigurationPhaseService } from '@/services/claude/phases/configuration';
import { loggers } from '@/lib/utils/logger';

// Set log level to see tool calls
process.env.LOG_LEVEL = 'debug';

async function testToolCalling() {
  console.log('🧪 Testing Tool Calling Implementation');
  console.log('=====================================\n');
  
  try {
    // Initialize MCP client
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL || 'default',
      apiKey: process.env.SMITHERY_API_KEY!,
      profile: 'n8n'
    });
    
    // Create configuration service with MCP client
    const configService = new ConfigurationPhaseService({
      mcpClient,
      onTokenUsage: (tokens) => {
        console.log(`   Token usage: ${tokens}`);
      }
    });
    
    // Test configuration with a prompt that should trigger tool use
    const input = {
      prompt: `Configure an HttpRequest node for the user's goal: 
        "I need to call an API with authentication headers and retry on failure"
        
        Node ID: test_node_1
        Node Type: HttpRequest
        
        The essentials show basic properties but the user needs authentication and retry configuration.`,
      selectedNodes: ['test_node_1'],
      context: {
        discoveredNodes: [{
          id: 'test_node_1',
          type: 'HttpRequest',
          purpose: 'Make HTTP API calls with authentication'
        }],
        nodeSchemas: {
          HttpRequest: {
            typeVersion: 4.2,
            commonProperties: ['url', 'method', 'responseFormat'],
            requiredProperties: ['url', 'method']
          }
        }
      }
    };
    
    console.log('📝 Test Input:');
    console.log('   User needs: authentication headers and retry on failure');
    console.log('   Node type: HttpRequest\n');
    
    console.log('🚀 Calling Configuration Service...\n');
    
    // Execute configuration
    const result = await configService.execute(input, {
      sessionId: 'test-session',
      userIntent: 'Test authentication and retry configuration'
    });
    
    if (result.success) {
      console.log('\n✅ Configuration completed successfully!');
      console.log('\n📊 Results:');
      console.log('   Operations generated:', result.data?.operations?.length || 0);
      
      // Check if Claude used tools
      const toolLogs = loggers.tools || loggers.claude;
      console.log('\n🔧 Tool Usage:');
      console.log('   Check the logs above for tool calls (look for 🔧 symbols)');
      
      if (result.data?.operations?.[0]) {
        const config = result.data.operations[0];
        console.log('\n📦 Generated Configuration:');
        console.log(JSON.stringify(config, null, 2));
      }
    } else {
      console.error('\n❌ Configuration failed:', result.error);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
  
  console.log('\n✨ Test complete!');
  process.exit(0);
}

// Run the test
console.log('Starting tool calling test...\n');
testToolCalling().catch(console.error);