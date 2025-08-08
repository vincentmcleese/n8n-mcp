#!/usr/bin/env tsx

/**
 * Integration Test for Discovery Phase Refactor
 * 
 * Tests the complete task-based discovery flow with REAL services:
 * 1. Intent analysis with exact task names (Anthropic API)
 * 2. Direct task fetching from MCP 
 * 3. Gap searching with optimized terms (MCP)
 * 4. Claude selection for gaps (Anthropic API)
 * 5. Hybrid assembly with proper flags
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables BEFORE any module imports (critical!)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment exactly like build-workflow.ts
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
      // Return false if user wants to skip the next test
      resolve(answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'skip');
    });
  });
}

// Test scenarios using actual MCP task names
const TEST_SCENARIOS = [
  {
    name: "HTTP API Call",
    prompt: "Make a POST request to an API endpoint with JSON data",
    expectedTasks: ["post_json_request"],
    expectedGaps: 0,
    description: "Should use pre-configured HTTP POST task"
  },
  {
    name: "Webhook Setup",
    prompt: "Create a webhook endpoint that receives and processes data",
    expectedTasks: ["receive_webhook"],
    expectedGaps: 0,
    description: "Should use webhook task template",
    clarificationResponse: "Store it in a database" // Default clarification response if needed
  },
  {
    name: "Database Operation",
    prompt: "Query data from PostgreSQL database",
    expectedTasks: ["query_postgres"],
    expectedGaps: 0,
    description: "Should use Postgres query task"
  },
  {
    name: "Complex Workflow",
    prompt: "Receive webhook data, transform it, and send to Slack if amount > 100",
    expectedTasks: ["receive_webhook", "filter_data", "send_slack_message"],
    expectedGaps: 0,
    description: "Should combine multiple task templates"
  },
  {
    name: "AI Workflow",
    prompt: "Create an AI agent that can use Google Sheets as a tool",
    expectedTasks: ["ai_agent_workflow", "use_google_sheets_as_tool"],
    expectedGaps: 0,
    description: "Should use AI-specific task templates"
  },
  // Conditional logic test - CRITICAL for understanding IF node discovery
  {
    name: "Conditional Logic - Amount Check",
    prompt: "Receive webhook with order data, check if amount is greater than 100, if yes send to Slack channel #high-value, if no send email to admin@example.com",
    expectedTasks: ["receive_webhook", "send_slack_message", "send_email"],
    expectedGaps: 1, // IF node should be identified as a gap that needs searching
    description: "Should identify need for conditional/IF node for routing logic"
  },
  // Partial task coverage scenarios
  {
    name: "Partial Coverage - Email Workflow",
    prompt: "Send an email notification when a form is submitted and save to a CSV file",
    expectedTasks: ["send_email"],
    expectedGaps: 2, // Form submission trigger and CSV save are gaps
    description: "Should find email task but need to search for form trigger and CSV nodes"
  },
  {
    name: "Partial Coverage - Data Processing",
    prompt: "Transform JSON data, validate against a schema, and store in MongoDB",
    expectedTasks: ["transform_data"],  // Fixed: actual task name is transform_data, not transform_json
    expectedGaps: 2, // Schema validation and MongoDB are gaps
    description: "Should find data transform task but search for validation and MongoDB nodes"
  },
  {
    name: "Partial Coverage - Mixed API/DB",
    prompt: "Fetch weather data from an API and update a MySQL database table",
    expectedTasks: ["get_api_data"],  // Fixed: actual task name is get_api_data
    expectedGaps: 1, // MySQL update is a gap
    description: "Should find API GET task but search for MySQL node"
  },
  // No task coverage scenarios
  {
    name: "No Task Coverage - Stripe Integration",
    prompt: "Process Stripe payments and create customer subscriptions",
    expectedTasks: [],
    expectedGaps: 2, // All nodes need to be searched
    description: "Should search for Stripe nodes as no pre-configured tasks match"
  },
  {
    name: "No Task Coverage - Calendar Sync",
    prompt: "Sync events between Google Calendar and Microsoft Outlook",
    expectedTasks: [],
    expectedGaps: 2, // Both calendar integrations need searching
    description: "Should search for calendar integration nodes"
  },
  {
    name: "No Task Coverage - FTP Operations",
    prompt: "Download files from FTP server and compress them into a ZIP archive",
    expectedTasks: [],
    expectedGaps: 2, // FTP and compression nodes need searching
    description: "Should search for FTP and compression nodes"
  },
  {
    name: "No Task Coverage - Custom Integration",
    prompt: "Connect to Salesforce CRM and synchronize contacts with HubSpot",
    expectedTasks: [],
    expectedGaps: 2, // Both CRM integrations need searching
    description: "Should search for Salesforce and HubSpot nodes"
  }
];

class DiscoveryIntegrationTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    
    try {
      // Create orchestrator which will handle MCP connection
      this.orchestrator = new WorkflowOrchestrator();
      console.log(chalk.green('✅ Test environment ready\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize orchestrator:'), error);
      throw error;
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Prompt: "${scenario.prompt}"`));
    
    const sessionId = `test_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Run discovery phase using the orchestrator (exactly like build-workflow.ts does)
      let result = await this.orchestrator.runDiscoveryPhase(sessionId, scenario.prompt);
      
      // Handle clarifications if needed (same simple pattern as build-workflow.ts)
      while (result.pendingClarification) {
        console.log(chalk.yellow(`\n   ❓ Clarification needed:`));
        console.log(chalk.yellow(`   ${result.pendingClarification.question}`));
        
        // For tests, always auto-respond with scenario-specific or default response
        const response = scenario.clarificationResponse || 
                        "Proceed with the most common approach for this workflow";
        console.log(chalk.gray(`   Auto-responding: "${response}"`));
        
        // Small delay to let MCP connection stabilize (simulates user thinking time)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Submit clarification response (exactly like build-workflow.ts)
        result = await this.orchestrator.handleClarificationResponse(
          sessionId,
          result.pendingClarification.questionId,
          response
        );
      }
      
      const duration = Date.now() - startTime;
      
      // Validate results
      if (!result.success) {
        throw new Error(`Discovery failed: ${result.error?.message}`);
      }
      
      // Extract node information
      const discoveredNodes = result.discoveredNodes || [];
      const selectedNodes = discoveredNodes.filter((n: any) => 
        result.selectedNodeIds?.includes(n.id)
      );
      
      // Check for expected tasks
      const foundTasks = selectedNodes
        .filter((n: any) => n.isPreConfigured)
        .map((n: any) => {
          // Extract task name from purpose or displayName
          // Purpose format: "Pre-configured task: task_name" or description from MCP
          const purposeMatch = n.purpose?.match(/(?:Pre-configured task:|task:)\s*(\w+)/i);
          const displayNameMatch = n.displayName?.toLowerCase().replace(/\s+/g, '_');
          
          // Try to extract task name from various sources
          if (purposeMatch) {
            return purposeMatch[1];
          } else if (displayNameMatch) {
            return displayNameMatch;
          } else {
            return n.type;
          }
        });
      
      const missingTasks = scenario.expectedTasks.filter(
        task => !foundTasks.some((found: string) => found.includes(task))
      );
      
      // Check if test should fail
      let testFailed = false;
      let failureReasons = [];
      
      // For scenarios expecting tasks, check if they were found
      if (missingTasks.length > 0 && scenario.expectedTasks.length > 0) {
        console.log(chalk.red(`   ❌ Missing expected tasks: ${missingTasks.join(', ')}`));
        failureReasons.push(`Missing tasks: ${missingTasks.join(', ')}`);
        testFailed = true;
      }
      
      // For scenarios expecting NO tasks, verify none were found as pre-configured
      if (scenario.expectedTasks.length === 0 && foundTasks.length > 0) {
        console.log(chalk.yellow(`   ⚠️  Found unexpected pre-configured tasks: ${foundTasks.join(', ')}`));
        // This is a warning but not a failure - it means we have better task coverage than expected
      }
      
      // Count gaps (non-pre-configured nodes found through search)
      const gapNodes = selectedNodes.filter((n: any) => !n.isPreConfigured);
      
      // Verify gap count matches expectations
      if (gapNodes.length !== scenario.expectedGaps) {
        console.log(chalk.red(`   ❌ Gap count mismatch: expected ${scenario.expectedGaps}, got ${gapNodes.length}`));
        failureReasons.push(`Gap count mismatch: expected ${scenario.expectedGaps}, got ${gapNodes.length}`);
        testFailed = true;
      }
      
      // Additional validation for gap nodes - ensure they were found through search
      if (gapNodes.length > 0) {
        const searchedNodeTypes = gapNodes.map((n: any) => n.type || n.displayName);
        console.log(chalk.blue(`   🔍 Nodes found through search: ${searchedNodeTypes.join(', ')}`));
      }
      
      // Note: Clarifications are now handled above, so we don't check for them here
      // The test only fails if clarification handling is disabled and one occurs
      
      // Log results
      if (testFailed) {
        console.log(chalk.red(`   ❌ Test FAILED in ${duration}ms`));
        console.log(chalk.red(`      Reasons: ${failureReasons.join('; ')}`));
      } else {
        console.log(chalk.green(`   ✅ Test passed in ${duration}ms`));
      }
      console.log(chalk.gray(`      Discovered: ${discoveredNodes.length} nodes total`));
      console.log(chalk.gray(`      Selected: ${selectedNodes.length} nodes for workflow`));
      console.log(chalk.gray(`      Pre-configured tasks: ${foundTasks.length}${scenario.expectedTasks.length > 0 ? ` (expected ${scenario.expectedTasks.length})` : ' (none expected)'}`));
      console.log(chalk.gray(`      Searched nodes: ${gapNodes.length}${scenario.expectedGaps > 0 ? ` (expected ${scenario.expectedGaps})` : ' (none expected)'}`));
      
      if (isVerbose && selectedNodes.length > 0) {
        console.log(chalk.gray('\n   Node details:'));
        selectedNodes.forEach((node: any) => {
          const flag = node.isPreConfigured ? '📦' : '🔍';
          console.log(chalk.gray(`      ${flag} ${node.type} - ${node.displayName || node.id}`));
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
    console.log(chalk.bold.blue('\n🚀 Discovery Phase Integration Tests\n'));
    console.log(chalk.gray('Testing the optimized task-based discovery flow with real services...'));
    
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
      console.log(chalk.gray('─'.repeat(50)));
      
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
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    // Group results by coverage type
    const fullCoverage = results.filter(r => r.scenario.includes('HTTP') || r.scenario.includes('Webhook') || 
                                           r.scenario.includes('Database') || r.scenario.includes('Complex') || 
                                           r.scenario.includes('AI Workflow'));
    const partialCoverage = results.filter(r => r.scenario.includes('Partial Coverage'));
    const noCoverage = results.filter(r => r.scenario.includes('No Task Coverage'));
    
    console.log(chalk.green(`   ✅ Passed: ${passed}/${results.length}`));
    if (failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failed}/${results.length}`));
    }
    
    console.log(chalk.gray('\n   Coverage breakdown:'));
    console.log(chalk.gray(`      Full task coverage: ${fullCoverage.filter(r => r.success).length}/${fullCoverage.length} passed`));
    console.log(chalk.gray(`      Partial coverage: ${partialCoverage.filter(r => r.success).length}/${partialCoverage.length} passed`));
    console.log(chalk.gray(`      No task coverage: ${noCoverage.filter(r => r.success).length}/${noCoverage.length} passed`));
    
    console.log(chalk.gray(`\n   ⏱️  Total time: ${totalDuration}ms`));
    console.log(chalk.gray(`   ⚡ Average: ${Math.round(totalDuration / results.length)}ms per test`));
    
    return passed === results.length;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Discovery Phase Integration Test')}

${chalk.gray('Usage:')} npm run test:discovery [options]

${chalk.gray('Options:')}
  --verbose, -v     Show detailed output
  --test=NAME       Run only specific test
  --help, -h        Show this help message

${chalk.gray('Examples:')}
  npm run test:discovery
  npm run test:discovery --verbose
  npm run test:discovery --test="HTTP API Call"

${chalk.gray('Clarification Handling:')}
  Tests automatically respond to clarification requests with
  predefined or default responses.

${chalk.gray('Requirements:')}
  - ANTHROPIC_API_KEY must be set in .env.local
  - MCP credentials must be set in .env.local
`);
    process.exit(0);
  }
  
  try {
    const test = new DiscoveryIntegrationTest();
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

export { DiscoveryIntegrationTest, TEST_SCENARIOS };