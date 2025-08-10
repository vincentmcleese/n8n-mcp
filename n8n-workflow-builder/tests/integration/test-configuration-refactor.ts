#!/usr/bin/env tsx

/**
 * Integration Test for Configuration Phase Refactor
 * 
 * Tests the optimized essentials-based configuration flow with REAL services:
 * 1. Customize pre-configured task nodes from templates
 * 2. Use node essentials for searched nodes (5KB vs 100KB+)
 * 3. Apply category-specific rules
 * 4. Single-pass configuration (no retries)
 * 5. Parallel processing for efficiency
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables BEFORE any module imports (critical!)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n') || args.some(a => a.startsWith('--test='));

// Set log level based on verbose flag
if (!isVerbose) {
  process.env.LOG_LEVEL = 'info';
} else {
  process.env.LOG_LEVEL = 'debug';
  process.env.TEST_VERBOSE = 'true';
}

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
      resolve(answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'skip');
    });
  });
}

// Test scenarios from simple to complex
const TEST_SCENARIOS = [
  // === SIMPLE NODES (Single purpose, minimal config) ===
  {
    name: "Simple Task Node - Slack Message",
    prompt: "Send a message to Slack channel #general saying 'Hello World'",
    discoveryOutput: {
      taskNodes: [{
        id: 'task_slack_1',
        type: 'n8n-nodes-base.slack',
        displayName: 'Send Slack message',
        purpose: 'Pre-configured: send_slack_message',
        isPreConfigured: true,
        config: { resource: 'message', operation: 'post', text: 'Hello World', channel: '#general' }
      }],
      searchNodes: []
    },
    expectedConfigs: 1,
    description: "Should customize pre-configured Slack task node from template"
  },
  
  {
    name: "Simple Search Node - HTTP Request",
    prompt: "Make a GET request to https://api.example.com/data",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_http_1',
        type: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
        purpose: 'Make HTTP API calls',
        category: 'http',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure HTTP node with essentials"
  },

  // === MEDIUM COMPLEXITY (Multiple properties, some logic) ===
  {
    name: "Medium - Code Node with Logic",
    prompt: "Transform JSON data by doubling all numeric values",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_code_1',
        type: 'n8n-nodes-base.code',
        displayName: 'Code',
        purpose: 'Transform data with custom JavaScript',
        category: 'transform',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure Code node with essentials"
  },
  
  {
    name: "Medium - Conditional Logic",
    prompt: "Route items based on amount field being over 100",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_if_1',
        type: 'n8n-nodes-base.if',
        displayName: 'IF',
        purpose: 'Add conditional logic',
        category: 'logic',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure IF node with essentials"
  },

  // === COMPLEX NODES (Multiple settings, advanced config) ===
  {
    name: "Complex - Email with Attachments",
    prompt: "Send an email with subject, body and file attachments",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_email_1',
        type: 'n8n-nodes-base.emailSend',
        displayName: 'Send Email',
        purpose: 'Send emails with attachments',
        category: 'communication',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure Email node with complex options"
  },

  {
    name: "Complex - MongoDB Aggregation",
    prompt: "Query MongoDB with aggregation pipeline",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_mongo_1',
        type: 'n8n-nodes-base.mongoDb',
        displayName: 'MongoDB',
        purpose: 'Database operations',
        category: 'database',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure MongoDB with essentials"
  },

  // === AI/LLM NODES (Special handling) ===
  {
    name: "AI Node - OpenAI Chat",
    prompt: "Create an AI chat agent with custom system message",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [{
        id: 'search_openai_1',
        type: '@n8n/n8n-nodes-langchain.openAi',
        displayName: 'OpenAI',
        purpose: 'AI chat agent',
        category: 'ai',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 1,
    description: "Should configure OpenAI node with essentials"
  },

  // === MIXED SCENARIOS (Pre-configured + search nodes) ===
  {
    name: "Mixed - Task and Search Nodes",
    prompt: "Receive webhook, transform data, and send to Slack",
    discoveryOutput: {
      taskNodes: [{
        id: 'task_webhook_1',
        type: 'n8n-nodes-base.webhook',
        displayName: 'Webhook',
        purpose: 'Pre-configured: receive_webhook',
        isPreConfigured: true,
        config: { httpMethod: 'POST', path: 'webhook' }
      },
      {
        id: 'task_slack_2',
        type: 'n8n-nodes-base.slack',
        displayName: 'Send Slack message',
        purpose: 'Pre-configured: send_slack_message',
        isPreConfigured: true,
        config: { resource: 'message', operation: 'post', text: '{{$json.message}}', channel: '#general' }
      }],
      searchNodes: [{
        id: 'search_code_2',
        type: 'n8n-nodes-base.code',
        displayName: 'Code',
        purpose: 'Transform data',
        category: 'transform',
        isPreConfigured: false
      }]
    },
    expectedConfigs: 3,
    description: "Should customize task nodes from templates, configure search nodes from essentials"
  },

  // === PARALLEL CONFIGURATION TEST ===
  {
    name: "Parallel - Multiple Search Nodes",
    prompt: "Process data through multiple services",
    discoveryOutput: {
      taskNodes: [],
      searchNodes: [
        {
          id: 'search_http_2',
          type: 'n8n-nodes-base.httpRequest',
          displayName: 'HTTP Request',
          purpose: 'API call',
          category: 'http',
          isPreConfigured: false
        },
        {
          id: 'search_google_1',
          type: 'n8n-nodes-base.googleSheets',
          displayName: 'Google Sheets',
          purpose: 'Read spreadsheet data',
          category: 'google',
          isPreConfigured: false
        },
        {
          id: 'search_twilio_1',
          type: 'n8n-nodes-base.twilio',
          displayName: 'Twilio',
          purpose: 'Send SMS',
          category: 'communication',
          isPreConfigured: false
        }
      ]
    },
    expectedConfigs: 3,
    description: "Should configure 3 nodes in parallel"
  }
];

class ConfigurationIntegrationTest {
  private orchestrator: any;
  private taskService: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    console.log(chalk.yellow('⚠️  Using REAL Claude API and MCP services - this will consume tokens!\n'));
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('../../lib/workflow-orchestrator');
    const { TaskService } = await import('../../services/mcp/task-service');
    const { createLogger } = await import('../../lib/utils/logger');
    
    try {
      // Create orchestrator which will handle everything
      this.orchestrator = new WorkflowOrchestrator();
      
      // Create TaskService using the orchestrator's MCP client
      // The orchestrator already has a properly configured MCP client
      const logger = createLogger({ 
        component: 'test-config',
        level: process.env.LOG_LEVEL || 'info'
      });
      // Use the MCP client from the orchestrator
      this.taskService = new TaskService(this.orchestrator.mcpClient, logger);
      
      console.log(chalk.green('✅ Test environment ready with TaskService\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize test environment:'), error);
      throw error;
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Prompt: "${scenario.prompt}"`));
    
    const sessionId = `test_config_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // First, we need to set up the session with discovered nodes
      // Since we're simulating the configuration phase, we need to prepare the session
      // as if discovery had already run
      
      // Prepare the discovered nodes and selected IDs
      const allNodes = [
        ...scenario.discoveryOutput.taskNodes,
        ...scenario.discoveryOutput.searchNodes
      ];
      
      // Fetch real task templates for pre-configured nodes
      for (const taskNode of scenario.discoveryOutput.taskNodes) {
        if (taskNode.isPreConfigured && taskNode.purpose) {
          // Extract task name from purpose (e.g., "Pre-configured: receive_webhook" → "receive_webhook")
          let taskName = '';
          if (taskNode.purpose.includes(':')) {
            taskName = taskNode.purpose.split(':')[1].trim();
          } else {
            // Fallback: try to infer from node type or purpose
            taskName = taskNode.purpose.toLowerCase().replace(/\s+/g, '_');
          }
          
          if (taskName) {
            try {
              if (isVerbose) {
                console.log(chalk.gray(`   Fetching task template for: ${taskName}`));
              }
              // fetchTaskNodes takes an array and returns batch results
              const result = await this.taskService.fetchTaskNodes([taskName]);
              const taskTemplate = result.successful.find(t => t.taskName === taskName);
              if (taskTemplate) {
                // Replace the fake config with the real template
                taskNode.config = taskTemplate.config;
                taskNode.category = taskTemplate.category || taskNode.category;
                // Don't update the node type - keep the original for validation compatibility
                // The config is what matters, not the exact type string
                if (isVerbose) {
                  console.log(chalk.gray(`   ✓ Got template for ${taskName}`));
                }
              } else {
                console.log(chalk.yellow(`   ⚠️  No template found for ${taskName}, using mock config`));
              }
            } catch (error) {
              console.log(chalk.yellow(`   ⚠️  Failed to fetch template for ${taskName}: ${error}`));
            }
          }
        }
      }
      
      const selectedNodeIds = allNodes.map(n => n.id);
      
      // Initialize session with discovered nodes (simulate discovery output)
      await this.orchestrator.sessionRepo.initialize(sessionId, scenario.prompt);
      
      // Create operations to add discovered nodes and select them
      const operations: any[] = [];
      
      // Add each discovered node
      for (const node of allNodes) {
        operations.push({
          type: 'discoverNode',
          node: {
            id: node.id,
            type: node.type,
            displayName: node.displayName,
            purpose: node.purpose,
            category: node.category,
            isPreConfigured: node.isPreConfigured,
            config: node.config
          }
        });
      }
      
      // Select all nodes (one operation per node)
      for (const nodeId of selectedNodeIds) {
        operations.push({
          type: 'selectNode',
          nodeId: nodeId
        });
      }
      
      // Mark discovery as complete
      operations.push({
        type: 'completePhase',
        phase: 'discovery'
      });
      
      if (isVerbose) {
        console.log(chalk.gray(`   Setting up session with ${allNodes.length} discovered nodes`));
        console.log(chalk.gray(`   Selected node IDs: ${selectedNodeIds.join(', ')}`));
      }
      
      // Persist all operations
      await this.orchestrator.sessionRepo.persistOperations(sessionId, operations);
      
      // Force save to ensure persistence
      await this.orchestrator.sessionRepo.save(sessionId);
      
      // Verify the session has the nodes
      const verifySession = await this.orchestrator.sessionRepo.load(sessionId);
      if (isVerbose && verifySession) {
        console.log(chalk.gray(`   Verified session has ${verifySession.state.discovered?.length || 0} discovered nodes`));
        console.log(chalk.gray(`   Verified session has ${verifySession.state.selected?.length || 0} selected nodes`));
      }
      
      // Run configuration phase using the orchestrator
      const result = await this.orchestrator.runConfigurationPhase(sessionId);
      const duration = Date.now() - startTime;
      
      // Extract metrics from the result
      const taskNodesConfigured = result.configured?.filter((n: any) => 
        scenario.discoveryOutput.taskNodes.some(t => t.id === n.id)
      ).length || 0;
      const searchNodesConfigured = result.configured?.filter((n: any) => 
        scenario.discoveryOutput.searchNodes.some(s => s.id === n.id)
      ).length || 0;
      const totalConfigured = result.configured?.length || 0;
      
      // Validate results
      let testFailed = false;
      let failureReasons = [];
      
      if (!result.success) {
        failureReasons.push(`Configuration failed: ${result.error?.message}`);
        testFailed = true;
      }
      
      if (totalConfigured !== scenario.expectedConfigs) {
        failureReasons.push(`Expected ${scenario.expectedConfigs} configs, got ${totalConfigured}`);
        testFailed = true;
      }
      
      // Display results
      if (testFailed) {
        console.log(chalk.red(`   ❌ Test FAILED in ${duration}ms`));
        console.log(chalk.red(`      Reasons: ${failureReasons.join('; ')}`));
      } else {
        console.log(chalk.green(`   ✅ Test passed in ${duration}ms`));
      }
      console.log(chalk.gray(`      Total configured: ${totalConfigured} nodes`));
      if (taskNodesConfigured > 0) {
        console.log(chalk.gray(`      Task nodes (customized from templates): ${taskNodesConfigured}`));
      }
      if (searchNodesConfigured > 0) {
        console.log(chalk.gray(`      Search nodes (configured from essentials): ${searchNodesConfigured}`));
      }
      
      // Show reasoning if verbose
      if (isVerbose && result.reasoning && result.reasoning.length > 0) {
        console.log(chalk.gray('\n   LLM Reasoning:'));
        result.reasoning.forEach((r: string) => {
          console.log(chalk.gray(`      📝 ${r}`));
        });
      }
      
      // Show configurations if verbose
      if (isVerbose && result.configured && result.configured.length > 0) {
        console.log(chalk.gray('\n   Configurations:'));
        result.configured.forEach((node: any) => {
          const status = node.validated ? '✅' : '⚠️';
          const configStr = JSON.stringify(node.config, null, 2).substring(0, 100);
          console.log(chalk.gray(`      ${status} ${node.type}:`));
          console.log(chalk.gray(`         ${configStr}...`));
        });
      }
      
      // Return failure if test failed
      if (testFailed) {
        return { 
          success: false, 
          duration, 
          error: new Error(failureReasons.join('; ')),
          result 
        };
      }
      
      return { success: true, duration, result };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Configuration Phase Integration Tests (OPTIMIZED)\n'));
    console.log(chalk.gray('Testing essentials-based configuration with 95% token reduction...'));
    console.log(chalk.gray('Key improvements: Customize task templates, use essentials (5KB), parallel processing\n'));
    
    await this.setup();
    
    const results: any[] = [];
    const testArg = args.find(a => a.startsWith('--test='));
    const scenarios = testArg
      ? TEST_SCENARIOS.filter(s => s.name === testArg.split('=')[1])
      : TEST_SCENARIOS;
    
    // Check if no scenarios were found when a test name was specified
    if (testArg && scenarios.length === 0) {
      console.log(chalk.red(`\n❌ No test found with name: "${testArg.split('=')[1]}"`));
      console.log(chalk.yellow('\nAvailable tests:'));
      TEST_SCENARIOS.forEach(s => {
        console.log(chalk.gray(`  - ${s.name}`));
      });
      process.exit(1);
    }
    
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(chalk.blue(`\n📋 Test ${i + 1}/${scenarios.length}: ${scenario.name}`));
      console.log(chalk.gray('─'.repeat(60)));
      
      // Ask before running each test (unless skipping prompts)
      if (!skipPrompts) {
        const shouldRun = await waitForEnter(
          `Press Enter to run this test (or type 's' to skip)...`
        );
        
        if (!shouldRun) {
          console.log(chalk.yellow(`⏭️  Skipped`));
          results.push({ 
            scenario: scenario.name, 
            success: false, 
            duration: 0,
            error: new Error('Skipped by user')
          });
          continue;
        }
      }
      
      const result = await this.runTest(scenario);
      results.push({ scenario: scenario.name, ...result });
    }
    
    // Close readline interface before summary
    rl.close();
    
    // Summary
    console.log(chalk.bold.blue('\n📊 Test Summary\n'));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && r.error?.message !== 'Skipped by user').length;
    const skipped = results.filter(r => r.error?.message === 'Skipped by user').length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(chalk.green(`   ✅ Passed: ${passed}/${results.length}`));
    if (failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failed}/${results.length}`));
    }
    if (skipped > 0) {
      console.log(chalk.yellow(`   ⏭️  Skipped: ${skipped}/${results.length}`));
    }
    
    console.log(chalk.gray(`\n   ⏱️  Total time: ${totalDuration}ms`));
    console.log(chalk.gray(`   ⚡ Average: ${Math.round(totalDuration / Math.max(1, results.length - skipped))}ms per test`));
    
    // Group results by test type
    console.log(chalk.gray('\n   Test categories:'));
    const simple = results.filter(r => r.scenario.includes('Simple'));
    const medium = results.filter(r => r.scenario.includes('Medium'));
    const complex = results.filter(r => r.scenario.includes('Complex') || r.scenario.includes('AI'));
    const mixed = results.filter(r => r.scenario.includes('Mixed') || r.scenario.includes('Parallel'));
    
    if (simple.length > 0) {
      console.log(chalk.gray(`      Simple nodes: ${simple.filter(r => r.success).length}/${simple.length} passed`));
    }
    if (medium.length > 0) {
      console.log(chalk.gray(`      Medium complexity: ${medium.filter(r => r.success).length}/${medium.length} passed`));
    }
    if (complex.length > 0) {
      console.log(chalk.gray(`      Complex nodes: ${complex.filter(r => r.success).length}/${complex.length} passed`));
    }
    if (mixed.length > 0) {
      console.log(chalk.gray(`      Mixed/Parallel: ${mixed.filter(r => r.success).length}/${mixed.length} passed`));
    }
    
    return passed === results.length - skipped;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Configuration Phase Integration Test (OPTIMIZED)')}

${chalk.gray('Usage:')} npm run test:configure [options]

${chalk.gray('Options:')}
  --verbose, -v     Show detailed output with reasoning
  --no-prompt, -n   Skip interactive prompts
  --test=NAME       Run only specific test (auto-skips prompts)
  --help, -h        Show this help message

${chalk.gray('Examples:')}
  npm run test:configure
  npm run test:configure --verbose
  npm run test:configure --test="Simple Task Node - Slack Message"

${chalk.gray('Optimizations Tested:')}
  - Customize task nodes from templates (efficient Claude calls)
  - Use node essentials for search nodes (5KB vs 100KB+ full schema)
  - Apply category-specific configuration rules
  - Single-pass configuration (no retry loops)
  - Parallel node configuration (max 3 concurrent)

${chalk.gray('Requirements:')}
  - ANTHROPIC_API_KEY must be set in .env.local
  - MCP credentials must be set in .env.local
`);
    process.exit(0);
  }
  
  try {
    const test = new ConfigurationIntegrationTest();
    const success = await test.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close(); // Make sure to close readline on error
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close(); // Make sure to close readline on error
    process.exit(1);
  });
}

export { ConfigurationIntegrationTest, TEST_SCENARIOS };