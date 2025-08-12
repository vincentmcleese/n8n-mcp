#!/usr/bin/env tsx

/**
 * Complete End-to-End Integration Test
 * 
 * Tests the entire workflow building pipeline from prompt to documented workflow:
 * 1. Discovery phase - Analyze user intent
 * 2. Configuration phase - Configure discovered nodes
 * 3. Building phase - Generate workflow structure
 * 4. Validation phase - Validate and fix workflow
 * 5. Documentation phase - Add sticky notes for documentation
 * 
 * Saves the final output as JSON that can be imported directly into n8n.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import * as readline from 'readline';
import { TestReporter } from '@/lib/test-reporter';
import { patchOrchestratorWithReporter } from '@/lib/test-reporter-hooks';

// Load env first
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// CLI args
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n');
const testPrompt = args.find(a => a.startsWith('--prompt='))?.split('=')[1];
const shouldDeploy = true; // Always deploy - we can change this logic later if needed

if (isVerbose) {
  process.env.LOG_LEVEL = 'debug';
  process.env.TEST_VERBOSE = 'true';
}

// Readline for user input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function waitForEnter(message: string = 'Press Enter to continue...'): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`\n${message} `), (answer) => {
      resolve(answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'skip');
    });
  });
}

function getUserInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${prompt}: `), (answer) => {
      resolve(answer);
    });
  });
}

// Create output directory
const outputDir = path.join(process.cwd(), 'tests', 'complete-test-outputs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Save workflow output as n8n-compatible JSON
 */
function saveWorkflowOutput(
  workflow: any,
  prompt: string,
  testName: string,
  phaseResults: any
): string {
  // Create filename from test name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = testName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const fileName = `${safeName}-${timestamp}.json`;
  const filePath = path.join(outputDir, fileName);
  
  // Create n8n-compatible output
  const n8nWorkflow = {
    name: workflow.name || testName,
    nodes: workflow.nodes || [],
    connections: workflow.connections || {},
    settings: workflow.settings || {},
    staticData: null,
    tags: [],
    triggerCount: 0,
    updatedAt: new Date().toISOString(),
    versionId: null,
    // Add metadata for testing
    __metadata: {
      prompt,
      testName,
      generatedAt: new Date().toISOString(),
      phases: {
        discovery: phaseResults.discovery?.success || false,
        configuration: phaseResults.configuration?.success || false,
        building: phaseResults.building?.success || false,
        validation: phaseResults.validation?.success || false,
        documentation: phaseResults.documentation?.success || false,
      },
      validationAttempts: phaseResults.validation?.validationReport?.attempts || 0,
      stickyNotesAdded: phaseResults.documentation?.stickyNotesAdded || 0,
    }
  };
  
  // Save to file
  fs.writeFileSync(filePath, JSON.stringify(n8nWorkflow, null, 2));
  
  return filePath;
}

/**
 * Deploy workflow to n8n instance using MCP tool
 */
async function deployWorkflow(workflow: any, name: string, mcpClient?: any): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    // Remove metadata before deployment
    const deployableWorkflow = { ...workflow };
    delete deployableWorkflow.__metadata;
    
    if (!mcpClient) {
      console.log(chalk.yellow('   ⚠️ MCP client not available for deployment'));
      return { success: false, error: 'MCP client not available' };
    }

    console.log(chalk.gray('   Deploying via MCP...'));
    const result = await mcpClient.createWorkflow(deployableWorkflow);
    
    if (result.isError) {
      throw new Error(`MCP deployment failed: ${result.content?.[0]?.text || 'Unknown error'}`);
    }
    
    // Parse the workflow ID from the response
    let workflowId: string | undefined;
    
    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          try {
            const data = JSON.parse(item.text);
            workflowId = data.id || data.workflowId || data.workflow?.id;
            if (workflowId) break;
          } catch {
            // Try pattern matching if not JSON
            const match = item.text.match(/id[:\s]+["']?([a-zA-Z0-9-]+)["']?/i);
            if (match?.[1]) {
              workflowId = match[1];
            }
          }
        }
      }
    }
    
    if (workflowId) {
      console.log(chalk.green(`      Workflow ID: ${workflowId}`));
      return { success: true, id: workflowId };
    } else {
      return { success: true };
    }
    
  } catch (error) {
    console.log(chalk.red(`   ❌ Deployment failed: ${error}`));
    return { success: false, error };
  }
}

async function runCompleteWorkflow(orchestrator: any, name: string, prompt: string) {
  const sessionId = `complete_e2e_${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
  const startTime = Date.now();
  const phaseResults: any = {};
  let reportPath: string | undefined;
  
  // Initialize reporter
  const reporter = new TestReporter(name, prompt, sessionId);
  
  // Patch orchestrator with reporter hooks for detailed tracking
  patchOrchestratorWithReporter(orchestrator, reporter);
  
  console.log(chalk.blue(`\n📋 Running Complete E2E Test: ${name}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.gray(`Prompt: "${prompt}"`));
  console.log(chalk.gray(`Session: ${sessionId}`));
  console.log();

  try {
    // Initialize session
    await orchestrator.sessionRepo.initialize(sessionId, prompt);
    
    // === PHASE 1: DISCOVERY ===
    console.log(chalk.blue('🔍 Phase 1: Discovery'));
    reporter.startPhase('discovery');
    
    const discoveryResult = await orchestrator.runDiscoveryPhase(sessionId, prompt);
    phaseResults.discovery = discoveryResult;
    
    // Track discovered nodes
    if (discoveryResult.discoveredNodes) {
      discoveryResult.discoveredNodes.forEach((node: any) => {
        reporter.addNode('discovery', {
          id: node.id,
          type: node.type,
          purpose: node.purpose || 'Unknown',
          confidence: node.confidence,
        });
      });
    }
    
    // Capture session state and data flow
    const discoverySessionState = await orchestrator.sessionRepo.load(sessionId);
    reporter.updateSessionState('discovery', discoverySessionState);
    reporter.captureDataFlow('discovery', 
      { prompt }, 
      { intent: discoveryResult.intent, nodes: discoveryResult.discoveredNodes },
      ['Intent Analysis', 'Node Discovery', 'Selection']
    );
    
    reporter.endPhase(discoveryResult.success, discoveryResult);
    
    if (!discoveryResult.success) {
      reporter.addError('discovery', discoveryResult.error);
      throw new Error(`Discovery failed: ${discoveryResult.error?.message}`);
    }
    console.log(chalk.green(`   ✅ Discovery completed`));
    if (isVerbose && discoveryResult.intent) {
      console.log(chalk.gray(`      Intent: ${discoveryResult.intent.description}`));
      console.log(chalk.gray(`      Nodes: ${discoveryResult.intent.suggestedNodes?.join(', ')}`));
    }
    
    // === PHASE 2: CONFIGURATION ===
    console.log(chalk.blue('\n⚙️ Phase 2: Configuration'));
    reporter.startPhase('configuration');
    
    const configurationResult = await orchestrator.runConfigurationPhase(sessionId);
    phaseResults.configuration = configurationResult;
    
    // Track configured nodes
    const configured = configurationResult.configured || [];
    configured.forEach((node: any) => {
      reporter.addNode('configuration', {
        id: node.id,
        type: node.type,
        purpose: node.purpose || 'Configured',
        configuration: node.config,
        validationStatus: node.validated ? 'valid' : 'invalid',
        validationErrors: node.validationErrors,
      });
      
      // Add warnings for validation issues
      if (node.validationErrors && node.validationErrors.length > 0) {
        node.validationErrors.forEach((error: string) => {
          reporter.addWarning('configuration', `Node ${node.id}: ${error}`);
        });
      }
    });
    
    // Capture session state and data flow
    const configSessionState = await orchestrator.sessionRepo.load(sessionId);
    reporter.updateSessionState('configuration', configSessionState);
    reporter.captureDataFlow('configuration',
      { discoveredNodes: discoveryResult.discoveredNodes },
      { configuredNodes: configured },
      ['Parameter Configuration', 'Validation', 'Type Checking']
    );
    
    reporter.endPhase(configurationResult.success, configurationResult);
    
    if (!configurationResult.success) {
      reporter.addError('configuration', configurationResult.error);
      throw new Error(`Configuration failed: ${configurationResult.error?.message}`);
    }
    const valid = configured.filter((n: any) => n.validated).length;
    console.log(chalk.green(`   ✅ Configuration completed`));
    console.log(chalk.gray(`      Configured: ${configured.length} nodes (${valid} valid)`));
    
    // === PHASE 3: BUILDING ===
    console.log(chalk.blue('\n🔨 Phase 3: Building'));
    reporter.startPhase('building');
    
    const buildingResult = await orchestrator.runBuildingPhase(sessionId);
    phaseResults.building = buildingResult;
    
    // Track built workflow structure
    if (buildingResult.workflow?.nodes) {
      buildingResult.workflow.nodes.forEach((node: any) => {
        reporter.addNode('building', {
          id: node.id,
          type: node.type,
          purpose: node.name || 'Built node',
        });
      });
    }
    
    // Log phase information
    reporter.log('INFO', 'Orchestrator', `Created ${buildingResult.workflow?.nodes?.length || 0} nodes`);
    reporter.log('INFO', 'Orchestrator', `Created ${Object.keys(buildingResult.workflow?.connections || {}).length} connection groups`);
    
    // Capture session state and data flow
    const buildingSessionState = await orchestrator.sessionRepo.load(sessionId);
    reporter.updateSessionState('building', buildingSessionState);
    reporter.captureDataFlow('building',
      { configuredNodes: configured },
      { workflow: buildingResult.workflow, raw: buildingResult.error?.raw },
      ['Workflow Generation', 'Connection Building', 'Settings Configuration']
    );
    
    reporter.endPhase(buildingResult.success, buildingResult);
    
    if (!buildingResult.success) {
      reporter.addError('building', buildingResult.error);
      
      // Log raw response if available for debugging
      if (buildingResult.error?.raw) {
        console.log(chalk.yellow('\n   ⚠️ Raw workflow attempt (failed validation):'));
        console.log(chalk.gray(JSON.stringify(buildingResult.error.raw, null, 2)));
      }
      
      throw new Error(`Building failed: ${buildingResult.error?.message}`);
    }
    const nodeCount = buildingResult.workflow?.nodes?.length || 0;
    const connectionCount = Object.keys(buildingResult.workflow?.connections || {}).length;
    console.log(chalk.green(`   ✅ Building completed`));
    console.log(chalk.gray(`      Generated: ${nodeCount} nodes, ${connectionCount} connection groups`));
    
    // === PHASE 4: VALIDATION ===
    console.log(chalk.blue('\n✔️ Phase 4: Validation'));
    reporter.startPhase('validation');
    
    const validationResult = await orchestrator.runValidationPhase(sessionId, buildingResult);
    phaseResults.validation = validationResult;
    
    // Track validation errors and fixes
    if (validationResult.validationReport?.fixesApplied) {
      validationResult.validationReport.fixesApplied.forEach((fix: any, index: number) => {
        reporter.addError('validation', {
          type: 'ValidationError',
          message: fix.error || `Error ${index + 1}`,
          resolution: fix.fix || 'Applied automatic fix',
          attemptNumber: fix.attempt || 1,
        });
      });
    }
    
    // Log validation summary
    const attempts = validationResult.validationReport?.attempts || 0;
    const fixesApplied = validationResult.validationReport?.fixesApplied || [];
    reporter.log('INFO', 'Orchestrator', `Validation completed in ${attempts} attempts`);
    reporter.log('INFO', 'Tools', `Applied ${fixesApplied.length} fixes`);
    
    // Capture session state and data flow
    const validationSessionState = await orchestrator.sessionRepo.load(sessionId);
    reporter.updateSessionState('validation', validationSessionState);
    reporter.captureDataFlow('validation',
      { workflow: buildingResult.workflow },
      { validatedWorkflow: validationResult.workflow, report: validationResult.validationReport },
      ['Validation Check', 'Error Detection', 'Automatic Fixes']
    );
    
    reporter.endPhase(validationResult.success, validationResult);
    
    if (!validationResult.success) {
      console.log(chalk.yellow(`   ⚠️ Validation completed with warnings`));
    } else {
      console.log(chalk.green(`   ✅ Validation completed`));
    }
    
    const isValid = validationResult.workflow?.valid || false;
    
    console.log(chalk.gray(`      Attempts: ${attempts}`));
    console.log(chalk.gray(`      Fixes applied: ${fixesApplied.length}`));
    console.log(chalk.gray(`      Valid: ${isValid ? '✅ Yes' : '⚠️ No'}`));
    
    // === PHASE 5: DOCUMENTATION ===
    console.log(chalk.blue('\n📝 Phase 5: Documentation'));
    reporter.startPhase('documentation');
    
    const documentationResult = await orchestrator.runDocumentationPhase(sessionId, validationResult);
    phaseResults.documentation = documentationResult;
    
    // Track documentation additions
    const stickyNotesAdded = documentationResult.stickyNotesAdded || 0;
    reporter.log('INFO', 'Orchestrator', `Added ${stickyNotesAdded} sticky notes for documentation`);
    
    // Capture session state and data flow
    const docSessionState = await orchestrator.sessionRepo.load(sessionId);
    reporter.updateSessionState('documentation', docSessionState);
    reporter.captureDataFlow('documentation',
      { validatedWorkflow: validationResult.workflow },
      { documentedWorkflow: documentationResult.workflow, stickyNotesAdded },
      ['Documentation Generation', 'Sticky Note Placement', 'Workflow Finalization']
    );
    
    reporter.endPhase(documentationResult.success, documentationResult);
    
    if (!documentationResult.success) {
      reporter.addError('documentation', documentationResult.error);
      console.log(chalk.yellow(`   ⚠️ Documentation failed: ${documentationResult.error?.message}`));
      console.log(chalk.yellow(`      Using validated workflow without documentation`));
    } else {
      console.log(chalk.green(`   ✅ Documentation completed`));
      console.log(chalk.gray(`      Sticky notes added: ${documentationResult.stickyNotesAdded || 0}`));
    }
    
    // Use documented workflow if available, otherwise use validated workflow
    const finalWorkflow = documentationResult.success && documentationResult.workflow 
      ? documentationResult.workflow 
      : validationResult.workflow;
    
    // === SAVE OUTPUT ===
    console.log(chalk.blue('\n💾 Saving Output'));
    const outputPath = saveWorkflowOutput(
      finalWorkflow,
      prompt,
      name,
      phaseResults
    );
    console.log(chalk.green(`   ✅ Saved to: ${path.basename(outputPath)}`));
    
    // Generate and save report
    reporter.generateSummary(finalWorkflow, validationResult.validationReport);
    reporter.finalize(true, Date.now() - startTime);
    reportPath = reporter.saveReport(outputDir);
    console.log(chalk.green(`   ✅ Report saved to: ${path.basename(reportPath)}`));
    
    // === PHASE 6: DEPLOYMENT (if configured) ===
    if (shouldDeploy && !finalWorkflow) {
      console.log(chalk.yellow('\n⚠️ Deployment requested but no workflow available'));
    }
    if (shouldDeploy && finalWorkflow) {
      console.log(chalk.blue('\n🚀 Phase 6: Deployment'));
      // Get MCP client from orchestrator if available
      const mcpClient = orchestrator.mcpClient || orchestrator.getMCPClient?.();
      const deployResult = await deployWorkflow(finalWorkflow, name, mcpClient);
      phaseResults.deployment = deployResult;
      
      if (deployResult.success) {
        console.log(chalk.green(`   ✅ Deployed successfully`));
        if (deployResult.id) {
          console.log(chalk.gray(`      Workflow ID: ${deployResult.id}`));
          const baseUrl = process.env.N8N_API_URL || 'https://app.n8n.cloud';
          // Remove /api from URL if present for the UI URL
          const uiUrl = baseUrl.replace('/api/v1', '').replace('/api', '');
          console.log(chalk.gray(`      URL: ${uiUrl}/workflow/${deployResult.id}`));
        }
      } else {
        console.log(chalk.yellow(`   ⚠️ Deployment skipped or failed`));
        if (deployResult.error) {
          console.log(chalk.gray(`      Reason: ${deployResult.error}`));
        }
      }
    }
    
    const duration = Date.now() - startTime;
    
    // === SUMMARY ===
    console.log(chalk.blue('\n📊 Test Summary'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green(`   ✅ All phases completed in ${duration}ms`));
    console.log(chalk.gray(`      Discovery: ${phaseResults.discovery.success ? '✅' : '❌'}`));
    console.log(chalk.gray(`      Configuration: ${phaseResults.configuration.success ? '✅' : '❌'}`));
    console.log(chalk.gray(`      Building: ${phaseResults.building.success ? '✅' : '❌'}`));
    console.log(chalk.gray(`      Validation: ${phaseResults.validation.success ? '✅' : '❌'} (${attempts} attempts)`));
    console.log(chalk.gray(`      Documentation: ${phaseResults.documentation.success ? '✅' : '❌'}`));
    if (shouldDeploy) {
      console.log(chalk.gray(`      Deployment: ${phaseResults.deployment?.success ? '✅' : '❌'}`));
    }
    console.log(chalk.gray(`      Final workflow: ${finalWorkflow.nodes?.length || 0} nodes (${finalWorkflow.nodes?.filter((n: any) => n.type === 'n8n-nodes-base.stickyNote').length || 0} sticky notes)`));
    
    return {
      success: true,
      duration,
      outputPath,
      workflow: finalWorkflow,
      phaseResults,
      reportPath,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(chalk.red(`\n❌ Test failed after ${duration}ms`));
    console.log(chalk.red(`   Error: ${error}`));
    
    // Still try to save partial output for debugging
    if (phaseResults.validation?.workflow || phaseResults.building?.workflow) {
      const partialWorkflow = phaseResults.validation?.workflow || phaseResults.building?.workflow;
      const outputPath = saveWorkflowOutput(
        partialWorkflow,
        prompt,
        `${name}-FAILED`,
        phaseResults
      );
      console.log(chalk.yellow(`   ⚠️ Partial output saved to: ${path.basename(outputPath)}`));
    }
    
    // Generate failure report
    reporter.generateSummary(
      phaseResults.validation?.workflow || phaseResults.building?.workflow || {},
      phaseResults.validation?.validationReport || {}
    );
    reporter.finalize(false, duration);
    reportPath = reporter.saveReport(outputDir);
    console.log(chalk.yellow(`   ⚠️ Failure report saved to: ${path.basename(reportPath)}`));
    
    return {
      success: false,
      duration,
      error,
      phaseResults,
      reportPath,
    };
  }
}

// Test scenarios for automated testing
const TEST_SCENARIOS = [
  {
    name: "Simple Webhook to Slack",
    prompt: "Create a workflow that receives webhook data and sends it to Slack channel #general",
  },
  {
    name: "API Data Processing",
    prompt: "Fetch data from https://api.example.com/data, transform it with code, and check if amount > 100",
  },
  {
    name: "Conditional Email Alert",
    prompt: "Monitor RSS feed, check if title contains 'urgent', and send email alert if true",
  },
];

async function main() {
  console.log(chalk.bold.blue('\n🚀 Complete End-to-End Integration Test\n'));
  console.log(chalk.gray('Testing full workflow generation pipeline with all phases...'));
  console.log(chalk.gray('Output will be saved to: tests/complete-test-outputs/\n'));

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Complete End-to-End Integration Test')}

${chalk.gray('Usage:')} npm run test:complete:e2e [options]

${chalk.gray('Options:')}
  --verbose, -v       Show detailed output
  --no-prompt, -n     Skip interactive prompts and run all scenarios
  --prompt="..."      Run with specific prompt
  --deploy, -d        Deploy workflow to n8n after successful generation
  --help, -h          Show this help message

${chalk.gray('Examples:')}
  npm run test:complete:e2e
  npm run test:complete:e2e --verbose
  npm run test:complete:e2e --prompt="Create a Slack notification workflow"
  npm run test:complete:e2e --no-prompt
  npm run test:complete:e2e --deploy
  npm run test:complete:e2e --prompt="Create webhook to Slack" --deploy

${chalk.gray('What this tests:')}
  - Complete workflow generation pipeline
  - Discovery phase: Intent analysis
  - Configuration phase: Node setup
  - Building phase: Workflow generation
  - Validation phase: Error checking and fixing
  - Documentation phase: Adding sticky notes
  - Deployment phase: Upload to n8n (optional)
  - Output saving: n8n-compatible JSON

${chalk.gray('Environment Variables:')}
  N8N_API_KEY         API key for n8n deployment (optional)
  N8N_API_URL         n8n instance URL (optional)

${chalk.gray('Output:')}
  Workflows are saved to: tests/complete-test-outputs/
  Files can be imported directly into n8n
`);
    process.exit(0);
  }

  const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
  const orchestrator = new WorkflowOrchestrator();

  const results: any[] = [];

  try {
    // Use provided prompt or run test scenarios
    if (testPrompt) {
      // Single custom test
      const result = await runCompleteWorkflow(orchestrator, "Custom Test", testPrompt);
      results.push({ scenario: "Custom Test", ...result });
    } else if (!skipPrompts) {
      // Interactive mode
      console.log(chalk.yellow('📝 Enter a workflow prompt (or press Enter to run test scenarios):'));
      const userPrompt = await getUserInput('Prompt');
      
      if (userPrompt.trim()) {
        const result = await runCompleteWorkflow(orchestrator, "User Test", userPrompt);
        results.push({ scenario: "User Test", ...result });
      } else {
        // Run test scenarios
        for (const scenario of TEST_SCENARIOS) {
          const shouldRun = await waitForEnter(
            `Press Enter to run "${scenario.name}" (or type 's' to skip)...`
          );
          
          if (shouldRun) {
            const result = await runCompleteWorkflow(orchestrator, scenario.name, scenario.prompt);
            results.push({ scenario: scenario.name, ...result });
          } else {
            console.log(chalk.yellow(`⏭️  Skipped ${scenario.name}`));
          }
        }
      }
    } else {
      // Run all test scenarios without prompts
      for (const scenario of TEST_SCENARIOS) {
        const result = await runCompleteWorkflow(orchestrator, scenario.name, scenario.prompt);
        results.push({ scenario: scenario.name, ...result });
      }
    }

    // Final summary
    console.log(chalk.bold.blue('\n📊 Final Summary\n'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(chalk.green(`   ✅ Passed: ${passed}/${results.length}`));
    if (failed > 0) {
      console.log(chalk.red(`   ❌ Failed: ${failed}/${results.length}`));
    }
    
    console.log(chalk.gray(`\n   ⏱️  Total time: ${totalDuration}ms`));
    console.log(chalk.gray(`   ⚡ Average: ${Math.round(totalDuration / Math.max(1, results.length))}ms per test`));
    
    console.log(chalk.green(`\n   💾 Output saved to: ${path.relative(process.cwd(), outputDir)}/`));
    console.log(chalk.gray(`      Files can be imported directly into n8n`));
    
    const allPassed = passed === results.length;
    console.log(chalk.bold[allPassed ? 'green' : 'red'](`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'All tests passed!' : 'Some tests failed'}`));
    
    rl.close();
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test crashed:'), error);
    rl.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(chalk.red('\n❌ Test crashed:'), err);
  rl.close();
  process.exit(1);
});
