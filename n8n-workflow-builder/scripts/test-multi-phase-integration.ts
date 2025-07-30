#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV to test for faster model
process.env.NODE_ENV = 'test';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import type { 
  DiscoveryResult, 
  ConfigurationResult,
  WorkflowPhase 
} from '../lib/workflow-orchestrator';

// Test result tracking
interface PhaseResult {
  phase: WorkflowPhase;
  success: boolean;
  duration: number;
  details?: any;
}

interface TestScenario {
  name: string;
  prompt: string;
  expectedPhases: WorkflowPhase[];
  clarificationResponses?: Record<string, string>;
  validateResult: (results: PhaseResult[]) => void;
}

// Test tracking
const testResults: { name: string; passed: boolean; duration: number; error?: string }[] = [];

// Helper to run a complete multi-phase workflow
async function runMultiPhaseWorkflow(
  scenario: TestScenario
): Promise<PhaseResult[]> {
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = `multi-phase-${Date.now()}`;
  const phaseResults: PhaseResult[] = [];
  
  console.log(`\n🎯 Running scenario: ${scenario.name}`);
  console.log(`   Prompt: "${scenario.prompt}"`);
  
  // Track MCP tool calls
  let mcpToolCalls: { phase: string; tool: string; params?: any }[] = [];
  
  // Phase 1: Discovery
  console.log('\n   📍 Phase 1: Discovery');
  console.log('   🔧 MCP Tools Expected: search_nodes, list_nodes, list_ai_tools, get_node_info');
  const discoveryStart = Date.now();
  
  let discoveryResult = await orchestrator.runDiscoveryPhase(sessionId, scenario.prompt);
  
  // Handle clarifications if needed
  if (discoveryResult.pendingClarification && scenario.clarificationResponses) {
    const questionId = discoveryResult.pendingClarification.questionId;
    const response = scenario.clarificationResponses[questionId];
    
    if (response) {
      console.log(`   🔍 Clarification: "${discoveryResult.pendingClarification.question}"`);
      console.log(`   💬 Response: "${response}"`);
      
      discoveryResult = await orchestrator.handleClarificationResponse(
        sessionId,
        questionId,
        response
      );
    }
  }
  
  const discoveryDuration = Date.now() - discoveryStart;
  phaseResults.push({
    phase: 'discovery',
    success: discoveryResult.success,
    duration: discoveryDuration,
    details: {
      discoveredNodes: discoveryResult.discoveredNodes.length,
      selectedNodes: discoveryResult.selectedNodeIds.length,
      nodeTypes: discoveryResult.discoveredNodes.map(n => n.type)
    }
  });
  
  console.log(`   ✅ Discovery completed: ${discoveryResult.selectedNodeIds.length} nodes selected (${discoveryDuration}ms)`);
  
  if (!discoveryResult.success || discoveryResult.selectedNodeIds.length === 0) {
    throw new Error('Discovery phase failed or no nodes selected');
  }
  
  // Phase 2: Configuration
  console.log('\n   📍 Phase 2: Configuration');
  console.log('   🔧 MCP Tools Expected: get_node_essentials, search_node_properties, get_node_for_task, get_node_documentation, validate_node_operation');
  console.log(`   📥 Input: ${discoveryResult.selectedNodeIds.length} selected nodes from discovery`);
  console.log(`   🔧 Node types to configure: ${discoveryResult.discoveredNodes
    .filter(n => discoveryResult.selectedNodeIds.includes(n.id))
    .map(n => n.type)
    .join(', ')}`);
  
  const configStart = Date.now();
  
  const configResult = await orchestrator.runConfigurationPhase(sessionId, discoveryResult);
  
  const configDuration = Date.now() - configStart;
  
  // Log configuration details
  if (configResult.success) {
    console.log('\n   📋 Configuration Results:');
    
    // Show reasoning
    if (configResult.reasoning && configResult.reasoning.length > 0) {
      console.log('   💭 Reasoning:');
      configResult.reasoning.forEach((reason, idx) => {
        console.log(`      ${idx + 1}. ${reason}`);
      });
    }
    
    // Show configured nodes with their configurations
    console.log('\n   🔧 Configured Nodes:');
    configResult.configured.forEach((node, idx) => {
      const validationStatus = node.validated ? '✅' : '❌';
      console.log(`      ${idx + 1}. ${node.type} (${node.id}) ${validationStatus}`);
      console.log(`         Purpose: ${node.purpose}`);
      console.log(`         Validated: ${node.validated}`);
      if (!node.validated && node.validationErrors) {
        console.log(`         Validation errors: ${node.validationErrors.join(', ')}`);
      }
      if (node.config && Object.keys(node.config).length > 0) {
        console.log(`         Config: ${JSON.stringify(node.config, null, 12).replace(/\n/g, '\n         ')}`);
      }
    });
    
    // Show operations generated
    console.log(`\n   📊 Operations: ${configResult.operations.length} configureNode operations generated`);
    
    // Summary for next phase
    console.log('\n   📤 Output for next phase:');
    console.log(`      - ${configResult.configured.length} nodes configured`);
    console.log(`      - ${configResult.configured.filter(n => n.validated).length} nodes validated and ready to build`);
    console.log(`      - ${configResult.configured.filter(n => !n.validated).length} nodes failed validation`);
    console.log(`      - All nodes have: ${configResult.configured.every(n => n.config) ? '✅' : '❌'} configurations`);
    console.log(`      - All nodes validated: ${configResult.configured.every(n => n.validated) ? '✅' : '❌'}`);
  } else {
    console.log(`   ❌ Configuration failed: ${configResult.error?.message}`);
  }
  
  phaseResults.push({
    phase: 'configuration',
    success: configResult.success,
    duration: configDuration,
    details: {
      configuredNodes: configResult.configured.length,
      nodeTypes: configResult.configured.map(n => n.type),
      hasConfigs: configResult.configured.filter(n => n.config && Object.keys(n.config).length > 0).length,
      validatedNodes: configResult.configured.filter(n => n.validated).length,
      invalidNodes: configResult.configured.filter(n => !n.validated).length
    }
  });
  
  console.log(`\n   ✅ Configuration phase completed (${configDuration}ms)`);
  console.log(`   📊 Validation summary: ${configResult.configured.filter(n => n.validated).length}/${configResult.configured.length} nodes validated`);
  
  // Future phases will go here
  // Phase 3: Validation
  // Phase 4: Building
  
  return phaseResults;
}

// Test scenarios
const testScenarios: TestScenario[] = [
  {
    name: 'Simple Webhook → Slack (no clarifications)',
    prompt: 'Create a webhook at /api/notify that sends data to Slack channel #alerts',
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      // Validate discovery phase
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success || discovery.details.selectedNodes < 2) {
        throw new Error('Discovery should select at least 2 nodes');
      }
      
      // Validate configuration phase
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success || config.details.configuredNodes < 2) {
        throw new Error('Configuration should configure at least 2 nodes');
      }
      
      // Validate node types
      const nodeTypes = config.details.nodeTypes as string[];
      if (!nodeTypes.some(t => t.includes('webhook'))) {
        throw new Error('Should have webhook node');
      }
      if (!nodeTypes.some(t => t.includes('slack'))) {
        throw new Error('Should have Slack node');
      }
      
      // Validate that nodes are pre-validated
      if (config.details.validatedNodes !== config.details.configuredNodes) {
        throw new Error(`Only ${config.details.validatedNodes}/${config.details.configuredNodes} nodes validated`);
      }
    }
  },
  
  {
    name: 'AI-Powered Data Processing with Property Search',
    prompt: `Build an AI-powered workflow that:
      1. Receives JSON data via webhook with authentication
      2. Uses OpenAI to analyze sentiment and extract entities
      3. Enriches data with additional context from a database
      4. Routes to different Slack channels based on sentiment
      5. Stores results in PostgreSQL with custom error handling`,
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success) {
        throw new Error('Discovery phase should succeed');
      }
      
      // Should discover AI nodes, webhook, database, and Slack
      if (discovery.details.selectedNodes < 4) {
        throw new Error('Should select at least 4 nodes for AI workflow');
      }
      
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      // Check for AI and database nodes
      const nodeTypes = config.details.nodeTypes as string[];
      const hasAI = nodeTypes.some(t => t.includes('openai') || t.includes('ai'));
      const hasDB = nodeTypes.some(t => t.includes('postgres'));
      const hasWebhook = nodeTypes.some(t => t.includes('webhook'));
      const hasSlack = nodeTypes.some(t => t.includes('slack'));
      
      if (!hasAI || !hasDB || !hasWebhook || !hasSlack) {
        throw new Error('Missing required node types for AI workflow');
      }
      
      // Should have configurations for authentication and error handling
      if (config.details.hasConfigs < 4) {
        throw new Error('All nodes should have configurations');
      }
      
      // Validate pre-validation occurred
      if (config.details.validatedNodes < 4) {
        throw new Error(`Only ${config.details.validatedNodes} nodes validated, expected at least 4`);
      }
    }
  },
  
  {
    name: 'Complex Integration with Documentation Lookup',
    prompt: `Create a comprehensive GitHub to Jira integration:
      1. Monitor GitHub repository for new issues and PRs
      2. Authenticate with both GitHub and Jira APIs using OAuth
      3. Transform GitHub data to match Jira's custom field schema
      4. Create Jira tickets with proper field mapping and attachments
      5. Update GitHub with Jira ticket links
      6. Handle rate limiting and pagination for both APIs`,
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success) {
        throw new Error('Discovery phase should succeed');
      }
      
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      // Should have GitHub and Jira nodes, plus transformation
      const nodeTypes = config.details.nodeTypes as string[];
      const hasGitHub = nodeTypes.some(t => t.includes('github'));
      const hasJira = nodeTypes.some(t => t.includes('jira') || t.includes('atlassian'));
      const hasTransform = nodeTypes.some(t => t.includes('code') || t.includes('function'));
      
      if (!hasGitHub) {
        console.log('   - Note: GitHub node might be substituted with HTTP Request');
      }
      if (!hasJira) {
        console.log('   - Note: Jira node might be substituted with HTTP Request');
      }
      if (!hasTransform) {
        throw new Error('Should have code/function node for data transformation');
      }
      
      // Complex integration should have at least 3 nodes
      if (config.details.configuredNodes < 3) {
        throw new Error('Complex integration should have at least 3 configured nodes');
      }
      
      // Most nodes should be validated
      const validationRate = config.details.validatedNodes / config.details.configuredNodes;
      if (validationRate < 0.8) {
        throw new Error(`Low validation rate: ${validationRate.toFixed(2)}, expected at least 0.8`);
      }
    }
  },
  
  {
    name: 'Multi-Service Orchestration with Advanced Configuration',
    prompt: `Build an e-commerce order processing workflow:
      1. Receive orders via Shopify webhook with HMAC validation
      2. Validate inventory in PostgreSQL with row locking
      3. Process payments through Stripe with idempotency keys
      4. Generate PDF invoices with custom templates
      5. Send emails via SendGrid with dynamic templates
      6. Update multiple systems with proper error handling and retries
      7. Implement circuit breaker pattern for external services`,
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success) {
        throw new Error('Discovery phase should succeed');
      }
      
      // Complex e-commerce workflow should discover many nodes
      if (discovery.details.selectedNodes < 5) {
        throw new Error('E-commerce workflow should select at least 5 nodes');
      }
      
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      // Verify variety of service integrations
      const nodeTypes = config.details.nodeTypes as string[];
      const serviceCount = new Set(nodeTypes.map(t => {
        // Extract service name from node type
        const parts = t.split('.');
        return parts[parts.length - 1].toLowerCase();
      })).size;
      
      if (serviceCount < 4) {
        throw new Error('Should integrate with multiple different services');
      }
      
      // All nodes should be configured
      if (config.details.hasConfigs !== config.details.configuredNodes) {
        throw new Error('All nodes should have configurations for advanced workflow');
      }
      
      // Validate pre-validation
      if (config.details.validatedNodes < config.details.configuredNodes * 0.9) {
        throw new Error(`Expected at least 90% validation rate, got ${config.details.validatedNodes}/${config.details.configuredNodes}`);
      }
    }
  },
  
  {
    name: 'Schema-Driven ETL Pipeline',
    prompt: `Create a data transformation pipeline:
      1. Poll multiple REST APIs with different authentication methods
      2. Validate incoming data against JSON schemas
      3. Transform data using complex JavaScript with external libraries
      4. Handle nested JSON structures and arrays
      5. Perform data quality checks and cleansing
      6. Load into data warehouse with proper type mapping
      7. Generate data lineage documentation`,
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success) {
        throw new Error('Discovery phase should succeed');
      }
      
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      // ETL pipeline requires specific node types
      const nodeTypes = config.details.nodeTypes as string[];
      const hasHTTP = nodeTypes.some(t => t.includes('http') || t.includes('request'));
      const hasCode = nodeTypes.some(t => t.includes('code') || t.includes('function'));
      const hasDB = nodeTypes.some(t => t.includes('postgres') || t.includes('mysql') || t.includes('database'));
      
      if (!hasHTTP) {
        throw new Error('ETL pipeline needs HTTP nodes for API polling');
      }
      if (!hasCode) {
        throw new Error('ETL pipeline needs code nodes for transformation');
      }
      if (!hasDB) {
        throw new Error('ETL pipeline needs database nodes for data warehouse');
      }
      
      // Should have substantial configuration
      if (config.details.configuredNodes < 4) {
        throw new Error('ETL pipeline should have at least 4 configured nodes');
      }
      
      // Validate all nodes are pre-validated
      if (config.details.validatedNodes !== config.details.configuredNodes) {
        throw new Error(`ETL pipeline requires all nodes validated: ${config.details.validatedNodes}/${config.details.configuredNodes}`);
      }
    }
  },
  
  {
    name: 'Database workflow with assumptions',
    prompt: 'Create a workflow that receives JSON data and stores it in a database',
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const discovery = results.find(r => r.phase === 'discovery');
      if (!discovery?.success) {
        throw new Error('Discovery phase should succeed');
      }
      
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      // Claude should make an assumption about which database to use
      const nodeTypes = config.details.nodeTypes as string[];
      const hasDatabase = nodeTypes.some(t => 
        t.includes('postgres') || t.includes('mysql') || t.includes('mongodb') || 
        t.includes('database') || t.includes('sql')
      );
      
      if (!hasDatabase) {
        throw new Error('Should have selected a database node (any reasonable choice)');
      }
      
      // Should also have a webhook or HTTP node to receive JSON
      const hasInput = nodeTypes.some(t => 
        t.includes('webhook') || t.includes('http')
      );
      
      if (!hasInput) {
        throw new Error('Should have a way to receive JSON data');
      }
      
      // Both nodes should be validated
      if (config.details.validatedNodes < 2) {
        throw new Error(`Expected at least 2 validated nodes, got ${config.details.validatedNodes}`);
      }
    }
  },
  
  {
    name: 'Complex multi-step workflow',
    prompt: `Build a workflow that:
      1. Receives webhook data at /api/process
      2. Validates the JSON structure
      3. Transforms data using JavaScript
      4. Stores in PostgreSQL table 'events'
      5. Sends notification to Slack #data-team`,
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success || config.details.configuredNodes < 4) {
        throw new Error('Should configure at least 4 nodes for complex workflow');
      }
      
      // Check all node types are present
      const nodeTypes = config.details.nodeTypes as string[];
      const requiredTypes = ['webhook', 'code', 'postgres', 'slack'];
      for (const type of requiredTypes) {
        if (!nodeTypes.some(t => t.includes(type))) {
          throw new Error(`Missing required node type: ${type}`);
        }
      }
      
      // Validate configurations exist
      if (config.details.hasConfigs < 4) {
        throw new Error('All nodes should have configurations');
      }
      
      // All nodes should be validated
      if (config.details.validatedNodes !== config.details.configuredNodes) {
        throw new Error(`All nodes should be validated: ${config.details.validatedNodes}/${config.details.configuredNodes}`);
      }
    }
  },
  
  {
    name: 'API Integration workflow',
    prompt: 'Create a workflow that fetches data from GitHub API every hour and saves new issues to a Google Sheet',
    expectedPhases: ['discovery', 'configuration'],
    validateResult: (results) => {
      const config = results.find(r => r.phase === 'configuration');
      if (!config?.success) {
        throw new Error('Configuration phase should succeed');
      }
      
      const nodeTypes = config.details.nodeTypes as string[];
      // Should have some combination of: schedule/cron, github, google sheets
      const hasScheduleTrigger = nodeTypes.some(t => 
        t.includes('schedule') || t.includes('cron') || t.includes('interval')
      );
      const hasGitHub = nodeTypes.some(t => t.includes('github'));
      const hasGoogleSheets = nodeTypes.some(t => t.includes('googlesheets') || t.includes('google'));
      
      if (!hasScheduleTrigger && !hasGitHub && !hasGoogleSheets) {
        throw new Error('Should have appropriate nodes for API integration');
      }
      
      // Check validation status
      if (config.details.validatedNodes === 0) {
        throw new Error('No nodes were validated');
      }
      
      // At least most nodes should be validated
      const validationRate = config.details.validatedNodes / config.details.configuredNodes;
      if (validationRate < 0.5) {
        throw new Error(`Low validation rate: ${validationRate.toFixed(2)}`);
      }
    }
  }
];

// Helper to run test with timing
async function runTest(scenario: TestScenario): Promise<void> {
  const startTime = Date.now();
  
  try {
    const results = await runMultiPhaseWorkflow(scenario);
    
    // Validate results
    scenario.validateResult(results);
    
    const totalDuration = Date.now() - startTime;
    const phaseBreakdown = results.map(r => `${r.phase}:${r.duration}ms`).join(', ');
    
    console.log(`\n   ✅ Scenario passed (${totalDuration}ms total)`);
    console.log(`   📊 Phase breakdown: ${phaseBreakdown}`);
    
    testResults.push({
      name: scenario.name,
      passed: true,
      duration: totalDuration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.log(`\n   ❌ Scenario failed: ${errorMessage}`);
    
    testResults.push({
      name: scenario.name,
      passed: false,
      duration,
      error: errorMessage
    });
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Running Multi-Phase Integration Tests\n');
  console.log('This tests the complete flow: Prompt → Discovery → Configuration');
  console.log('Future phases (Validation, Building) can be added to these tests\n');
  
  // Check environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  
  // Run all scenarios
  for (const scenario of testScenarios) {
    await runTest(scenario);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Multi-Phase Test Summary\n');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Scenarios: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms (${Math.round(totalDuration / 1000)}s)`);
  console.log(`📈 Average per scenario: ${Math.round(totalDuration / testResults.length)}ms`);
  
  if (failed > 0) {
    console.log('\nFailed Scenarios:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`- ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Architecture notes for future phases
  console.log('\n📝 Architecture Notes:');
  console.log('- Each scenario runs through multiple phases sequentially');
  console.log('- State is passed between phases (e.g., discovery → configuration)');
  console.log('- Easy to add new phases: just extend runMultiPhaseWorkflow()');
  console.log('- Validation phase would check node configs against MCP schemas');
  console.log('- Building phase would generate the final workflow JSON');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});