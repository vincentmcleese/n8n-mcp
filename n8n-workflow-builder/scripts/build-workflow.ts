#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createInterface } from 'readline';

// Parse command line arguments
const args = process.argv.slice(2);
const promptArg = args.find(arg => !arg.startsWith('--'));
const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];
const isProduction = args.includes('--production');
const showHelp = args.includes('--help') || args.includes('-h');

// Set NODE_ENV based on production flag
if (!isProduction) {
  process.env.NODE_ENV = 'test';
}

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import type { 
  DiscoveryResult, 
  ConfigurationResult,
  BuildingResult,
  ValidationPhaseResult
} from '../lib/workflow-orchestrator';

// Helper to prompt user for input
async function promptUser(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Show help message
function showHelpMessage() {
  console.log(`
🚀 n8n Workflow Builder

Usage: npx tsx scripts/build-workflow.ts [prompt] [options]

Options:
  --output=<file>    Save workflow to file (e.g., --output=workflow.json)
  --production       Use production models (better quality, slower)
  --help, -h         Show this help message

Examples:
  # Interactive mode
  npx tsx scripts/build-workflow.ts

  # With prompt
  npx tsx scripts/build-workflow.ts "Create a webhook that sends data to Slack"

  # Save to file with production quality
  npx tsx scripts/build-workflow.ts "Build email automation" --output=email-workflow.json --production
`);
}

// Main workflow builder
async function buildWorkflow(prompt: string): Promise<any> {
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = `build-${Date.now()}`;
  
  console.log('\n🚀 Building n8n Workflow');
  console.log(`\n📝 Prompt: "${prompt}"`);
  console.log(`🔧 Mode: ${isProduction ? 'Production' : 'Test (faster)'}`);
  
  try {
    // Phase 1: Discovery
    console.log('\n📍 Phase 1: Discovery');
    console.log('   🔍 Analyzing prompt and searching for nodes...');
    
    let discoveryResult = await orchestrator.runDiscoveryPhase(sessionId, prompt);
    
    // Handle clarifications if needed
    while (discoveryResult.pendingClarification) {
      console.log(`\n   ❓ Clarification needed:`);
      console.log(`   ${discoveryResult.pendingClarification.question}`);
      
      const response = await promptUser('\n   Your answer: ');
      
      discoveryResult = await orchestrator.handleClarificationResponse(
        sessionId,
        discoveryResult.pendingClarification.questionId,
        response
      );
    }
    
    if (!discoveryResult.success || discoveryResult.selectedNodeIds.length === 0) {
      throw new Error('Discovery phase failed: No nodes found for your workflow');
    }
    
    console.log(`   ✅ Found ${discoveryResult.discoveredNodes.length} nodes, selected ${discoveryResult.selectedNodeIds.length}`);
    console.log(`   📦 Nodes: ${discoveryResult.discoveredNodes
      .filter(n => discoveryResult.selectedNodeIds.includes(n.id))
      .map(n => n.type)
      .join(', ')}`);
    
    // Phase 2: Configuration
    console.log('\n📍 Phase 2: Configuration');
    console.log('   ⚙️  Configuring nodes with required parameters...');
    
    const configResult = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
    
    if (!configResult.success) {
      throw new Error(`Configuration phase failed: ${configResult.error?.message}`);
    }
    
    const validNodes = configResult.configured.filter(n => n.validated);
    console.log(`   ✅ Configured ${configResult.configured.length} nodes`);
    console.log(`   ✓  Validated: ${validNodes.length}/${configResult.configured.length}`);
    
    if (validNodes.length === 0) {
      throw new Error('No nodes passed validation');
    }
    
    // Phase 3: Building
    console.log('\n📍 Phase 3: Building');
    console.log('   🏗️  Assembling workflow structure...');
    
    const buildResult = await orchestrator.runBuildingPhase(sessionId, configResult);
    
    if (!buildResult.success) {
      throw new Error(`Building phase failed: ${buildResult.error?.message}`);
    }
    
    console.log(`   ✅ Created workflow with ${buildResult.workflow.nodes.length} nodes`);
    console.log(`   🔗 Connections: ${Object.keys(buildResult.workflow.connections || {}).length}`);
    
    // Phase 4: Validation
    console.log('\n📍 Phase 4: Validation');
    console.log('   🔍 Validating and fixing workflow...');
    
    const validationResult = await orchestrator.runValidationPhase(sessionId, buildResult);
    
    if (!validationResult.success) {
      throw new Error(`Validation phase failed: ${validationResult.error?.message}`);
    }
    
    const fixCount = validationResult.validationReport?.fixesApplied?.length || 0;
    console.log(`   ✅ Workflow validated${fixCount > 0 ? ` (${fixCount} fixes applied)` : ''}`);
    
    if (!validationResult.workflow.valid && validationResult.validationReport?.attempts >= 3) {
      console.log('   ⚠️  Warning: Some validation issues remain after 3 attempts');
      const continueAnyway = await promptUser('\n   Continue anyway? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        throw new Error('Workflow validation incomplete');
      }
    }
    
    // Return the final workflow
    return validationResult.workflow;
    
  } catch (error) {
    console.error('\n❌ Error building workflow:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Main execution
async function main() {
  if (showHelp) {
    showHelpMessage();
    process.exit(0);
  }
  
  try {
    // Get prompt from args or interactive
    let prompt = promptArg;
    if (!prompt) {
      console.log('\n🤖 n8n Workflow Builder - Interactive Mode\n');
      prompt = await promptUser('Describe the workflow you want to create: ');
      
      if (!prompt) {
        console.error('\n❌ Please provide a workflow description');
        process.exit(1);
      }
    }
    
    // Build the workflow
    const workflow = await buildWorkflow(prompt);
    
    // Format the output
    const jsonOutput = JSON.stringify(workflow, null, 2);
    
    // Save to file or output to console
    if (outputFile) {
      await fs.writeFile(outputFile, jsonOutput, 'utf8');
      console.log(`\n✨ Workflow saved to: ${outputFile}`);
      console.log(`\n📋 Import this file into n8n to use your workflow!`);
    } else {
      console.log('\n✨ Workflow JSON (ready for n8n import):\n');
      console.log('=' .repeat(60));
      console.log(jsonOutput);
      console.log('=' .repeat(60));
      console.log('\n💡 Tip: Use --output=workflow.json to save to a file');
    }
    
    // Show summary
    console.log(`\n📊 Workflow Summary:`);
    console.log(`   - Name: ${workflow.name}`);
    console.log(`   - Nodes: ${workflow.nodes?.length || 0}`);
    console.log(`   - Valid: ${workflow.valid ? '✅ Yes' : '⚠️  Has warnings'}`);
    
  } catch (error) {
    console.error('\n💥 Failed to build workflow');
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});

// Run the main function
main().catch(console.error);