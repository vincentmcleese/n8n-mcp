#!/usr/bin/env tsx

/**
 * Fix Document Test Workflows
 * 
 * This script reads the test workflows from the document test,
 * runs validation on them to add proper connections,
 * and saves the fixed versions that can be deployed to n8n.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { promises as fs } from 'fs';
import chalk from 'chalk';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set environment
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';

// Import after env setup - dynamic import to ensure env vars are loaded
async function main() {
  console.log(chalk.bold.blue('\n🔧 Fixing Document Test Workflows\n'));
  console.log(chalk.gray('This will add proper connections to make them deployable.\n'));
  
  // Dynamic imports after env setup
  const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
  const { TEST_SCENARIOS } = await import('../tests/integration/test-documentation-phase');
  
  const orchestrator = new WorkflowOrchestrator();
  const results: any[] = [];
  
  async function saveFixedWorkflow(workflow: any, name: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'tests', 'document-test-outputs', 'fixed');
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = `${name.toLowerCase().replace(/\s+/g, '-')}-fixed.json`;
    const filepath = path.join(outputDir, filename);
    
    // Clean up workflow for n8n
    const cleanWorkflow = {
      name: workflow.name,
      nodes: workflow.nodes.map((node: any) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        typeVersion: node.typeVersion,
        position: node.position,
        parameters: node.parameters || {}
      })),
      connections: workflow.connections || {},
      settings: workflow.settings || {},
      staticData: workflow.staticData || null,
      pinData: workflow.pinData || {}
    };
    
    await fs.writeFile(filepath, JSON.stringify(cleanWorkflow, null, 2));
    return filename;
  }
  
  async function fixWorkflow(scenario: typeof TEST_SCENARIOS[0]): Promise<any> {
    const sessionId = `fix_${Date.now()}`;
    
    try {
      // Initialize session
      await orchestrator.sessionRepo.initialize(sessionId, scenario.prompt);
      
      // Set the workflow in session
      const operations = [
        { type: 'setWorkflow', workflow: scenario.workflow }
      ];
      
      await orchestrator.sessionRepo.persistOperations(sessionId, operations);
      await orchestrator.sessionRepo.save(sessionId);
      
      // Run validation phase to add connections
      console.log(chalk.gray(`   Running validation...`));
      const result = await orchestrator.runValidationPhase(sessionId);
      
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error?.message}`);
      }
      
      return result.workflow;
      
    } catch (error) {
      console.error(chalk.red(`   Error: ${error}`));
      throw error;
    }
  }
  
  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const scenario = TEST_SCENARIOS[i];
    
    // Skip empty workflow
    if (scenario.name === 'Empty Workflow') {
      console.log(chalk.yellow(`⏭️  Skipping: ${scenario.name} (empty)`));
      continue;
    }
    
    console.log(chalk.blue(`\n📋 Processing ${i + 1}/${TEST_SCENARIOS.length}: ${scenario.name}`));
    
    try {
      // Fix the workflow
      const fixedWorkflow = await fixWorkflow(scenario);
      
      // Add metadata
      fixedWorkflow.name = `[Fixed] ${scenario.name}`;
      
      // Save the fixed workflow
      const filename = await saveFixedWorkflow(fixedWorkflow, scenario.name);
      
      console.log(chalk.green(`   ✅ Fixed and saved: ${filename}`));
      
      // Count connections added
      const connectionCount = Object.keys(fixedWorkflow.connections || {}).length;
      console.log(chalk.gray(`      Connections added: ${connectionCount}`));
      
      results.push({
        name: scenario.name,
        success: true,
        filename,
        connections: connectionCount
      });
      
    } catch (error) {
      console.log(chalk.red(`   ❌ Failed: ${error}`));
      results.push({
        name: scenario.name,
        success: false,
        error
      });
    }
  }
  
  // Summary
  console.log(chalk.bold.blue('\n📊 Summary\n'));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(chalk.green(`   ✅ Fixed: ${successful}/${results.length}`));
  if (failed > 0) {
    console.log(chalk.red(`   ❌ Failed: ${failed}/${results.length}`));
  }
  
  console.log(chalk.blue(`\n📁 Fixed workflows saved to: tests/document-test-outputs/fixed/`));
  console.log(chalk.gray(`   These workflows now have proper connections and can be deployed to n8n.`));
  
  // Show which ones failed
  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.log(chalk.yellow('\n⚠️  Failed workflows:'));
    failures.forEach(f => {
      console.log(chalk.red(`   - ${f.name}: ${f.error}`));
    });
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });
}