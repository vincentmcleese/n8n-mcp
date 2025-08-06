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
const isVerbose = args.includes('--verbose') || args.includes('-v');
const showHelp = args.includes('--help') || args.includes('-h');

// Set NODE_ENV based on production flag
if (!isProduction) {
  process.env.NODE_ENV = 'test';
  process.env.BUILD_WORKFLOW = 'true';
  // Set log level based on verbose flag
  if (!isVerbose) {
    process.env.LOG_LEVEL = 'info';
  } else {
    process.env.LOG_LEVEL = 'debug';
    process.env.TEST_VERBOSE = 'true';
  }
}

// Load environment variables BEFORE any module imports
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Type imports can stay as they don't execute code
import type { 
  DiscoveryResult, 
  ConfigurationResult,
  BuildingResult,
  ValidationPhaseResult,
  DocumentationPhaseResult
} from '@/lib/workflow-orchestrator';

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
  --verbose, -v      Show detailed debug logs
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
  // Dynamic import to ensure env vars are loaded first
  const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
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
    
    // Show validation details if verbose
    if (isVerbose && configResult.operations) {
      console.log('\n   📊 Validation Details:');
      
      // Extract validation history from operations
      const validationOps = configResult.operations.filter((op: any) => op.type === 'validationHistory');
      validationOps.forEach((op: any) => {
        console.log(`\n   Node: ${op.nodeType} (${op.nodeId})`);
        console.log(`   Attempts: ${op.totalAttempts}`);
        console.log(`   Final Status: ${op.finalValid ? '✅ Valid' : '❌ Invalid'}`);
        
        if (op.history && op.history.length > 0) {
          op.history.forEach((attempt: any) => {
            console.log(`     Attempt ${attempt.attempt}: ${attempt.valid ? '✅' : '❌'}`);
            if (!attempt.valid && attempt.errors && attempt.errors.length > 0) {
              attempt.errors.forEach((err: string) => {
                console.log(`       - ${err}`);
              });
            }
          });
        }
      });
      
      // Show reasoning if available
      if (configResult.reasoning && configResult.reasoning.length > 0) {
        console.log('\n   🧠 Configuration Reasoning:');
        configResult.reasoning.forEach((reason: string) => {
          console.log(`     ${reason}`);
        });
      }
    }
    
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
    
    // Phase 5: Documentation (optional)
    console.log('\n📍 Phase 5: Documentation');
    console.log('   📝 Adding helpful sticky notes...');
    
    const documentationResult = await orchestrator.runDocumentationPhase(sessionId, validationResult);
    
    if (documentationResult.success && documentationResult.stickyNotesAdded) {
      console.log(`   ✅ Added ${documentationResult.stickyNotesAdded} sticky notes`);
      return documentationResult.workflow;
    } else if (!documentationResult.success) {
      console.log('   ⚠️  Warning: Could not add documentation notes');
      // Continue with validation result if documentation fails
      return validationResult.workflow;
    }
    
    // Return the final workflow with documentation
    return documentationResult.workflow;
    
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
    const stickyNotes = workflow.nodes?.filter((n: any) => n.type === 'n8n-nodes-base.stickyNote').length || 0;
    if (stickyNotes > 0) {
      console.log(`   - Sticky Notes: ${stickyNotes}`);
    }
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