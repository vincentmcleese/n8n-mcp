#!/usr/bin/env tsx

/**
 * End-to-End Integration Test: Discovery -> Configuration (Two Scenarios)
 *
 * Goal: Verify the full flow with real services works end to end.
 * - Scenario A: Task-only (all nodes pre-configured)
 * - Scenario B: Mixed (some task templates + some discovered via search)
 * - Auto-respond to clarifications
 * - Then run configuration and assert success
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';
import * as readline from 'readline';

// Load env first
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// CLI args
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n');

if (isVerbose) {
  process.env.LOG_LEVEL = 'debug';
  process.env.TEST_VERBOSE = 'true';
}

// Readline for redline-style confirmation
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function waitForEnter(message: string = 'Press Enter to continue...'): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`\n${message} `), (answer) => {
      resolve(answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'skip');
    });
  });
}

async function runScenario(orchestrator: any, name: string, prompt: string) {
  const sessionId = `e2e_${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
  console.log(chalk.gray(`\nScenario: ${name}`));
  console.log(chalk.gray(`Session: ${sessionId}`));
  console.log(chalk.gray(`Prompt: "${prompt}"`));

  console.log(chalk.blue('\n🔎 Running discovery...'));
  let discovery = await orchestrator.runDiscoveryPhase(sessionId, prompt);
  while (discovery.pendingClarification) {
    const answer = 'Proceed with the most common approach for this workflow';
    console.log(chalk.yellow(`Clarification requested: ${discovery.pendingClarification.question}`));
    console.log(chalk.gray(`Auto-answer: ${answer}`));
    discovery = await orchestrator.handleClarificationResponse(
      sessionId,
      discovery.pendingClarification.questionId,
      answer
    );
  }
  if (!discovery.success) throw new Error(`Discovery failed: ${discovery.error?.message}`);

  const discoveredNodes = discovery.discoveredNodes || [];
  const selectedNodeIds = discovery.selectedNodeIds || [];
  console.log(chalk.green(`Discovery complete: ${discoveredNodes.length} nodes, ${selectedNodeIds.length} selected`));
  if (selectedNodeIds.length === 0) throw new Error('No nodes selected after discovery');

  console.log(chalk.blue('\n🛠️  Running configuration...'));
  const configuration = await orchestrator.runConfigurationPhase(sessionId);
  if (!configuration.success) throw new Error(`Configuration failed: ${configuration.error?.message}`);

  const configured = configuration.configured || [];
  const valid = configured.filter((n: any) => n.validated).length;
  console.log(chalk.green(`Configuration complete: ${configured.length} nodes (${valid} valid)`));
  if (configured.length === 0 || valid === 0) throw new Error('E2E failed: No valid configured nodes');
}

async function main() {
  console.log(chalk.bold.blue('\n🚀 E2E: Discovery → Configuration (Two Scenarios)\n'));

  const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
  const orchestrator = new WorkflowOrchestrator();

  // Scenario A: Tasks-only (pre-configured)
  if (!skipPrompts) {
    const ok = await waitForEnter('Press Enter to run Scenario A (Tasks Only) or type "s" to skip...');
    if (ok) {
      await runScenario(
        orchestrator,
        'Tasks Only',
        'Make a GET request to https://api.example.com/data and route items over amount > 100'
      );
    } else {
      console.log(chalk.yellow('⏭️  Skipped Scenario A'));
    }
  } else {
    await runScenario(
      orchestrator,
      'Tasks Only',
      'Make a GET request to https://api.example.com/data and route items over amount > 100'
    );
  }

  // Scenario B: Mixed with discovery (requires searching for at least one node)
  if (!skipPrompts) {
    const ok2 = await waitForEnter('Press Enter to run Scenario B (Mixed With Discovery) or type "s" to skip...');
    if (ok2) {
      await runScenario(
        orchestrator,
        'Mixed With Discovery',
        'Fetch weather data from an API and update a MySQL database table'
      );
    } else {
      console.log(chalk.yellow('⏭️  Skipped Scenario B'));
    }
  } else {
    await runScenario(
      orchestrator,
      'Mixed With Discovery',
      'Fetch weather data from an API and update a MySQL database table'
    );
  }

  console.log(chalk.bold.green('\n✅ E2E passed for all scenarios'));
  rl.close();
}

main().catch(err => {
  console.error(chalk.red('\n❌ E2E crashed'), err);
  process.exit(1);
});
