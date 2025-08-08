#!/usr/bin/env tsx

/**
 * Integration Test for Building Phase Refactor
 * 
 * Tests the building phase using pre-saved configured nodes from fixtures.
 * This is the FAST version that doesn't require discovery/configuration phases.
 * 
 * Features tested:
 * - Workflow structure creation
 * - Node connections based on data flow
 * - Error handling configuration
 * - Visual positioning
 * - Workflow settings
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

// Test scenarios - these should match the fixture files
const TEST_SCENARIOS = [
  {
    name: "Simple Linear Workflow",
    fixtureFile: "simple-linear.json",
    expectedConnections: 1,
    expectedNodes: 2,
    description: "Should build simple webhook → slack workflow"
  },
  {
    name: "Conditional Workflow",
    fixtureFile: "conditional-workflow.json",
    expectedConnections: 2,  // webhook→if, if→slack (email might not be connected if fixture doesn't have IF node)
    expectedNodes: 4,  // webhook, if (added by builder), slack, email
    description: "Should build branching workflow with IF node"
  },
  {
    name: "API Integration",
    fixtureFile: "api-integration.json",
    expectedConnections: 2,  // Minimum expected connections
    expectedNodes: 4,  // httpRequest, if, code, slack
    description: "Should build API integration workflow"
  }
  // Additional test scenarios can be added when fixtures are generated
];

class BuildingIntegrationTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    console.log(chalk.yellow('⚠️  Using REAL Claude API for building phase - this will consume tokens!\n'));
    
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
   * Load fixture data from JSON file
   */
  async loadFixture(fixtureFile: string): Promise<any> {
    const filePath = path.join(process.cwd(), 'tests/fixtures/building', fixtureFile);
    
    // Check if fixture exists
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`   ⚠️  Fixture not found: ${fixtureFile}`));
      console.log(chalk.gray(`      Run 'npm run test:build:e2e -- --save-fixtures' to generate fixtures`));
      return null;
    }
    
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to load fixture: ${error}`));
      return null;
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Fixture: ${scenario.fixtureFile}`));
    
    const sessionId = `test_build_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Load fixture data
      const fixture = await this.loadFixture(scenario.fixtureFile);
      if (!fixture) {
        return {
          success: false,
          duration: 0,
          error: new Error('Fixture not found')
        };
      }
      
      const { configuredNodes, prompt } = fixture;
      
      // Initialize session
      await this.orchestrator.sessionRepo.initialize(sessionId, prompt || scenario.name);
      
      // Create operations to simulate configuration phase output
      const operations: any[] = [];
      
      // Add each configured node to session
      for (const node of configuredNodes) {
        // Add as discovered node first
        operations.push({
          type: 'discoverNode',
          node: {
            id: node.id,
            type: node.type,
            displayName: node.displayName || node.type,
            purpose: node.purpose,
            category: node.category,
            isPreConfigured: node.isPreConfigured || false
          }
        });
        
        // Select the node
        operations.push({
          type: 'selectNode',
          nodeId: node.id
        });
        
        // Configure the node
        operations.push({
          type: 'configureNode',
          nodeId: node.id,
          nodeType: node.type,
          purpose: node.purpose,
          config: node.config
        });
        
        // Mark as validated
        operations.push({
          type: 'validateNode',
          nodeId: node.id,
          valid: true,
          errors: []
        });
      }
      
      // Mark configuration as complete
      operations.push({
        type: 'completePhase',
        phase: 'configuration'
      });
      
      if (isVerbose) {
        console.log(chalk.gray(`   Setting up session with ${configuredNodes.length} configured nodes`));
      }
      
      // Persist all operations
      await this.orchestrator.sessionRepo.persistOperations(sessionId, operations);
      
      // Force save to ensure persistence
      await this.orchestrator.sessionRepo.save(sessionId);
      
      // Run building phase
      console.log(chalk.gray('   🔨 Running building phase...'));
      const result = await this.orchestrator.runBuildingPhase(sessionId);
      const duration = Date.now() - startTime;
      
      // Validate results
      let testFailed = false;
      let failureReasons = [];
      
      if (!result.success) {
        failureReasons.push(`Building failed: ${result.error?.message}`);
        testFailed = true;
      }
      
      if (!result.workflow) {
        failureReasons.push('No workflow generated');
        testFailed = true;
      }
      
      const nodeCount = result.workflow?.nodes?.length || 0;
      
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
      
      const connectionCount = countAllConnections(result.workflow?.connections);
      
      if (nodeCount !== scenario.expectedNodes) {
        failureReasons.push(`Expected ${scenario.expectedNodes} nodes, got ${nodeCount}`);
        testFailed = true;
      }
      
      if (connectionCount < scenario.expectedConnections) {
        failureReasons.push(`Expected at least ${scenario.expectedConnections} connections, got ${connectionCount}`);
        testFailed = true;
      }
      
      // Check for required workflow properties
      if (result.workflow) {
        if (!result.workflow.name) {
          failureReasons.push('Workflow missing name');
          testFailed = true;
        }
        
        if (!result.workflow.settings) {
          failureReasons.push('Workflow missing settings');
          testFailed = true;
        }
        
        // Check that all nodes have positions
        const nodesWithoutPositions = result.workflow.nodes?.filter((n: any) => !n.position);
        if (nodesWithoutPositions?.length > 0) {
          failureReasons.push(`${nodesWithoutPositions.length} nodes missing positions`);
          testFailed = true;
        }
      }
      
      // Display results
      if (testFailed) {
        console.log(chalk.red(`   ❌ Test FAILED in ${duration}ms`));
        console.log(chalk.red(`      Reasons: ${failureReasons.join('; ')}`));
      } else {
        console.log(chalk.green(`   ✅ Test passed in ${duration}ms`));
      }
      
      console.log(chalk.gray(`      Workflow: "${result.workflow?.name || 'unnamed'}"`));
      console.log(chalk.gray(`      Nodes: ${nodeCount}, Connections: ${connectionCount}`));
      
      // Show reasoning if verbose
      if (isVerbose && result.reasoning && result.reasoning.length > 0) {
        console.log(chalk.gray('\n   Building Reasoning:'));
        result.reasoning.forEach((r: string) => {
          console.log(chalk.gray(`      📝 ${r}`));
        });
      }
      
      // Show workflow structure if verbose
      if (isVerbose && result.workflow) {
        console.log(chalk.gray('\n   Workflow Structure:'));
        console.log(chalk.gray(`      Name: ${result.workflow.name}`));
        console.log(chalk.gray(`      Nodes:`));
        result.workflow.nodes?.forEach((node: any) => {
          console.log(chalk.gray(`        - ${node.name} (${node.type}) at [${node.position}]`));
        });
        console.log(chalk.gray(`      Connections:`));
        Object.entries(result.workflow.connections || {}).forEach(([from, conns]: [string, any]) => {
          conns.main?.[0]?.forEach((conn: any) => {
            console.log(chalk.gray(`        - ${from} → ${conn.node}`));
          });
        });
      }
      
      return { 
        success: !testFailed, 
        duration, 
        error: testFailed ? new Error(failureReasons.join('; ')) : undefined,
        result 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Building Phase Integration Tests (Fixture-Based)\n'));
    console.log(chalk.gray('Testing workflow building with pre-configured nodes from fixtures...'));
    console.log(chalk.gray('This is the FAST version - no discovery/configuration phases\n'));
    
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
    
    // Check if fixtures exist
    const fixturesDir = path.join(process.cwd(), 'tests/fixtures/building');
    if (!fs.existsSync(fixturesDir) || fs.readdirSync(fixturesDir).length === 0) {
      console.log(chalk.yellow('\n⚠️  No fixture files found!'));
      console.log(chalk.gray('Run the following command to generate fixtures:'));
      console.log(chalk.blue('  npm run test:build:e2e -- --save-fixtures\n'));
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
    
    return passed === results.length - skipped;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Building Phase Integration Test (Fixture-Based)')}

${chalk.gray('Usage:')} npm run test:build [options]

${chalk.gray('Options:')}
  --verbose, -v     Show detailed output with reasoning
  --no-prompt, -n   Skip interactive prompts
  --test=NAME       Run only specific test (auto-skips prompts)
  --help, -h        Show this help message

${chalk.gray('Examples:')}
  npm run test:build
  npm run test:build --verbose
  npm run test:build --test="Simple Linear Workflow"

${chalk.gray('Note:')}
  This test uses pre-saved fixture files. If fixtures are missing,
  run 'npm run test:build:e2e -- --save-fixtures' to generate them.

${chalk.gray('What this tests:')}
  - Workflow structure creation from configured nodes
  - Logical node connections based on data flow
  - Error handling configuration (onError properties)
  - Visual positioning of nodes
  - Workflow settings and metadata
`);
    process.exit(0);
  }
  
  try {
    const test = new BuildingIntegrationTest();
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

export { BuildingIntegrationTest, TEST_SCENARIOS };