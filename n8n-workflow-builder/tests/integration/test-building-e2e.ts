#!/usr/bin/env tsx

/**
 * End-to-End Integration Test for Building Phase
 * 
 * Tests the complete pipeline: Discovery → Configuration → Building
 * This is the COMPREHENSIVE version that runs all phases with real API calls.
 * 
 * Can optionally save configured nodes as fixtures for the fast test.
 * 
 * Features tested:
 * - Full workflow generation pipeline
 * - Integration between all phases
 * - Real Claude API responses
 * - MCP tool integration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables BEFORE any module imports (critical!)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n') || args.some(a => a.startsWith('--test='));
const saveFixtures = args.includes('--save-fixtures') || args.includes('--save');

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

// Test scenarios - comprehensive workflow building tests
const TEST_SCENARIOS = [
  {
    name: "Simple Linear Workflow",
    prompt: "Receive webhook data and send a message to Slack channel #general saying 'New webhook received'",
    expectedMinNodes: 2,
    expectedMinConnections: 1,
    fixtureFile: "simple-linear.json",
    description: "Should discover, configure, and build simple webhook → slack workflow"
  },
  {
    name: "Conditional Workflow",
    prompt: "Receive webhook with order data, check if amount is greater than 100, if yes send to Slack channel #high-value, if no send email to admin@example.com",
    expectedMinNodes: 4,
    expectedMinConnections: 3,
    fixtureFile: "conditional-workflow.json",
    description: "Should build branching workflow with IF node for conditional routing"
  },
  {
    name: "Data Processing",
    prompt: "Read data from Google Sheets spreadsheet, transform it with JavaScript to calculate totals, then save results to PostgreSQL database",
    expectedMinNodes: 3,
    expectedMinConnections: 2,
    fixtureFile: "data-processing.json",
    description: "Should connect data processing nodes in correct sequence"
  },
  {
    name: "API Integration",
    prompt: "Make HTTP GET request to https://api.example.com/users, filter to only active users where status equals 'active', then send summary to Slack",
    expectedMinNodes: 3,
    expectedMinConnections: 2,
    fixtureFile: "api-integration.json",
    description: "Should build API integration workflow with filtering"
  },
  {
    name: "Complex Multi Branch",
    prompt: "Webhook receives order, validate data with JavaScript code, if validation passes transform data and store in PostgreSQL then send confirmation email, if validation fails log error to file and notify Slack channel #errors",
    expectedMinNodes: 5,
    expectedMinConnections: 4,
    fixtureFile: "complex-multi-branch.json",
    description: "Should handle complex branching logic with multiple paths"
  }
];

class BuildingE2ETest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    console.log(chalk.yellow('⚠️  Using REAL Claude API and MCP services for ALL phases!\n'));
    console.log(chalk.yellow('⚠️  This will consume significant API tokens!\n'));
    
    if (saveFixtures) {
      console.log(chalk.green('💾 Fixture saving mode enabled - will save configured nodes\n'));
    }
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    
    try {
      // Create orchestrator which will handle everything
      this.orchestrator = new WorkflowOrchestrator();
      console.log(chalk.green('✅ Test environment ready\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize test environment:'), error);
      throw error;
    }
  }
  
  /**
   * Save fixture data for reuse in fast tests
   */
  async saveFixture(fixtureFile: string, data: any) {
    const filePath = path.join(process.cwd(), 'tests/fixtures/building', fixtureFile);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(chalk.green(`   💾 Saved fixture: ${fixtureFile}`));
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to save fixture: ${error}`));
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Prompt: "${scenario.prompt}"`));
    
    const sessionId = `test_build_e2e_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Step 1: Discovery Phase
      console.log(chalk.gray('\n   📍 Running discovery phase...'));
      const discoveryStartTime = Date.now();
      const discoveryResult = await this.orchestrator.runDiscoveryPhase(
        sessionId,
        scenario.prompt
      );
      const discoveryDuration = Date.now() - discoveryStartTime;
      
      if (!discoveryResult.success) {
        throw new Error(`Discovery failed: ${discoveryResult.error?.message}`);
      }
      
      const discoveredCount = (discoveryResult.taskNodes?.length || 0) + (discoveryResult.searchNodes?.length || 0);
      console.log(chalk.gray(`      Discovered ${discoveredCount} nodes in ${discoveryDuration}ms`));
      
      if (isVerbose && discoveryResult.taskNodes) {
        console.log(chalk.gray(`      Task nodes: ${discoveryResult.taskNodes.map((n: any) => n.type).join(', ')}`));
      }
      if (isVerbose && discoveryResult.searchNodes) {
        console.log(chalk.gray(`      Search nodes: ${discoveryResult.searchNodes.map((n: any) => n.type).join(', ')}`));
      }
      
      // Step 2: Configuration Phase
      console.log(chalk.gray('\n   ⚙️  Running configuration phase...'));
      const configStartTime = Date.now();
      const configResult = await this.orchestrator.runConfigurationPhase(sessionId);
      const configDuration = Date.now() - configStartTime;
      
      if (!configResult.success) {
        throw new Error(`Configuration failed: ${configResult.error?.message}`);
      }
      
      const configuredCount = configResult.configured?.length || 0;
      console.log(chalk.gray(`      Configured ${configuredCount} nodes in ${configDuration}ms`));
      
      // Save fixture if requested
      if (saveFixtures && configResult.configured) {
        await this.saveFixture(scenario.fixtureFile, {
          prompt: scenario.prompt,
          configuredNodes: configResult.configured
        });
      }
      
      // Step 3: Building Phase
      console.log(chalk.gray('\n   🔨 Running building phase...'));
      const buildStartTime = Date.now();
      const buildResult = await this.orchestrator.runBuildingPhase(sessionId);
      const buildDuration = Date.now() - buildStartTime;
      
      const totalDuration = Date.now() - startTime;
      
      // Validate results
      let testFailed = false;
      let failureReasons = [];
      
      if (!buildResult.success) {
        failureReasons.push(`Building failed: ${buildResult.error?.message}`);
        testFailed = true;
      }
      
      if (!buildResult.workflow) {
        failureReasons.push('No workflow generated');
        testFailed = true;
      }
      
      const nodeCount = buildResult.workflow?.nodes?.length || 0;
      
      // Count all connection paths (including multi-output nodes like IF/Switch)
      const countAllConnections = (connections: any): number => {
        if (!connections) return 0;
        let totalPaths = 0;
        
        for (const nodeConnections of Object.values(connections)) {
          const mainOutputs = (nodeConnections as any)?.main || [];
          for (const outputBranch of mainOutputs) {
            if (Array.isArray(outputBranch) && outputBranch.length > 0) {
              totalPaths += outputBranch.length; // Count each connection in this output
            }
          }
        }
        
        return totalPaths;
      };
      
      const connectionCount = countAllConnections(buildResult.workflow?.connections);
      
      if (nodeCount < scenario.expectedMinNodes) {
        failureReasons.push(`Expected at least ${scenario.expectedMinNodes} nodes, got ${nodeCount}`);
        testFailed = true;
      }
      
      if (connectionCount < scenario.expectedMinConnections) {
        failureReasons.push(`Expected at least ${scenario.expectedMinConnections} connections, got ${connectionCount}`);
        testFailed = true;
      }
      
      // Check for required workflow properties
      if (buildResult.workflow) {
        if (!buildResult.workflow.name) {
          failureReasons.push('Workflow missing name');
          testFailed = true;
        }
        
        if (!buildResult.workflow.settings) {
          failureReasons.push('Workflow missing settings');
          testFailed = true;
        }
        
        // Check that all nodes have positions
        const nodesWithoutPositions = buildResult.workflow.nodes?.filter((n: any) => !n.position);
        if (nodesWithoutPositions?.length > 0) {
          failureReasons.push(`${nodesWithoutPositions.length} nodes missing positions`);
          testFailed = true;
        }
        
        // Check that nodes have error handling where appropriate
        const triggerNodes = buildResult.workflow.nodes?.filter((n: any) => 
          n.type.includes('trigger') || n.type.includes('webhook')
        );
        const triggersWithoutErrorHandling = triggerNodes?.filter((n: any) => !n.onError);
        if (triggersWithoutErrorHandling?.length > 0) {
          console.log(chalk.yellow(`      ⚠️  ${triggersWithoutErrorHandling.length} trigger nodes missing error handling`));
        }
      }
      
      // Display results
      console.log(chalk.gray(`      Built workflow in ${buildDuration}ms`));
      
      if (testFailed) {
        console.log(chalk.red(`\n   ❌ Test FAILED in ${totalDuration}ms`));
        console.log(chalk.red(`      Reasons: ${failureReasons.join('; ')}`));
      } else {
        console.log(chalk.green(`\n   ✅ Test passed in ${totalDuration}ms`));
      }
      
      console.log(chalk.gray(`      Phase breakdown:`));
      console.log(chalk.gray(`        Discovery: ${discoveryDuration}ms`));
      console.log(chalk.gray(`        Configuration: ${configDuration}ms`));
      console.log(chalk.gray(`        Building: ${buildDuration}ms`));
      console.log(chalk.gray(`      Workflow: "${buildResult.workflow?.name || 'unnamed'}"`));
      console.log(chalk.gray(`      Final: ${nodeCount} nodes, ${connectionCount} connections`));
      
      // Show reasoning if verbose
      if (isVerbose) {
        if (discoveryResult.reasoning && discoveryResult.reasoning.length > 0) {
          console.log(chalk.gray('\n   Discovery Reasoning:'));
          discoveryResult.reasoning.forEach((r: string) => {
            console.log(chalk.gray(`      📝 ${r}`));
          });
        }
        
        if (configResult.reasoning && configResult.reasoning.length > 0) {
          console.log(chalk.gray('\n   Configuration Reasoning:'));
          configResult.reasoning.forEach((r: string) => {
            console.log(chalk.gray(`      📝 ${r}`));
          });
        }
        
        if (buildResult.reasoning && buildResult.reasoning.length > 0) {
          console.log(chalk.gray('\n   Building Reasoning:'));
          buildResult.reasoning.forEach((r: string) => {
            console.log(chalk.gray(`      📝 ${r}`));
          });
        }
      }
      
      // Show workflow structure if verbose
      if (isVerbose && buildResult.workflow) {
        console.log(chalk.gray('\n   Final Workflow Structure:'));
        console.log(chalk.gray(`      Nodes:`));
        buildResult.workflow.nodes?.forEach((node: any) => {
          const errorHandling = node.onError ? ` [onError: ${node.onError}]` : '';
          console.log(chalk.gray(`        - ${node.name} (${node.type})${errorHandling}`));
        });
        console.log(chalk.gray(`      Connections:`));
        Object.entries(buildResult.workflow.connections || {}).forEach(([from, conns]: [string, any]) => {
          conns.main?.[0]?.forEach((conn: any) => {
            console.log(chalk.gray(`        - ${from} → ${conn.node}`));
          });
        });
      }
      
      return { 
        success: !testFailed, 
        duration: totalDuration, 
        error: testFailed ? new Error(failureReasons.join('; ')) : undefined,
        phases: {
          discovery: discoveryDuration,
          configuration: configDuration,
          building: buildDuration
        },
        result: buildResult 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`\n   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Building Phase End-to-End Tests (Full Pipeline)\n'));
    console.log(chalk.gray('Testing complete workflow generation: Discovery → Configuration → Building'));
    console.log(chalk.gray('This runs ALL phases with real API calls - expect longer execution times\n'));
    
    if (saveFixtures) {
      console.log(chalk.green('💾 Fixture saving enabled - will create/update fixture files\n'));
    }
    
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
    
    // Phase breakdown
    const phaseAverages = {
      discovery: 0,
      configuration: 0,
      building: 0
    };
    
    const resultsWithPhases = results.filter(r => r.phases);
    if (resultsWithPhases.length > 0) {
      phaseAverages.discovery = Math.round(
        resultsWithPhases.reduce((sum, r) => sum + r.phases.discovery, 0) / resultsWithPhases.length
      );
      phaseAverages.configuration = Math.round(
        resultsWithPhases.reduce((sum, r) => sum + r.phases.configuration, 0) / resultsWithPhases.length
      );
      phaseAverages.building = Math.round(
        resultsWithPhases.reduce((sum, r) => sum + r.phases.building, 0) / resultsWithPhases.length
      );
      
      console.log(chalk.gray('\n   Phase averages:'));
      console.log(chalk.gray(`      Discovery: ${phaseAverages.discovery}ms`));
      console.log(chalk.gray(`      Configuration: ${phaseAverages.configuration}ms`));
      console.log(chalk.gray(`      Building: ${phaseAverages.building}ms`));
    }
    
    if (saveFixtures && passed > 0) {
      console.log(chalk.green(`\n   💾 Saved ${passed} fixture files for fast testing`));
      console.log(chalk.gray('   Run "npm run test:build" to use the saved fixtures'));
    }
    
    return passed === results.length - skipped;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Building Phase End-to-End Test (Full Pipeline)')}

${chalk.gray('Usage:')} npm run test:build:e2e [options]

${chalk.gray('Options:')}
  --verbose, -v       Show detailed output with reasoning
  --no-prompt, -n     Skip interactive prompts
  --test=NAME         Run only specific test (auto-skips prompts)
  --save-fixtures     Save configured nodes as fixtures for fast tests
  --save              Alias for --save-fixtures
  --help, -h          Show this help message

${chalk.gray('Examples:')}
  npm run test:build:e2e
  npm run test:build:e2e --verbose
  npm run test:build:e2e --save-fixtures
  npm run test:build:e2e --test="Simple Linear Workflow"

${chalk.gray('Note:')}
  This test runs ALL phases (discovery, configuration, building) with
  real API calls. It's comprehensive but slower and uses more tokens.
  
  Use --save-fixtures to generate fixture files for the fast test.

${chalk.gray('What this tests:')}
  - Complete workflow generation pipeline
  - Integration between discovery, configuration, and building phases
  - Real Claude API responses and decision-making
  - MCP tool integration across all phases
  - Error handling and edge cases
`);
    process.exit(0);
  }
  
  try {
    const test = new BuildingE2ETest();
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

export { BuildingE2ETest, TEST_SCENARIOS };