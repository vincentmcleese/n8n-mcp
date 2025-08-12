#!/usr/bin/env tsx

/**
 * Integration Test for NoOp Replacement in Configuration Phase
 * 
 * Tests that nodes failing validation are replaced with NoOp placeholders
 * when auto-fix doesn't resolve the issues.
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

// Set log level based on verbose flag
if (!isVerbose) {
  process.env.LOG_LEVEL = 'info';
} else {
  process.env.LOG_LEVEL = 'debug';
  process.env.TEST_VERBOSE = 'true';
}

import chalk from 'chalk';

// Test scenario for NoOp replacement
const TEST_SCENARIO = {
  name: "Invalid Node Replaced with NoOp",
  prompt: "Process data with a special custom node",
  discoveryOutput: {
    taskNodes: [],
    searchNodes: [{
      id: 'invalid_node_1',
      type: 'n8n-nodes-base.gibberishNonExistentNode',
      displayName: 'Gibberish Node',
      purpose: 'This is a completely made-up node that does not exist',
      category: 'data',
      isPreConfigured: false
    }]
  },
  expectedResult: {
    nodeType: 'n8n-nodes-base.noOp',
    hasNotes: true,
    notesContains: ['This node replaced n8n-nodes-base.gibberishNonExistentNode', 'validation errors']
  }
};

class NoOpReplacementTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up NoOp replacement test environment...\n'));
    console.log(chalk.yellow('⚠️  Using REAL Claude API and MCP services - this will consume tokens!\n'));
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('../../lib/workflow-orchestrator');
    const { createLogger } = await import('../../lib/utils/logger');
    
    try {
      // Create orchestrator which will handle everything
      this.orchestrator = new WorkflowOrchestrator();
      
      console.log(chalk.green('✅ Test environment ready\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize test environment:'), error);
      throw error;
    }
  }
  
  async runTest() {
    console.log(chalk.cyan(`\n📋 Running Test: ${TEST_SCENARIO.name}\n`));
    console.log(chalk.gray(`   Description: Testing that invalid nodes are replaced with NoOp placeholders`));
    console.log(chalk.gray(`   Prompt: "${TEST_SCENARIO.prompt}"`));
    console.log(chalk.gray(`   Node to test: ${TEST_SCENARIO.discoveryOutput.searchNodes[0].type}\n`));
    
    const sessionId = `test_noop_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Step 1: Initialize session with discovered nodes
      console.log(chalk.blue('📝 Step 1: Setting up session with invalid node...'));
      
      const allNodes = [
        ...TEST_SCENARIO.discoveryOutput.taskNodes,
        ...TEST_SCENARIO.discoveryOutput.searchNodes
      ];
      
      const selectedNodeIds = allNodes.map(n => n.id);
      
      // Initialize session
      await this.orchestrator.sessionRepo.initialize(sessionId, TEST_SCENARIO.prompt);
      
      // Create operations to add discovered nodes
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
      
      // Select all nodes
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
      
      // Persist all operations
      await this.orchestrator.sessionRepo.persistOperations(sessionId, operations);
      await this.orchestrator.sessionRepo.save(sessionId);
      
      console.log(chalk.green('   ✓ Session initialized with test node\n'));
      
      // Step 2: Run configuration phase
      console.log(chalk.blue('🔧 Step 2: Running configuration phase...'));
      console.log(chalk.gray('   Expected: Node should fail validation and be replaced with NoOp\n'));
      
      const result = await this.orchestrator.runConfigurationPhase(sessionId);
      const duration = Date.now() - startTime;
      
      // Step 3: Verify results
      console.log(chalk.blue('\n📊 Step 3: Verifying results...\n'));
      
      let testPassed = true;
      const failureReasons = [];
      
      // Check if configuration succeeded overall
      if (!result.success) {
        failureReasons.push('Configuration phase failed');
        testPassed = false;
      }
      
      // Find our configured node
      const configuredNode = result.configured?.find((n: any) => n.id === 'invalid_node_1');
      
      if (!configuredNode) {
        failureReasons.push('Node not found in configuration results');
        testPassed = false;
      } else {
        // Check if node type was changed to NoOp
        if (configuredNode.type !== TEST_SCENARIO.expectedResult.nodeType) {
          failureReasons.push(`Expected node type '${TEST_SCENARIO.expectedResult.nodeType}', got '${configuredNode.type}'`);
          testPassed = false;
        } else {
          console.log(chalk.green(`   ✓ Node type correctly changed to: ${configuredNode.type}`));
        }
        
        // Check if configuration has notes
        if (!configuredNode.config?.notes) {
          failureReasons.push('NoOp configuration missing notes field');
          testPassed = false;
        } else {
          console.log(chalk.green(`   ✓ NoOp configuration includes notes field`));
          
          // Check notes content
          const notes = configuredNode.config.notes;
          for (const expectedText of TEST_SCENARIO.expectedResult.notesContains) {
            if (!notes.includes(expectedText)) {
              failureReasons.push(`Notes missing expected text: "${expectedText}"`);
              testPassed = false;
            }
          }
          
          if (isVerbose) {
            console.log(chalk.gray('\n   Notes content:'));
            console.log(chalk.gray('   ' + notes.split('\n').join('\n   ')));
          }
        }
        
        // Check if node is marked as validated
        if (!configuredNode.validated) {
          failureReasons.push('NoOp node not marked as validated');
          testPassed = false;
        } else {
          console.log(chalk.green(`   ✓ NoOp node marked as validated`));
        }
      }
      
      // Step 4: Display final results
      console.log(chalk.blue('\n📈 Test Results:\n'));
      
      if (testPassed) {
        console.log(chalk.green(`   ✅ TEST PASSED in ${duration}ms`));
        console.log(chalk.green(`   Successfully replaced invalid node with NoOp placeholder`));
      } else {
        console.log(chalk.red(`   ❌ TEST FAILED in ${duration}ms`));
        for (const reason of failureReasons) {
          console.log(chalk.red(`      - ${reason}`));
        }
      }
      
      // Show reasoning if verbose
      if (isVerbose && result.reasoning && result.reasoning.length > 0) {
        console.log(chalk.gray('\n   Configuration Phase Reasoning:'));
        result.reasoning.forEach((r: string) => {
          if (r.includes('NoOp') || r.includes('replaced')) {
            console.log(chalk.yellow(`   - ${r}`));
          } else {
            console.log(chalk.gray(`   - ${r}`));
          }
        });
      }
      
      return testPassed;
      
    } catch (error) {
      console.error(chalk.red('\n❌ Test failed with error:'), error);
      return false;
    }
  }
  
  async teardown() {
    console.log(chalk.blue('\n🧹 Cleaning up test environment...\n'));
    // Any cleanup if needed
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n========================================'));
  console.log(chalk.bold.cyan('  NoOp Replacement Integration Test'));
  console.log(chalk.bold.cyan('========================================\n'));
  
  const test = new NoOpReplacementTest();
  
  try {
    await test.setup();
    const passed = await test.runTest();
    await test.teardown();
    
    console.log(chalk.bold.cyan('\n========================================\n'));
    
    if (passed) {
      console.log(chalk.green('✅ All tests passed!\n'));
      process.exit(0);
    } else {
      console.log(chalk.red('❌ Some tests failed!\n'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);