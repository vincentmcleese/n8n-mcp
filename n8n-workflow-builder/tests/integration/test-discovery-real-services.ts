#!/usr/bin/env tsx

/**
 * Integration Test for Discovery Phase with Real Services
 * 
 * Tests the complete discovery flow with real MCP and Anthropic APIs:
 * - No mocking, only real service calls
 * - Proper environment setup like build-workflow.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables BEFORE any module imports
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment exactly like build-workflow.ts
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';
process.env.LOG_LEVEL = process.argv.includes('--verbose') ? 'debug' : 'info';
if (process.argv.includes('--verbose')) {
  process.env.TEST_VERBOSE = 'true';
}

import chalk from 'chalk';

// Test scenarios with realistic task names
const TEST_SCENARIOS = [
  {
    name: "Simple Webhook",
    prompt: "Create a webhook that responds with JSON data",
    expectedNodes: ["n8n-nodes-base.webhook"],
    description: "Basic webhook setup"
  },
  {
    name: "HTTP Request",
    prompt: "Make an HTTP POST request to an API endpoint",
    expectedNodes: ["n8n-nodes-base.httpRequest"],
    description: "HTTP request node"
  },
  {
    name: "Slack Integration",
    prompt: "Send a message to Slack",
    expectedNodes: ["n8n-nodes-base.slack"],
    description: "Slack messaging"
  },
  {
    name: "Complex Workflow",
    prompt: "Create a webhook that receives data, filters it, and sends to Slack if amount > 100",
    expectedNodes: ["n8n-nodes-base.webhook", "n8n-nodes-base.if", "n8n-nodes-base.slack"],
    description: "Multi-node workflow with conditions"
  }
];

class DiscoveryIntegrationTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    
    // Dynamic import to ensure env vars are loaded
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    this.orchestrator = new WorkflowOrchestrator();
    
    console.log(chalk.green('✅ Test environment ready\n'));
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.cyan(`\n📝 Testing: ${scenario.name}`));
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Prompt: "${scenario.prompt}"`));
    
    const sessionId = `test_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Run discovery phase using the orchestrator
      const result = await this.orchestrator.runDiscoveryPhase(sessionId, scenario.prompt);
      
      const duration = Date.now() - startTime;
      
      if (!result.success) {
        throw new Error(`Discovery failed: ${result.error?.message}`);
      }
      
      // Check if we found expected nodes
      const foundNodes = result.discoveredNodes.map((n: any) => n.type);
      const missingNodes = scenario.expectedNodes.filter(
        expected => !foundNodes.some((found: string) => found.includes(expected.split('.')[1]))
      );
      
      if (missingNodes.length > 0) {
        console.log(chalk.yellow(`   ⚠️  Some expected nodes not found: ${missingNodes.join(', ')}`));
      }
      
      console.log(chalk.green(`   ✅ Test passed in ${duration}ms`));
      console.log(chalk.gray(`      Discovered: ${result.discoveredNodes.length} nodes`));
      console.log(chalk.gray(`      Selected: ${result.selectedNodeIds.length} nodes`));
      console.log(chalk.gray(`      Node types: ${foundNodes.join(', ')}`));
      
      return { success: true, duration, result };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Discovery Phase Integration Tests (Real Services)\n'));
    console.log(chalk.gray('Testing with real MCP and Anthropic APIs...'));
    
    await this.setup();
    
    const results: any[] = [];
    
    for (const scenario of TEST_SCENARIOS) {
      const result = await this.runTest(scenario);
      results.push({ scenario: scenario.name, ...result });
      
      // Add delay between tests to avoid rate limiting
      if (TEST_SCENARIOS.indexOf(scenario) < TEST_SCENARIOS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Summary
    console.log(chalk.bold.blue('\n📊 Test Summary\n'));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(chalk.green(`   ✅ Passed: ${passed}/${results.length}`));
    if (failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failed}/${results.length}`));
    }
    console.log(chalk.gray(`   ⏱️  Total time: ${totalDuration}ms`));
    console.log(chalk.gray(`   ⚡ Average: ${Math.round(totalDuration / results.length)}ms per test`));
    
    return passed === results.length;
  }
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Discovery Phase Integration Test (Real Services)')}

${chalk.gray('Usage:')} npx tsx tests/integration/test-discovery-real-services.ts [options]

${chalk.gray('Options:')}
  --verbose, -v     Show detailed output
  --help, -h        Show this help message

${chalk.gray('Requirements:')}
  - ANTHROPIC_API_KEY must be set in .env.local
  - MCP_SERVER_URL, MCP_API_KEY, MCP_PROFILE must be set in .env.local
`);
    process.exit(0);
  }
  
  try {
    const test = new DiscoveryIntegrationTest();
    const success = await test.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);