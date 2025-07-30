#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Set NODE_ENV to test for faster model
process.env.NODE_ENV = 'test';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import type { ValidationPhaseResult } from '../lib/workflow-orchestrator';

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

interface ValidationTestScenario {
  name: string;
  description: string;
  brokenWorkflow: any;
  expectedFixes: string[];
  validateResult: (result: ValidationPhaseResult) => void;
}

const testResults: TestResult[] = [];

// Helper to run and track tests
async function runTest(
  scenario: ValidationTestScenario,
  timeoutMs: number = 45000
): Promise<void> {
  console.log(`\n🧪 ${scenario.name}`);
  console.log(`   📝 ${scenario.description}`);
  const startTime = Date.now();
  
  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    const orchestrator = new WorkflowOrchestrator();
    const sessionId = 'test-validation-' + Date.now();
    
    // Run validation phase with the broken workflow
    const validationPromise = orchestrator.runValidationPhase(sessionId, {
      success: true,
      phase: 'building',
      workflow: scenario.brokenWorkflow
    });
    
    // Race between validation and timeout
    const result = await Promise.race([validationPromise, timeoutPromise]) as ValidationPhaseResult;
    
    // Log validation results
    console.log(`\n   📊 Validation Results:`);
    console.log(`   ✅ Valid: ${result.workflow?.valid || false}`);
    
    if (result.validationReport) {
      const report = result.validationReport;
      
      // Show initial errors
      if (report.initial) {
        console.log(`\n   🔍 Initial Validation:`);
        if (report.initial.workflow?.errors?.length > 0) {
          console.log(`   - Workflow errors: ${report.initial.workflow.errors.length}`);
          report.initial.workflow.errors.slice(0, 3).forEach((err: any) => {
            console.log(`     • ${err.message || err}`);
          });
        }
        if (report.initial.connections?.errors?.length > 0) {
          console.log(`   - Connection errors: ${report.initial.connections.errors.length}`);
          report.initial.connections.errors.slice(0, 3).forEach((err: any) => {
            console.log(`     • ${err.message || err}`);
          });
        }
        if (report.initial.expressions?.errors?.length > 0) {
          console.log(`   - Expression errors: ${report.initial.expressions.errors.length}`);
          report.initial.expressions.errors.slice(0, 3).forEach((err: any) => {
            console.log(`     • ${err.message || err}`);
          });
        }
      }
      
      // Show fixes applied
      if (report.fixesApplied?.length > 0) {
        console.log(`\n   🔧 Fixes Applied: ${report.fixesApplied.length}`);
        report.fixesApplied.forEach((fix: any, idx: number) => {
          console.log(`   ${idx + 1}. ${fix.type}: ${fix.description}`);
          if (fix.nodeId) {
            console.log(`      Node: ${fix.nodeId}`);
          }
        });
      }
      
      // Show final validation status
      if (report.final) {
        console.log(`\n   ✅ Final Validation:`);
        const finalErrors = [
          ...(report.final.workflow?.errors || []),
          ...(report.final.connections?.errors || []),
          ...(report.final.expressions?.errors || [])
        ];
        if (finalErrors.length === 0) {
          console.log(`   All validation passed! Workflow is production-ready.`);
        } else {
          console.log(`   ❌ Still has ${finalErrors.length} errors`);
        }
      }
    }
    
    // Show reasoning
    if (result.reasoning && result.reasoning.length > 0) {
      console.log(`\n   💭 Reasoning:`);
      result.reasoning.slice(0, 5).forEach((reason, idx) => {
        console.log(`   ${idx + 1}. ${reason}`);
      });
    }
    
    // Run scenario-specific validation
    scenario.validateResult(result);
    
    const duration = Date.now() - startTime;
    testResults.push({ name: scenario.name, passed: true, duration });
    console.log(`\n   ✅ Test passed (${duration}ms)`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    testResults.push({ name: scenario.name, passed: false, duration, error: errorMessage });
    console.log(`\n   ❌ Test failed: ${errorMessage}`);
  }
}

// Test scenarios

const testScenarios: ValidationTestScenario[] = [
  {
    name: 'Scenario 1: Missing Required Fields',
    description: 'Webhook missing path, HTTP Request missing URL, Slack missing channel',
    brokenWorkflow: {
      name: 'Test Workflow - Missing Fields',
      nodes: [
        {
          id: 'webhook_1',
          name: 'Webhook',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            // Missing required 'path' parameter
            httpMethod: 'POST',
            responseMode: 'onReceived'
          }
        },
        {
          id: 'http_1',
          name: 'HTTP Request',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 3,
          position: [450, 300],
          parameters: {
            // Missing required 'url' parameter
            method: 'GET',
            authentication: 'none'
          }
        },
        {
          id: 'slack_1',
          name: 'Slack',
          type: 'n8n-nodes-base.slack',
          typeVersion: 2,
          position: [650, 300],
          parameters: {
            resource: 'message',
            operation: 'send',
            // Missing channel configuration
            messageType: 'text',
            message: 'Test message'
          }
        }
      ],
      connections: {
        'Webhook': {
          main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
        },
        'HTTP Request': {
          main: [[{ node: 'Slack', type: 'main', index: 0 }]]
        }
      },
      settings: {
        executionOrder: 'v1'
      }
    },
    expectedFixes: [
      'Add webhook path',
      'Add HTTP Request URL',
      'Add Slack channel'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check fixes were applied
      const webhook = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.webhook');
      if (!webhook?.parameters?.path) {
        throw new Error('Webhook path not added');
      }
      
      const httpRequest = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.httpRequest');
      if (!httpRequest?.parameters?.url) {
        throw new Error('HTTP Request URL not added');
      }
      
      const slack = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.slack');
      console.log(`   📋 Slack parameters:`, JSON.stringify(slack?.parameters, null, 2));
      
      // Check based on operation type - MCP validation shows valid operations are: post, delete, getPermalink, search, sendAndWait, update
      if (slack?.parameters?.operation === 'post' || slack?.parameters?.operation === 'send') {
        // Both 'send' in the test and 'post' from MCP should have channel and text
        if (!slack.parameters.channel || !slack.parameters.text) {
          throw new Error('Slack channel or text not configured');
        }
      } else {
        // Default check for other operations
        if (!slack?.parameters?.channel && !slack?.parameters?.channelId) {
          throw new Error('Slack channel not configured');
        }
      }
      
      // Verify final validation passed
      if (!result.workflow.valid) {
        throw new Error('Workflow still invalid after fixes');
      }
    }
  },
  
  {
    name: 'Scenario 2: Invalid Expression Syntax',
    description: 'Various n8n expression syntax errors',
    brokenWorkflow: {
      name: 'Test Workflow - Expression Errors',
      nodes: [
        {
          id: 'webhook_1',
          name: 'Webhook Trigger',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            path: 'test-webhook',
            httpMethod: 'POST',
            responseMode: 'onReceived'
          }
        },
        {
          id: 'code_1',
          name: 'Transform Data',
          type: 'n8n-nodes-base.code',
          typeVersion: 1,
          position: [450, 300],
          parameters: {
            language: 'javaScript',
            // Invalid expression - missing .json
            code: `const data = $node["Webhook Trigger"];
return [{json: {result: data}}];`
          }
        },
        {
          id: 'slack_1',
          name: 'Send to Slack',
          type: 'n8n-nodes-base.slack',
          typeVersion: 2,
          position: [650, 300],
          parameters: {
            resource: 'message',
            operation: 'send',
            select: 'channel',
            channelId: 'general',
            messageType: 'text',
            // Invalid expression - $jsn instead of $json
            message: 'Data received: {{$jsn.result}}'
          }
        },
        {
          id: 'http_1',
          name: 'API Call with Spaces',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 3,
          position: [850, 300],
          parameters: {
            url: 'https://api.example.com/webhook',
            method: 'POST',
            // Invalid expression - node name with spaces needs quotes
            bodyParametersUi: {
              parameter: [{
                name: 'data',
                value: '={{$node[Transform Data].json.result}}'
              }]
            }
          }
        }
      ],
      connections: {
        'Webhook Trigger': {
          main: [[{ node: 'Transform Data', type: 'main', index: 0 }]]
        },
        'Transform Data': {
          main: [[{ node: 'Send to Slack', type: 'main', index: 0 }]]
        },
        'Send to Slack': {
          main: [[{ node: 'API Call with Spaces', type: 'main', index: 0 }]]
        }
      },
      settings: {
        executionOrder: 'v1'
      }
    },
    expectedFixes: [
      'Fix $node reference to include .json',
      'Fix $jsn to $json',
      'Add quotes to node names with spaces'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check expression fixes
      const code = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.code');
      if (!code?.parameters?.code?.includes('.json')) {
        throw new Error('Code node expression not fixed');
      }
      
      const slack = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.slack');
      if (!slack?.parameters?.message?.includes('$json')) {
        throw new Error('Slack expression not fixed');
      }
      
      const http = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.httpRequest');
      const bodyParam = http?.parameters?.bodyParametersUi?.parameter?.[0]?.value;
      if (!bodyParam?.includes('"Transform Data"')) {
        throw new Error('HTTP Request expression not fixed');
      }
      
      // Verify no expression errors remain
      const expressionErrors = result.validationReport?.final?.expressions?.errors || [];
      if (expressionErrors.length > 0) {
        throw new Error(`Still has ${expressionErrors.length} expression errors`);
      }
    }
  },
  
  {
    name: 'Scenario 3: Connection Issues',
    description: 'Orphaned nodes, missing trigger, circular dependencies',
    brokenWorkflow: {
      name: 'Test Workflow - Connection Issues',
      nodes: [
        // This workflow is missing a trigger node
        {
          id: 'http_1',
          name: 'HTTP Request',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 3,
          position: [250, 300],
          parameters: {
            url: 'https://api.example.com/data',
            method: 'GET'
          }
        },
        {
          id: 'code_1',
          name: 'Process Data',
          type: 'n8n-nodes-base.code',
          typeVersion: 1,
          position: [450, 300],
          parameters: {
            language: 'javaScript',
            code: 'return items;'
          }
        },
        {
          id: 'orphaned_1',
          name: 'Orphaned Node',
          type: 'n8n-nodes-base.slack',
          typeVersion: 2,
          position: [650, 100],
          parameters: {
            resource: 'message',
            operation: 'send',
            select: 'channel',
            channelId: 'general',
            message: 'This node is not connected'
          }
        },
        // Node referenced in connections but doesn't exist
      ],
      connections: {
        'HTTP Request': {
          main: [[{ node: 'Process Data', type: 'main', index: 0 }]]
        },
        'Process Data': {
          // Creates a circular dependency
          main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
        },
        // Reference to non-existent node
        'Missing Node': {
          main: [[{ node: 'Orphaned Node', type: 'main', index: 0 }]]
        }
      },
      settings: {
        executionOrder: 'v1'
      }
    },
    expectedFixes: [
      'Add trigger node',
      'Fix circular dependency',
      'Connect orphaned node',
      'Remove invalid connections'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check a trigger node was added
      const triggerNodes = result.workflow.nodes.filter((n: any) => 
        n.type.includes('webhook') || n.type.includes('schedule') || n.type.includes('trigger')
      );
      if (triggerNodes.length === 0) {
        throw new Error('No trigger node added');
      }
      
      // Check no orphaned nodes
      const connectionErrors = result.validationReport?.final?.connections?.errors || [];
      const orphanedErrors = connectionErrors.filter((e: any) => 
        e.message?.includes('orphaned') || e.message?.includes('unreachable')
      );
      if (orphanedErrors.length > 0) {
        throw new Error('Still has orphaned nodes');
      }
      
      // Check no circular dependencies
      const circularErrors = connectionErrors.filter((e: any) => 
        e.message?.includes('circular') || e.message?.includes('cycle')
      );
      if (circularErrors.length > 0) {
        throw new Error('Still has circular dependencies');
      }
      
      // Verify connections are valid
      if (!result.workflow.valid) {
        throw new Error('Workflow connections still invalid');
      }
    }
  },
  
  {
    name: 'Scenario 4: Mixed Issues',
    description: 'Workflow with configuration, expression, and connection errors',
    brokenWorkflow: {
      name: 'Test Workflow - Mixed Issues',
      nodes: [
        {
          id: 'schedule_1',
          name: 'Every Hour',
          type: 'n8n-nodes-base.scheduleTrigger',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            // Missing rule configuration
          }
        },
        {
          id: 'postgres_1',
          name: 'Get Data',
          type: 'n8n-nodes-base.postgres',
          typeVersion: 2,
          position: [450, 300],
          parameters: {
            operation: 'executeQuery',
            // Missing query
            // Invalid expression in query
            query: 'SELECT * FROM users WHERE created > {{$jsn.timestamp}}'
          }
        },
        {
          id: 'transform_1',
          name: 'Transform Results',
          type: 'n8n-nodes-base.code',
          typeVersion: 1,
          position: [650, 300],
          parameters: {
            language: 'javaScript',
            // Reference to wrong node name
            code: `const data = $node["Get User Data"].json;
return data.map(d => ({json: d}));`
          }
        },
        {
          id: 'gmail_1',
          name: 'Send Email',
          type: 'n8n-nodes-base.gmail',
          typeVersion: 2,
          position: [850, 300],
          parameters: {
            resource: 'message',
            operation: 'send',
            // Missing required fields
            subject: 'Daily Report',
            // Expression with multiple issues
            message: 'Found {{$node[Transform Results]}} users'
          }
        }
      ],
      connections: {
        'Every Hour': {
          main: [[{ node: 'Get Data', type: 'main', index: 0 }]]
        },
        'Get Data': {
          main: [[{ node: 'Transform Results', type: 'main', index: 0 }]]
        },
        // Missing connection from Transform Results to Send Email
      },
      settings: {
        // Missing workflow name
        executionOrder: 'v1'
      }
    },
    expectedFixes: [
      'Configure schedule trigger',
      'Fix Postgres query',
      'Fix expression syntax',
      'Update node references',
      'Add missing connections',
      'Add required email fields'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check all nodes are properly configured
      const schedule = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.scheduleTrigger');
      if (!schedule?.parameters?.rule) {
        throw new Error('Schedule trigger not configured');
      }
      
      const postgres = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.postgres');
      if (!postgres?.parameters?.query || postgres.parameters.query.includes('$jsn')) {
        throw new Error('Postgres query not fixed');
      }
      
      const gmail = result.workflow.nodes.find((n: any) => n.type === 'n8n-nodes-base.gmail');
      if (!gmail?.parameters?.to) {
        throw new Error('Gmail missing required fields');
      }
      
      // Check workflow is fully valid
      const finalErrors = [
        ...(result.validationReport?.final?.workflow?.errors || []),
        ...(result.validationReport?.final?.connections?.errors || []),
        ...(result.validationReport?.final?.expressions?.errors || [])
      ];
      if (finalErrors.length > 0) {
        throw new Error(`Workflow still has ${finalErrors.length} errors`);
      }
    }
  },
  
  {
    name: 'Scenario 5: AI Agent Workflow Issues',
    description: 'AI Agent node with missing tool connections',
    brokenWorkflow: {
      name: 'Test Workflow - AI Agent',
      nodes: [
        {
          id: 'webhook_1',
          name: 'Chat Webhook',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            path: 'chat',
            httpMethod: 'POST',
            responseMode: 'lastNode'
          }
        },
        {
          id: 'agent_1',
          name: 'AI Agent',
          type: '@n8n/n8n-nodes-langchain.agent',
          typeVersion: 1,
          position: [450, 300],
          parameters: {
            prompt: 'You are a helpful assistant',
            // Missing tools configuration
          }
        },
        {
          id: 'tool_1',
          name: 'Calculator Tool',
          type: '@n8n/n8n-nodes-langchain.toolCalculator',
          typeVersion: 1,
          position: [450, 100],
          parameters: {}
        },
        {
          id: 'respond_1',
          name: 'Respond to Webhook',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1,
          position: [650, 300],
          parameters: {
            respondWith: 'json',
            responseBody: '={{$json.output}}'
          }
        }
      ],
      connections: {
        'Chat Webhook': {
          main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
        },
        'AI Agent': {
          main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
        },
        // Tool connection is missing
      },
      settings: {
        executionOrder: 'v1'
      }
    },
    expectedFixes: [
      'Connect tool to AI Agent',
      'Configure AI Agent properly',
      'Fix tool connections'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check AI Agent is properly configured
      const agent = result.workflow.nodes.find((n: any) => n.type.includes('agent'));
      if (!agent) {
        throw new Error('AI Agent node not found');
      }
      
      // Check tool is connected
      const toolConnections = result.workflow.connections['Calculator Tool'];
      if (!toolConnections || !toolConnections.ai_tool) {
        throw new Error('Tool not connected to AI Agent');
      }
      
      // Verify workflow is valid
      if (!result.workflow.valid) {
        throw new Error('AI workflow still invalid');
      }
    }
  },
  
  {
    name: 'Scenario 6: Workflow Settings Issues',
    description: 'Missing workflow name and invalid settings',
    brokenWorkflow: {
      // Missing name
      nodes: [
        {
          id: 'webhook_1',
          name: 'Start',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            path: 'start',
            httpMethod: 'GET'
          }
        },
        {
          id: 'noOp_1',
          name: 'Do Nothing',
          type: 'n8n-nodes-base.noOp',
          typeVersion: 1,
          position: [450, 300],
          parameters: {}
        }
      ],
      connections: {
        'Start': {
          main: [[{ node: 'Do Nothing', type: 'main', index: 0 }]]
        }
      },
      settings: {
        // Invalid execution order
        executionOrder: 'invalid',
        // Invalid timezone
        timezone: 'Invalid/Timezone',
        // Other invalid settings
        saveDataSuccessExecution: 'yes' // Should be boolean
      }
    },
    expectedFixes: [
      'Add workflow name',
      'Fix execution order',
      'Fix timezone',
      'Fix boolean settings'
    ],
    validateResult: (result) => {
      if (!result.workflow) {
        throw new Error('No workflow returned');
      }
      
      // Check workflow has a name
      if (!result.workflow.name) {
        throw new Error('Workflow name not added');
      }
      
      // Check settings are valid
      const settings = result.workflow.settings;
      if (settings?.executionOrder && settings.executionOrder !== 'v1') {
        throw new Error('Invalid execution order not fixed');
      }
      
      if (settings?.saveDataSuccessExecution && typeof settings.saveDataSuccessExecution !== 'boolean') {
        throw new Error('Boolean setting not fixed');
      }
      
      // Verify workflow is valid
      if (!result.workflow.valid) {
        throw new Error('Workflow settings still invalid');
      }
    }
  }
];

// Main test runner
async function runAllTests() {
  console.log('🚀 Running Validation Phase Integration Tests\n');
  console.log('Testing workflow validation and automatic fixing with MCP tools\n');
  
  // Check environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  
  // Run test scenarios
  for (const scenario of testScenarios) {
    await runTest(scenario);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms (${Math.round(totalDuration / 1000)}s)`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`- ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Validation Phase Features Tested:');
  console.log('- ✅ Missing required field detection and fixing');
  console.log('- ✅ Expression syntax error correction');
  console.log('- ✅ Connection issue resolution');
  console.log('- ✅ Circular dependency detection');
  console.log('- ✅ Orphaned node handling');
  console.log('- ✅ AI Agent tool connection validation');
  console.log('- ✅ Workflow settings validation');
  console.log('- ✅ Comprehensive validation reporting');
  console.log('- ✅ Multi-tool MCP validation integration');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});