#!/usr/bin/env tsx

/**
 * Integration Test for Documentation Phase
 * 
 * Tests the new deterministic visual layout system:
 * 1. Phase-based node categorization (Triggers, Inputs, Transform, Outputs)
 * 2. Unified height calculation for consistent visuals
 * 3. Magazine-quality sticky note generation
 * 4. No Claude API needed - pure algorithmic approach
 * 5. Edge case handling (empty workflows, extreme positions, etc.)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { promises as fs } from 'fs';

// Load environment variables BEFORE any module imports (critical!)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n') || args.some(a => a.startsWith('--test='));
const shouldDeploy = args.includes('--deploy') || args.includes('-d');

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

// Test scenarios from simple to complex
const TEST_SCENARIOS = [
  // === SIMPLE WORKFLOWS ===
  {
    name: "Simple Linear - All Phases",
    prompt: "webhook → transform → output",
    workflow: {
      name: "[document test] - Simple Linear",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 200],
          parameters: {},
          category: "trigger"
        },
        {
          id: "http_1",
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [300, 200],
          parameters: {},
          category: "input"
        },
        {
          id: "code_1",
          name: "Code",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [500, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 200],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 4,
    expectedHeight: "unified",
    description: "Should create sticky notes for all 4 phases"
  },

  {
    name: "Single Node",
    prompt: "single webhook trigger",
    workflow: {
      name: "[document test] - Single Node",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [300, 300],
          parameters: {},
          category: "trigger"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 1,
    expectedHeight: "minimum",
    description: "Should handle single node workflow"
  },

  // === BRANCHING WORKFLOWS ===
  {
    name: "IF Branching",
    prompt: "webhook → if → multiple outputs",
    workflow: {
      name: "[document test] - IF Branching",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 300],
          parameters: {},
          category: "trigger"
        },
        {
          id: "if_1",
          name: "IF",
          type: "n8n-nodes-base.if",
          typeVersion: 1,
          position: [400, 300],
          parameters: {},
          category: "transform"
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 200],
          parameters: {},
          category: "output"
        },
        {
          id: "email_1",
          name: "Send Email",
          type: "n8n-nodes-base.emailSend",
          typeVersion: 2,
          position: [700, 400],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "adaptive",
    description: "Should handle branching with IF node"
  },

  {
    name: "Switch Multi-Branch",
    prompt: "switch with 4 branches",
    workflow: {
      name: "[document test] - Switch Multi-Branch",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 400],
          parameters: {},
          category: "trigger"
        },
        {
          id: "switch_1",
          name: "Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 1,
          position: [400, 400],
          parameters: {},
          category: "transform"
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 100],
          parameters: {},
          category: "output"
        },
        {
          id: "discord_1",
          name: "Discord",
          type: "n8n-nodes-base.discord",
          typeVersion: 1,
          position: [700, 300],
          parameters: {},
          category: "output"
        },
        {
          id: "telegram_1",
          name: "Telegram",
          type: "n8n-nodes-base.telegram",
          typeVersion: 1,
          position: [700, 500],
          parameters: {},
          category: "output"
        },
        {
          id: "email_1",
          name: "Send Email",
          type: "n8n-nodes-base.emailSend",
          typeVersion: 2,
          position: [700, 700],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "tall",
    description: "Should handle switch with multiple branches"
  },

  // === VERTICAL STACKING ===
  {
    name: "Vertical Stack - Multiple per Phase",
    prompt: "multiple nodes in each phase",
    workflow: {
      name: "[document test] - Vertical Stack",
      nodes: [
        // Multiple triggers
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 100],
          parameters: {},
          category: "trigger"
        },
        {
          id: "cron_1",
          name: "Cron",
          type: "n8n-nodes-base.cron",
          typeVersion: 1,
          position: [100, 250],
          parameters: {},
          category: "trigger"
        },
        {
          id: "mqtt_1",
          name: "MQTT Trigger",
          type: "n8n-nodes-base.mqttTrigger",
          typeVersion: 1,
          position: [100, 400],
          parameters: {},
          category: "trigger"
        },
        // Multiple transforms
        {
          id: "set_1",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [400, 100],
          parameters: {},
          category: "transform"
        },
        {
          id: "code_1",
          name: "Code",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [400, 250],
          parameters: {},
          category: "transform"
        },
        {
          id: "filter_1",
          name: "Filter",
          type: "n8n-nodes-base.filter",
          typeVersion: 1,
          position: [400, 400],
          parameters: {},
          category: "transform"
        },
        // Multiple outputs
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 100],
          parameters: {},
          category: "output"
        },
        {
          id: "discord_1",
          name: "Discord",
          type: "n8n-nodes-base.discord",
          typeVersion: 1,
          position: [700, 250],
          parameters: {},
          category: "output"
        },
        {
          id: "email_1",
          name: "Send Email",
          type: "n8n-nodes-base.emailSend",
          typeVersion: 2,
          position: [700, 400],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "tall",
    description: "Should calculate unified height for tall stacks"
  },

  // === SPECIAL TRANSFORM NODES ===
  {
    name: "Complex Transforms",
    prompt: "various transform node types",
    workflow: {
      name: "[document test] - Complex Transforms",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 300],
          parameters: {},
          category: "trigger"
        },
        // Special transform types
        {
          id: "if_1",
          name: "If",
          type: "n8n-nodes-base.if",
          typeVersion: 1,
          position: [300, 100],
          parameters: {},
          category: "transform"
        },
        {
          id: "switch_1",
          name: "Switch",
          type: "n8n-nodes-base.switch",
          typeVersion: 1,
          position: [300, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "loop_1",
          name: "Loop",
          type: "n8n-nodes-base.loop",
          typeVersion: 1,
          position: [300, 300],
          parameters: {},
          category: "transform"
        },
        {
          id: "merge_1",
          name: "Merge",
          type: "n8n-nodes-base.merge",
          typeVersion: 2,
          position: [300, 400],
          parameters: {},
          category: "transform"
        },
        {
          id: "split_1",
          name: "Split In Batches",
          type: "n8n-nodes-base.splitInBatches",
          typeVersion: 3,
          position: [300, 500],
          parameters: {},
          category: "transform"
        },
        {
          id: "aggregate_1",
          name: "Aggregate",
          type: "n8n-nodes-base.aggregate",
          typeVersion: 1,
          position: [500, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "wait_1",
          name: "Wait",
          type: "n8n-nodes-base.wait",
          typeVersion: 1,
          position: [500, 400],
          parameters: {},
          category: "transform"
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 300],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "tall",
    description: "Should recognize all special transform node types"
  },

  // === EDGE CASES ===
  {
    name: "Empty Workflow",
    prompt: "empty workflow",
    workflow: {
      name: "[document test] - Empty",
      nodes: [],
      connections: {},
      settings: {}
    },
    expectedPhases: 0,
    expectedHeight: "none",
    description: "Should handle empty workflow gracefully"
  },

  {
    name: "Transform Only",
    prompt: "only transform nodes",
    workflow: {
      name: "[document test] - Transform Only",
      nodes: [
        {
          id: "merge_1",
          name: "Merge",
          type: "n8n-nodes-base.merge",
          typeVersion: 2,
          position: [200, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "code_1",
          name: "Code",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [400, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "set_1",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [600, 200],
          parameters: {},
          category: "transform"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 1,
    expectedHeight: "minimum",
    description: "Should handle transform-only workflow (subworkflow pattern)"
  },

  {
    name: "Extreme Positions",
    prompt: "nodes at extreme coordinates",
    workflow: {
      name: "[document test] - Extreme Positions",
      nodes: [
        {
          id: "trigger_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [-500, -1000],
          parameters: {},
          category: "trigger"
        },
        {
          id: "transform_1",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [2000, 500],
          parameters: {},
          category: "transform"
        },
        {
          id: "output_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [5000, 3000],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "extreme",
    description: "Should handle extreme node positions"
  },

  {
    name: "Dense Overlapping",
    prompt: "overlapping nodes",
    workflow: {
      name: "[document test] - Dense Overlapping",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 200],
          parameters: {},
          category: "trigger"
        },
        // Cluster of overlapping transforms
        {
          id: "set_1",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [400, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "set_2",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [410, 205],
          parameters: {},
          category: "transform"
        },
        {
          id: "code_1",
          name: "Code",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [405, 195],
          parameters: {},
          category: "transform"
        },
        {
          id: "filter_1",
          name: "Filter",
          type: "n8n-nodes-base.filter",
          typeVersion: 1,
          position: [395, 200],
          parameters: {},
          category: "transform"
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 200],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "minimum",
    description: "Should handle overlapping node positions"
  },

  {
    name: "Uncategorized Nodes",
    prompt: "nodes without categories",
    workflow: {
      name: "[document test] - Uncategorized",
      nodes: [
        {
          id: "webhook_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [100, 200],
          parameters: {},
          category: "trigger"
        },
        {
          id: "custom_1",
          name: "Custom Node",
          type: "custom.unknownNode",
          typeVersion: 1,
          position: [400, 200],
          parameters: {}
          // No category - should fallback to transform
        },
        {
          id: "another_1",
          name: "Another Custom",
          type: "another.customNode",
          typeVersion: 1,
          position: [400, 400],
          parameters: {}
          // No category
        },
        {
          id: "slack_1",
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [700, 200],
          parameters: {},
          category: "output"
        }
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 3,
    expectedHeight: "adaptive",
    description: "Should fallback uncategorized nodes to transform"
  },

  // === MAXIMUM COMPLEXITY ===
  {
    name: "Maximum Complexity",
    prompt: "50+ nodes across all phases",
    workflow: {
      name: "[document test] - Maximum Complexity",
      nodes: [
        // Create a complex workflow with many nodes
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `trigger_${i}`,
          name: `${["Webhook", "Cron", "MQTT Trigger"][i % 3]} ${Math.floor(i / 3) + 1}`,
          type: ["n8n-nodes-base.webhook", "n8n-nodes-base.cron", "n8n-nodes-base.mqttTrigger"][i % 3],
          typeVersion: 1,
          position: [100, 100 + i * 80] as [number, number],
          parameters: {},
          category: "trigger" as const
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `input_${i}`,
          name: `HTTP Request ${i + 1}`,
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [300, 200 + i * 100] as [number, number],
          parameters: {},
          category: "input" as const
        })),
        ...Array.from({ length: 25 }, (_, i) => ({
          id: `transform_${i}`,
          name: `${["Set", "Code", "IF", "Merge", "Switch"][i % 5]} ${Math.floor(i / 5) + 1}`,
          type: ["n8n-nodes-base.set", "n8n-nodes-base.code", "n8n-nodes-base.if", "n8n-nodes-base.merge", "n8n-nodes-base.switch"][i % 5],
          typeVersion: [3, 2, 1, 2, 1][i % 5],
          position: [500 + (i % 5) * 100, 100 + Math.floor(i / 5) * 100] as [number, number],
          parameters: {},
          category: "transform" as const
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `output_${i}`,
          name: `${["Slack", "Send Email", "Discord", "Postgres"][i % 4]} ${Math.floor(i / 4) + 1}`,
          type: ["n8n-nodes-base.slack", "n8n-nodes-base.emailSend", "n8n-nodes-base.discord", "n8n-nodes-base.postgres"][i % 4],
          typeVersion: [2, 2, 1, 2][i % 4],
          position: [1200, 100 + i * 80] as [number, number],
          parameters: {},
          category: "output" as const
        }))
      ],
      connections: {},
      settings: {}
    },
    expectedPhases: 4,
    expectedHeight: "extreme",
    description: "Should handle 50+ nodes with unified height"
  }
];

// Helper to save workflow for n8n import
async function saveWorkflowToFile(workflow: any, testName: string): Promise<string> {
  const outputDir = path.join(process.cwd(), "tests", "document-test-outputs");
  await fs.mkdir(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${testName.toLowerCase().replace(/\s+/g, "-")}-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);
  
  await fs.writeFile(filepath, JSON.stringify(workflow, null, 2));
  return filename;
}

/**
 * Deploy workflow to n8n instance using MCP tool
 */
async function deployWorkflow(workflow: any, name: string, mcpClient?: any): Promise<{ success: boolean; id?: string; error?: any }> {
  try {
    // Remove metadata before deployment
    const deployableWorkflow = { ...workflow };
    delete deployableWorkflow.__metadata;
    delete deployableWorkflow.meta; // Also remove test metadata
    
    if (!mcpClient) {
      console.log(chalk.yellow('      ⚠️ MCP client not available for deployment'));
      return { success: false, error: 'MCP client not available' };
    }

    console.log(chalk.gray('      🚀 Deploying to n8n...'));
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
      const baseUrl = process.env.N8N_API_URL || 'https://app.n8n.cloud';
      const uiUrl = baseUrl.replace('/api/v1', '').replace('/api', '');
      console.log(chalk.green(`      ✅ Deployed! ID: ${workflowId}`));
      console.log(chalk.blue(`      🔗 URL: ${uiUrl}/workflow/${workflowId}`));
      return { success: true, id: workflowId };
    } else {
      // If we don't get an ID back, it likely didn't actually deploy
      console.log(chalk.yellow(`      ⚠️ Deployment returned no workflow ID`));
      console.log(chalk.gray(`         Response: ${JSON.stringify(result.content)}`));
      return { success: false, error: 'No workflow ID returned' };
    }
    
  } catch (error) {
    console.log(chalk.red(`      ❌ Deployment failed: ${error}`));
    return { success: false, error };
  }
}

class DocumentationIntegrationTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    console.log(chalk.yellow('📝 Testing deterministic documentation phase (no Claude API needed)\n'));
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    
    try {
      // Create orchestrator
      this.orchestrator = new WorkflowOrchestrator();
      console.log(chalk.green('✅ Test environment ready\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize test environment:'), error);
      throw error;
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log(chalk.gray(`   Nodes: ${scenario.workflow.nodes.length}, Expected phases: ${scenario.expectedPhases}`));
    
    const sessionId = `test_doc_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Try to load the fixed workflow if it exists
      let workflowToUse = scenario.workflow;
      const fixedWorkflowPath = path.join(
        process.cwd(), 
        'tests', 
        'document-test-outputs', 
        'fixed',
        `${scenario.name.toLowerCase().replace(/\s+/g, '-')}-fixed.json`
      );
      
      try {
        const fixedWorkflowContent = await fs.readFile(fixedWorkflowPath, 'utf-8');
        const fixedWorkflow = JSON.parse(fixedWorkflowContent);
        console.log(chalk.gray(`   📁 Using fixed workflow with ${Object.keys(fixedWorkflow.connections || {}).length} connections`));
        workflowToUse = fixedWorkflow;
      } catch (err) {
        console.log(chalk.yellow(`   ⚠️ No fixed workflow found, using original`));
      }
      
      // Set up session as if validation phase completed
      await this.orchestrator.sessionRepo.initialize(sessionId, scenario.prompt);
      
      // Set the validated workflow in session state
      const operations = [
        { type: 'setWorkflow', workflow: workflowToUse },
        { type: 'completePhase', phase: 'validation' }
      ];
      
      await this.orchestrator.sessionRepo.persistOperations(sessionId, operations);
      await this.orchestrator.sessionRepo.save(sessionId);
      
      // Run documentation phase
      const result = await this.orchestrator.runDocumentationPhase(sessionId);
      const duration = Date.now() - startTime;
      
      // Validate results
      let testFailed = false;
      let failureReasons = [];
      
      if (!result.success) {
        failureReasons.push(`Documentation failed: ${result.error?.message}`);
        testFailed = true;
      }
      
      // Count sticky notes created
      const stickyNotes = result.workflow?.nodes?.filter(
        (n: any) => n.type === "n8n-nodes-base.stickyNote"
      ) || [];
      
      if (stickyNotes.length !== scenario.expectedPhases) {
        failureReasons.push(`Expected ${scenario.expectedPhases} sticky notes, got ${stickyNotes.length}`);
        testFailed = true;
      }
      
      // Verify unified height (all sticky notes should have same height)
      if (stickyNotes.length > 1) {
        const heights = stickyNotes.map((n: any) => n.parameters.height);
        const uniqueHeights = new Set(heights);
        if (uniqueHeights.size > 1) {
          failureReasons.push(`Height not unified: found ${uniqueHeights.size} different heights`);
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
      
      console.log(chalk.gray(`      Sticky notes created: ${stickyNotes.length}`));
      
      if (stickyNotes.length > 0) {
        const heights = stickyNotes.map((n: any) => n.parameters.height);
        const unifiedHeight = heights[0];
        console.log(chalk.gray(`      Unified height: ${unifiedHeight}px`));
        
        // Show phase breakdown
        const phases = stickyNotes.map((n: any) => {
          const content = n.parameters.content;
          if (content.includes('Triggers')) return 'Triggers';
          if (content.includes('Inputs')) return 'Inputs';
          if (content.includes('Transform')) return 'Transform';
          if (content.includes('Outputs')) return 'Outputs';
          return 'Unknown';
        });
        console.log(chalk.gray(`      Phases: ${phases.join(', ')}`));
      }
      
      // Save workflow for n8n import
      const filename = await saveWorkflowToFile(result.workflow, scenario.name);
      console.log(chalk.blue(`      📁 Saved: ${filename}`));
      
      // Deploy to n8n if requested
      if (shouldDeploy && result.workflow) {
        const mcpClient = this.orchestrator.mcpClient || this.orchestrator.getMCPClient?.();
        const deployResult = await deployWorkflow(result.workflow, scenario.name, mcpClient);
        
        if (!deployResult.success && deployResult.error) {
          console.log(chalk.gray(`         Deployment issue: ${deployResult.error}`));
        }
      }
      
      // Show verbose details if requested
      if (isVerbose && stickyNotes.length > 0) {
        console.log(chalk.gray('\n   Sticky note details:'));
        stickyNotes.forEach((sticky: any, i: number) => {
          console.log(chalk.gray(`      ${i + 1}. Position: [${sticky.position}]`));
          console.log(chalk.gray(`         Size: ${sticky.parameters.width}x${sticky.parameters.height}`));
          console.log(chalk.gray(`         Color: ${sticky.parameters.color}`));
        });
      }
      
      // Return test result
      if (testFailed) {
        return { 
          success: false, 
          duration, 
          error: new Error(failureReasons.join('; ')),
          result 
        };
      }
      
      return { success: true, duration, result };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Documentation Phase Integration Tests\n'));
    console.log(chalk.gray('Testing deterministic visual layout system...'));
    console.log(chalk.gray('Features: Phase categorization, unified heights, magazine-quality layouts\n'));
    
    await this.setup();
    
    const results: any[] = [];
    const testArg = args.find(a => a.startsWith('--test='));
    const scenarios = testArg
      ? TEST_SCENARIOS.filter(s => s.name === testArg.split('=')[1])
      : TEST_SCENARIOS;
    
    // Check if no scenarios were found
    if (testArg && scenarios.length === 0) {
      console.log(chalk.red(`\n❌ No test found with name: "${testArg.split('=')[1]}"`));
      console.log(chalk.yellow('\nAvailable tests:'));
      TEST_SCENARIOS.forEach(s => {
        console.log(chalk.gray(`  - ${s.name}`));
      });
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
    
    // Close readline interface
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
    
    // Group results by test type
    console.log(chalk.gray('\n   Test categories:'));
    const simple = results.filter(r => r.scenario.includes('Simple') || r.scenario.includes('Single'));
    const branching = results.filter(r => r.scenario.includes('Branch') || r.scenario.includes('IF') || r.scenario.includes('Switch'));
    const complex = results.filter(r => r.scenario.includes('Complex') || r.scenario.includes('Maximum'));
    const edge = results.filter(r => r.scenario.includes('Empty') || r.scenario.includes('Extreme') || r.scenario.includes('Uncategorized'));
    
    if (simple.length > 0) {
      console.log(chalk.gray(`      Simple workflows: ${simple.filter(r => r.success).length}/${simple.length} passed`));
    }
    if (branching.length > 0) {
      console.log(chalk.gray(`      Branching workflows: ${branching.filter(r => r.success).length}/${branching.length} passed`));
    }
    if (complex.length > 0) {
      console.log(chalk.gray(`      Complex workflows: ${complex.filter(r => r.success).length}/${complex.length} passed`));
    }
    if (edge.length > 0) {
      console.log(chalk.gray(`      Edge cases: ${edge.filter(r => r.success).length}/${edge.length} passed`));
    }
    
    console.log(chalk.blue(`\n   📁 Output files saved to: tests/document-test-outputs/`));
    if (shouldDeploy) {
      console.log(chalk.gray(`      Workflows deployed to n8n (check URLs above)}`));
    } else {
      console.log(chalk.gray(`      Import these JSON files into n8n to view the visual layouts`));
      console.log(chalk.gray(`      Or use --deploy flag to automatically deploy them`));
    }
    
    return passed === results.length - skipped;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Documentation Phase Integration Test')}

${chalk.gray('Usage:')} npm run test:document [options]

${chalk.gray('Options:')}
  --verbose, -v     Show detailed output
  --no-prompt, -n   Skip interactive prompts
  --test=NAME       Run only specific test
  --deploy, -d      Deploy workflows to n8n after generation
  --help, -h        Show this help message

${chalk.gray('Examples:')}
  npm run test:document
  npm run test:document --verbose
  npm run test:document --test="Simple Linear"
  npm run test:document --deploy
  npm run test:document --deploy --no-prompt

${chalk.gray('Features Tested:')}
  - Phase-based categorization (Triggers, Inputs, Transform, Outputs)
  - Unified height calculation for consistent visuals
  - Deterministic sticky note generation (no Claude API)
  - Edge case handling (empty, extreme positions, etc.)
  - Magazine-quality visual layouts

${chalk.gray('Output:')}
  JSON files are saved to tests/document-test-outputs/
  Import them into n8n to view the visual workflows
`);
    process.exit(0);
  }
  
  try {
    const test = new DocumentationIntegrationTest();
    const success = await test.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close();
    process.exit(1);
  });
}

export { DocumentationIntegrationTest, TEST_SCENARIOS };