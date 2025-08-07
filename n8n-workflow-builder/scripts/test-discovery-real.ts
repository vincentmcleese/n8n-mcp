#!/usr/bin/env tsx

/**
 * Discovery Runner Direct Test
 * 
 * This script tests the DiscoveryRunner class directly with real services.
 * It's a lower-level test compared to the integration test.
 * 
 * Use cases:
 * - Testing DiscoveryRunner in isolation
 * - Debugging discovery phase issues
 * - Quick smoke tests with simple scenarios
 * 
 * For full integration testing, use: npm run test:discovery
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables first
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'info';

// Use dynamic imports to ensure env vars are loaded
import chalk from 'chalk';
import * as readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to wait for user to press Enter
function waitForEnter(message: string = 'Press Enter to continue...'): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`\n${message} `), (answer) => {
      // Return false if user wants to skip remaining tests
      resolve(answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'skip');
    });
  });
}

async function testDiscovery() {
  // Dynamic imports after env is loaded
  const { MCPClient } = await import('@/lib/mcp-client');
  const { createPhaseServices } = await import('@/services/claude');
  const { DiscoveryRunner } = await import('@/lib/orchestrator/runners/discovery.runner');
  const { NodeContextService } = await import('@/lib/orchestrator/context/NodeContextService');
  const { SessionRepo } = await import('@/lib/orchestrator/context/SessionRepo');
  const { loggers } = await import('@/lib/utils/logger');
  const { isAnthropicConfigured, isMCPConfigured } = await import('@/lib/config');
  
  console.log(chalk.bold.blue('\n🚀 Testing Discovery with Real Services\n'));
  
  // Check configuration
  if (!isAnthropicConfigured()) {
    console.error(chalk.red('❌ Anthropic API not configured. Set ANTHROPIC_API_KEY in .env.local'));
    process.exit(1);
  }
  
  if (!isMCPConfigured()) {
    console.error(chalk.red('❌ MCP not configured. Set MCP_SERVER_URL, MCP_API_KEY, and MCP_PROFILE in .env.local'));
    process.exit(1);
  }
  
  try {
    // Connect to MCP
    console.log(chalk.gray('Connecting to MCP server...'));
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL!,
      apiKey: process.env.MCP_API_KEY!,
      profile: process.env.MCP_PROFILE!
    });
    
    await mcpClient.connect();
    console.log(chalk.green('✅ MCP connected'));
    
    // Test MCP
    const stats = await mcpClient.callTool('get_database_statistics', {});
    console.log(chalk.gray(`   MCP has ${JSON.parse(stats?.content?.[0]?.text || '{}').totalNodes || 0} nodes available`));
    
    // Create Claude service
    console.log(chalk.gray('Initializing Claude service...'));
    const phaseServices = createPhaseServices();
    console.log(chalk.green('✅ Claude service ready'));
    
    // Test Claude
    const healthCheck = await phaseServices.discovery.analyzeIntent({
      prompt: 'Create a simple webhook'
    });
    
    if (!healthCheck.success) {
      throw new Error('Claude health check failed');
    }
    console.log(chalk.green('✅ Claude API working'));
    
    // Create dependencies
    const nodeContextService = new NodeContextService(mcpClient);
    const sessionRepo = new SessionRepo();
    
    // Create discovery runner
    const runner = new DiscoveryRunner({
      claudeService: phaseServices.discovery,
      nodeContextService,
      sessionRepo,
      loggers
    });
    
    // Test scenarios
    const testCases = [
      {
        name: 'Simple Webhook',
        prompt: 'Create a webhook that responds with success'
      },
      {
        name: 'Slack Integration',
        prompt: 'Create a webhook that sends Slack notifications'
      },
      {
        name: 'Database Operation',
        prompt: 'Get data from an API and save it to PostgreSQL'
      }
    ];
    
    console.log(chalk.bold.blue('\n📝 Running Test Cases\n'));
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(chalk.cyan(`\n[${i + 1}/${testCases.length}] Testing: ${testCase.name}`));
      console.log(chalk.gray(`Prompt: "${testCase.prompt}"`));
      
      const sessionId = `test_${Date.now()}`;
      const startTime = Date.now();
      
      try {
        const result = await runner.run(
          { sessionId, prompt: testCase.prompt },
          {
            sessionId,
            operationLogger: {
              withTokenTracking: () => ({
                logger: loggers.orchestrator,
                onTokenUsage: () => {}
              }),
              logBatch: async () => {},
              logPhaseCompletion: async () => {}
            }
          }
        );
        
        const duration = Date.now() - startTime;
        
        if (result.success) {
          console.log(chalk.green(`✅ Success in ${duration}ms`));
          console.log(chalk.gray(`   Discovered: ${result.discoveredNodes.length} nodes`));
          console.log(chalk.gray(`   Selected: ${result.selectedNodeIds.length} nodes`));
          
          // Show node types
          const nodeTypes = result.discoveredNodes
            .filter(n => result.selectedNodeIds.includes(n.id))
            .map(n => n.type);
          console.log(chalk.gray(`   Nodes: ${nodeTypes.join(', ')}`));
          
          // Show more details if needed
          if (result.pendingClarification) {
            console.log(chalk.yellow(`   ⚠️  Clarification needed: ${result.pendingClarification.question}`));
          }
          
          // Show reasoning if available
          if (result.reasoning && result.reasoning.length > 0) {
            console.log(chalk.gray('\n   Reasoning:'));
            result.reasoning.forEach(r => console.log(chalk.gray(`   - ${r}`)));
          }
        } else {
          console.log(chalk.red(`❌ Failed: ${result.error?.message}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
      }
      
      // Wait for user to continue (except for the last test)
      if (i < testCases.length - 1) {
        const shouldContinue = await waitForEnter(
          `Press Enter to run test ${i + 2}/${testCases.length} (or type 's' to skip remaining tests)...`
        );
        
        if (!shouldContinue) {
          console.log(chalk.yellow('\n⏭️  Skipping remaining tests...'));
          break;
        }
      }
    }
    
    // Cleanup
    await mcpClient.disconnect();
    rl.close(); // Close the readline interface
    console.log(chalk.bold.green('\n✨ All tests completed!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    rl.close(); // Make sure to close readline on error
    process.exit(1);
  }
}

// Run the test
testDiscovery().catch((error) => {
  console.error(error);
  rl.close(); // Make sure to close readline on error
  process.exit(1);
});