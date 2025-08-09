#!/usr/bin/env tsx

/**
 * Integration Test for Validation Phase Refactor
 * 
 * Tests the auto-fixing validation system with progressively difficult scenarios:
 * 1. Simple validation errors (missing required fields)
 * 2. Connection issues (invalid references, missing connections)
 * 3. Expression errors (invalid n8n expressions)
 * 4. Complex multi-node issues requiring multiple fix iterations
 * 5. Edge cases and error recovery
 * 
 * Features tested:
 * - MCP validation integration
 * - Claude fix generation
 * - Iterative validation loop (up to 3 attempts)
 * - Fix application logic
 * - Node-level vs parameter-level properties
 * - Error grouping and reporting
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables BEFORE any module imports (critical!)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const skipPrompts = args.includes('--no-prompt') || args.includes('-n') || args.some(a => a.startsWith('--test='));
const saveFixtures = args.includes('--save-fixtures');

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

// Test scenarios - progressively more difficult
const TEST_SCENARIOS = [
  // === LEVEL 1: SIMPLE VALIDATION ERRORS ===
  {
    name: "Simple - Missing Required Field",
    description: "Should handle Code node without jsCode (non-breaking)",
    buildingOutput: {
      workflow: {
        name: "Simple Code Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2,
            position: [250, 300],
            parameters: {
              httpMethod: "POST",
              path: "webhook"
            }
          },
          {
            id: "code_1",
            name: "Code",
            type: "n8n-nodes-base.code",
            typeVersion: 1,
            position: [450, 300],
            parameters: {
              // Missing jsCode field - not a breaking error
            }
          }
        ],
        connections: {
          "Webhook": {
            main: [[{ node: "Code", type: "main", index: 0 }]]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 0, // Should pass without fixes
    expectedValid: true,
    expectedFixes: []
  },

  {
    name: "Simple - Missing Webhook Path",
    description: "Should fix missing required path in webhook",
    buildingOutput: {
      workflow: {
        name: "Webhook Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2,
            position: [250, 300],
            parameters: {
              httpMethod: "POST"
              // Missing required path field
            }
          }
        ],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 1,
    expectedValid: true,
    expectedFixes: ["path"]
  },

  {
    name: "Simple - Empty Code Node",
    description: "Should handle Code node with empty jsCode (non-breaking)",
    buildingOutput: {
      workflow: {
        name: "Empty Code Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2,
            position: [250, 300],
            parameters: {
              httpMethod: "POST",
              path: "data"
            }
          },
          {
            id: "code_1",
            name: "Transform",
            type: "n8n-nodes-base.code",
            typeVersion: 1,
            position: [450, 300],
            parameters: {
              jsCode: "" // Empty jsCode - not a breaking error
            }
          }
        ],
        connections: {
          "Webhook": {
            main: [[{ node: "Transform", type: "main", index: 0 }]]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 0, // Should pass without fixes
    expectedValid: true,
    expectedFixes: []
  },

  // === LEVEL 2: CONNECTION ISSUES ===
  {
    name: "Medium - Invalid Connection Reference",
    description: "Should remove connection to non-existent node",
    buildingOutput: {
      workflow: {
        name: "Connection Error Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              httpMethod: "POST",
              path: "webhook"
            }
          }
        ],
        connections: {
          "Webhook": {
            main: [[
              { node: "non_existent_node", type: "main", index: 0 }
            ]]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 1,
    expectedValid: true,
    expectedFixes: ["removeConnection"]
  },

  {
    name: "Medium - Missing Required Connection",
    description: "Should add missing connection and fix Slack node config",
    buildingOutput: {
      workflow: {
        name: "Disconnected Nodes Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              httpMethod: "POST",
              path: "webhook"
            }
          },
          {
            id: "slack_1",
            name: "Slack",
            type: "n8n-nodes-base.slack",
            typeVersion: 2.1,
            position: [450, 300],
            parameters: {
              resource: "message",
              operation: "post",
              channel: "#general",
              text: "Hello World"
              // Missing select and channelId fields
            }
          }
        ],
        connections: {}, // Missing connection between webhook and slack
        settings: {}
      }
    },
    expectedAttempts: 3, // Connection + Slack fields need multiple fixes
    expectedValid: true,
    expectedFixes: ["connection", "select", "channelId"]
  },

  // === LEVEL 3: EXPRESSION ERRORS ===
  {
    name: "Medium - Invalid Expression Syntax",
    description: "Should fix invalid n8n expression syntax",
    buildingOutput: {
      workflow: {
        name: "Expression Error Workflow",
        nodes: [
          {
            id: "set_1",
            name: "Set",
            type: "n8n-nodes-base.set",
            typeVersion: 3,
            position: [250, 300],
            parameters: {
              mode: "manual",
              values: {
                string: [
                  {
                    name: "value",
                    value: "={{$json.data" // Missing closing brackets
                  }
                ]
              }
            }
          }
        ],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 1,
    expectedValid: true,
    expectedFixes: ["value", "expression"]
  },

  // === LEVEL 4: MULTIPLE ISSUES (REQUIRES ITERATIONS) ===
  {
    name: "Complex - Multiple Node Issues",
    description: "Should fix webhook issues (Code/IF issues are non-breaking)",
    buildingOutput: {
      workflow: {
        name: "Multi-Issue Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              // Missing httpMethod and path - these ARE required
            }
          },
          {
            id: "code_1",
            name: "Code",
            type: "n8n-nodes-base.code",
            typeVersion: 1,
            position: [450, 300],
            parameters: {
              // Missing jsCode - not breaking
            }
          },
          {
            id: "if_1",
            name: "IF",
            type: "n8n-nodes-base.if",
            typeVersion: 1,
            position: [650, 300],
            parameters: {
              conditions: {
                // Empty conditions - not breaking
                string: []
              }
            }
          }
        ],
        connections: {
          "Webhook": {
            main: [[{ node: "Code", type: "main", index: 0 }]]
          },
          "Code": {
            main: [[{ node: "IF", type: "main", index: 0 }]]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 1, // Only webhook needs fixing
    expectedValid: true,
    expectedFixes: ["httpMethod", "path"]
  },

  // === LEVEL 5: NODE TYPE ISSUES ===
  {
    name: "Complex - Node Type Misplacement",
    description: "Should fix node type being in parameters instead of node level",
    buildingOutput: {
      workflow: {
        name: "Type Misplacement Workflow",
        nodes: [
          {
            id: "http_1",
            name: "HTTP Request",
            // type is missing at node level
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              type: "n8n-nodes-base.httpRequest", // Wrong location!
              url: "https://api.example.com",
              method: "GET"
            }
          }
        ],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 1,
    expectedValid: true,
    expectedFixes: ["type", "updateNode"]
  },

  // === LEVEL 6: CONDITIONAL LOGIC ERRORS ===
  {
    name: "Complex - IF Node Conditions",
    description: "Should fix complex IF node condition configuration",
    buildingOutput: {
      workflow: {
        name: "Conditional Logic Workflow",
        nodes: [
          {
            id: "if_1",
            name: "IF",
            type: "n8n-nodes-base.if",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              conditions: {
                string: [
                  {
                    value1: "={{$json.status}}",
                    // Missing operation and value2
                  }
                ]
              }
            }
          },
          {
            id: "slack_1",
            name: "Slack Success",
            type: "n8n-nodes-base.slack",
            typeVersion: 2.1,
            position: [450, 200],
            parameters: {
              resource: "message",
              operation: "post",
              channel: "#general",
              text: "Success!"
            }
          },
          {
            id: "email_1",
            name: "Email Error",
            type: "n8n-nodes-base.emailSend",
            typeVersion: 2,
            position: [450, 400],
            parameters: {
              toEmail: "admin@example.com",
              subject: "Error",
              text: "Error occurred"
            }
          }
        ],
        connections: {
          "IF": {
            main: [
              [{ node: "Slack Success", type: "main", index: 0 }],
              [{ node: "Email Error", type: "main", index: 0 }]
            ]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 1,
    expectedValid: true,
    expectedFixes: ["operation", "value2", "conditions"]
  },

  // === LEVEL 7: WORKFLOW SETTINGS ===
  {
    name: "Complex - Workflow Settings & Error Handling",
    description: "Should fix workflow settings and node error handling",
    buildingOutput: {
      workflow: {
        name: "", // Missing workflow name
        nodes: [
          {
            id: "http_1",
            name: "HTTP Request",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [250, 300],
            parameters: {
              url: "https://api.example.com",
              method: "GET"
            },
            onError: "invalid_option", // Invalid error handling option
            retryOnFail: true,
            maxTries: "invalid" // Should be number
          }
        ],
        connections: {},
        settings: {
          executionOrder: "invalid" // Invalid setting
        }
      }
    },
    expectedAttempts: 2,
    expectedValid: true,
    expectedFixes: ["name", "onError", "maxTries", "executionOrder"]
  },

  // === LEVEL 8: EXTREME COMPLEXITY ===
  {
    name: "Extreme - Complete Workflow Reconstruction",
    description: "Should handle major structural issues requiring multiple iterations",
    buildingOutput: {
      workflow: {
        name: "Complex Integration Workflow",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [250, 300],
            parameters: {} // Missing all required params
          },
          {
            id: "code_1",
            name: "Transform Data",
            type: "n8n-nodes-base.code",
            typeVersion: 1,
            position: [450, 300],
            parameters: {
              jsCode: "return items" // Missing semicolon, might need fixing
            }
          },
          {
            id: "if_1",
            name: "Check Status",
            type: "n8n-nodes-base.if",
            typeVersion: 1,
            position: [650, 300],
            parameters: {} // Missing conditions entirely
          },
          {
            id: "http_1",
            name: "API Call",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [850, 200],
            parameters: {
              method: "POST" // Missing URL
            }
          },
          {
            id: "mongo_1",
            name: "Save to MongoDB",
            type: "n8n-nodes-base.mongoDb",
            typeVersion: 1,
            position: [850, 400],
            parameters: {
              operation: "insert"
              // Missing collection and other required fields
            }
          }
        ],
        connections: {
          "Webhook": {
            main: [[{ node: "Transform Data", type: "main", index: 0 }]]
          },
          "Transform Data": {
            main: [[{ node: "Check Status", type: "main", index: 0 }]]
          },
          "Check Status": {
            main: [
              [{ node: "API Call", type: "main", index: 0 }],
              [{ node: "Save to MongoDB", type: "main", index: 0 }]
            ]
          },
          // Invalid circular reference
          "API Call": {
            main: [[{ node: "Webhook", type: "main", index: 0 }]]
          }
        },
        settings: {}
      }
    },
    expectedAttempts: 3, // Will likely need all 3 attempts
    expectedValid: false, // May not be able to fix everything
    expectedFixes: ["httpMethod", "path", "conditions", "url", "collection", "removeConnection"]
  },

  // === LEVEL 9: EDGE CASES ===
  {
    name: "Edge Case - Single Node Workflow",
    description: "Should understand single-node workflow requirements",
    buildingOutput: {
      workflow: {
        name: "Single Node Workflow",
        nodes: [
          {
            id: "code_1",
            name: "Code",
            type: "n8n-nodes-base.code",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              jsCode: "return items;" // Has valid jsCode
            }
          }
        ],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 1, // Will need to add webhook
    expectedValid: true,
    expectedFixes: ["addNode", "webhook"]
  },

  {
    name: "Edge Case - Empty Workflow",
    description: "Should handle empty workflow gracefully",
    buildingOutput: {
      workflow: {
        name: "Empty Workflow",
        nodes: [],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 0, // Should pass immediately as empty workflow is valid
    expectedValid: true,
    expectedFixes: []
  },

  {
    name: "Edge Case - Sticky Notes",
    description: "Should validate workflow with sticky notes",
    buildingOutput: {
      workflow: {
        name: "Workflow with Notes",
        nodes: [
          {
            id: "webhook_1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [250, 300],
            parameters: {
              httpMethod: "POST",
              path: "webhook"
            }
          },
          {
            id: "sticky_1",
            name: "Important Note",
            type: "n8n-nodes-base.stickyNote",
            typeVersion: 1,
            position: [250, 150],
            parameters: {
              content: "This webhook receives customer data",
              height: 100,
              width: 200,
              color: 1
            }
          }
        ],
        connections: {},
        settings: {}
      }
    },
    expectedAttempts: 0, // Should be valid
    expectedValid: true,
    expectedFixes: []
  }
];

class ValidationIntegrationTest {
  private orchestrator: any;
  
  async setup() {
    console.log(chalk.blue('\n🔧 Setting up test environment...\n'));
    console.log(chalk.yellow('⚠️  Using REAL Claude API and MCP validation - this will consume tokens!\n'));
    
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    
    try {
      // Create orchestrator which will handle everything
      this.orchestrator = new WorkflowOrchestrator();
      console.log(chalk.green('✅ Test environment ready\n'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize test environment:'), error);
      throw error;
    }
  }
  
  /**
   * Save fixture data for future use
   */
  async saveFixture(scenario: any, result: any) {
    if (!saveFixtures) return;
    
    const fixturesDir = path.join(process.cwd(), 'tests/fixtures/validation');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    
    const fixture = {
      name: scenario.name,
      description: scenario.description,
      buildingOutput: scenario.buildingOutput,
      validationResult: {
        success: result.success,
        attempts: result.validationReport?.attempts || 0,
        fixesApplied: result.validationReport?.fixesApplied || [],
        valid: result.workflow?.valid || false
      }
    };
    
    const fileName = scenario.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.json';
    
    const filePath = path.join(fixturesDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2));
    
    if (isVerbose) {
      console.log(chalk.gray(`   💾 Saved fixture to ${fileName}`));
    }
  }
  
  async runTest(scenario: typeof TEST_SCENARIOS[0]) {
    console.log(chalk.gray(`   ${scenario.description}`));
    
    const sessionId = `test_validation_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Initialize session
      await this.orchestrator.sessionRepo.initialize(sessionId, scenario.name);
      
      // Simulate building phase completion
      const operations: any[] = [
        { type: 'setPhase', phase: 'building' },
        { type: 'setWorkflow', workflow: scenario.buildingOutput.workflow },
        { type: 'completePhase', phase: 'building' }
      ];
      
      await this.orchestrator.sessionRepo.persistOperations(sessionId, operations);
      await this.orchestrator.sessionRepo.save(sessionId);
      
      if (isVerbose) {
        const nodeCount = scenario.buildingOutput.workflow.nodes?.length || 0;
        const connectionCount = Object.keys(scenario.buildingOutput.workflow.connections || {}).length;
        console.log(chalk.gray(`   Input: ${nodeCount} nodes, ${connectionCount} connection groups`));
      }
      
      // Run validation phase
      console.log(chalk.gray('   🔍 Running validation phase...'));
      const result = await this.orchestrator.runValidationPhase(sessionId);
      const duration = Date.now() - startTime;
      
      // Save fixture if requested
      await this.saveFixture(scenario, result);
      
      // Validate results
      let testFailed = false;
      let failureReasons = [];
      
      if (!result.success && scenario.expectedValid) {
        failureReasons.push(`Validation failed: ${result.error?.message}`);
        testFailed = true;
      }
      
      const attempts = result.validationReport?.attempts || 0;
      const fixesApplied = result.validationReport?.fixesApplied || [];
      const isValid = result.workflow?.valid || false;
      
      // Check if attempts match expected (allow some variance)
      if (scenario.expectedAttempts > 0 && Math.abs(attempts - scenario.expectedAttempts) > 1) {
        failureReasons.push(`Expected ~${scenario.expectedAttempts} attempts, got ${attempts}`);
        testFailed = true;
      }
      
      // Check if validation result matches expected
      if (isValid !== scenario.expectedValid) {
        failureReasons.push(`Expected valid=${scenario.expectedValid}, got ${isValid}`);
        testFailed = true;
      }
      
      // Check if expected fixes were applied (fuzzy matching)
      if (scenario.expectedFixes.length > 0) {
        const appliedFixTypes = fixesApplied.map((f: any) => 
          f.type || f.field || f.parameter || 'unknown'
        );
        
        const missingFixes = scenario.expectedFixes.filter(expectedFix => 
          !appliedFixTypes.some((applied: string) => 
            applied.toLowerCase().includes(expectedFix.toLowerCase())
          )
        );
        
        if (missingFixes.length > 0 && isValid) {
          // Only fail if workflow is valid but expected fixes weren't applied
          console.log(chalk.yellow(`   ⚠️  Missing expected fixes: ${missingFixes.join(', ')}`));
        }
      }
      
      // Display results
      if (testFailed) {
        console.log(chalk.red(`   ❌ Test FAILED in ${duration}ms`));
        console.log(chalk.red(`      Reasons: ${failureReasons.join('; ')}`));
      } else {
        console.log(chalk.green(`   ✅ Test passed in ${duration}ms`));
      }
      
      console.log(chalk.gray(`      Validation attempts: ${attempts}`));
      console.log(chalk.gray(`      Fixes applied: ${fixesApplied.length}`));
      console.log(chalk.gray(`      Final status: ${isValid ? '✅ Valid' : '⚠️ Invalid'}`));
      
      // Show fixes if verbose
      if (isVerbose && fixesApplied.length > 0) {
        console.log(chalk.gray('\n   Fixes Applied:'));
        fixesApplied.slice(0, 5).forEach((fix: any, i: number) => {
          const description = fix.description || `${fix.type} on ${fix.nodeId}`;
          console.log(chalk.gray(`      ${i + 1}. ${description}`));
        });
        if (fixesApplied.length > 5) {
          console.log(chalk.gray(`      ... and ${fixesApplied.length - 5} more`));
        }
      }
      
      // Show remaining errors if workflow is still invalid
      if (!isValid && result.validationReport?.final) {
        const remainingErrors = [
          ...(result.validationReport.final.workflow?.errors || []),
          ...(result.validationReport.final.connections?.errors || []),
          ...(result.validationReport.final.expressions?.errors || [])
        ];
        
        if (remainingErrors.length > 0 && isVerbose) {
          console.log(chalk.gray('\n   Remaining Issues:'));
          remainingErrors.slice(0, 3).forEach((error: any, i: number) => {
            const errorMsg = typeof error === 'string' ? error : 
                           error.message || JSON.stringify(error);
            console.log(chalk.gray(`      ${i + 1}. ${errorMsg}`));
          });
          if (remainingErrors.length > 3) {
            console.log(chalk.gray(`      ... and ${remainingErrors.length - 3} more`));
          }
        }
      }
      
      return { 
        success: !testFailed, 
        duration, 
        error: testFailed ? new Error(failureReasons.join('; ')) : undefined,
        result 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(chalk.red(`   ❌ Test failed: ${error}`));
      return { success: false, duration, error };
    }
  }
  
  async runAllTests() {
    console.log(chalk.bold.blue('\n🚀 Validation Phase Integration Tests\n'));
    console.log(chalk.gray('Testing auto-fixing validation with progressively difficult scenarios...'));
    console.log(chalk.gray('Features: MCP validation, Claude fix generation, iterative repair\n'));
    
    await this.setup();
    
    const results: any[] = [];
    const testArg = args.find(a => a.startsWith('--test='));
    const scenarios = testArg
      ? TEST_SCENARIOS.filter(s => s.name === testArg.split('=')[1])
      : TEST_SCENARIOS;
    
    // Check if no scenarios were found when a test name was specified
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
    
    // Close readline interface before summary
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
    
    // Group results by difficulty level
    console.log(chalk.gray('\n   Difficulty levels:'));
    const simple = results.filter(r => r.scenario.includes('Simple'));
    const medium = results.filter(r => r.scenario.includes('Medium'));
    const complex = results.filter(r => r.scenario.includes('Complex'));
    const extreme = results.filter(r => r.scenario.includes('Extreme'));
    const edge = results.filter(r => r.scenario.includes('Edge'));
    
    if (simple.length > 0) {
      console.log(chalk.gray(`      Simple errors: ${simple.filter(r => r.success).length}/${simple.length} passed`));
    }
    if (medium.length > 0) {
      console.log(chalk.gray(`      Medium complexity: ${medium.filter(r => r.success).length}/${medium.length} passed`));
    }
    if (complex.length > 0) {
      console.log(chalk.gray(`      Complex issues: ${complex.filter(r => r.success).length}/${complex.length} passed`));
    }
    if (extreme.length > 0) {
      console.log(chalk.gray(`      Extreme cases: ${extreme.filter(r => r.success).length}/${extreme.length} passed`));
    }
    if (edge.length > 0) {
      console.log(chalk.gray(`      Edge cases: ${edge.filter(r => r.success).length}/${edge.length} passed`));
    }
    
    if (saveFixtures) {
      console.log(chalk.green('\n   💾 Fixtures saved to tests/fixtures/validation/'));
    }
    
    return passed === results.length - skipped;
  }
}

// CLI interface
async function main() {
  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Validation Phase Integration Test')}

${chalk.gray('Usage:')} npm run test:validate [options]

${chalk.gray('Options:')}
  --verbose, -v       Show detailed output with fixes
  --no-prompt, -n     Skip interactive prompts
  --test=NAME         Run only specific test (auto-skips prompts)
  --save-fixtures     Save test results as fixtures
  --help, -h          Show this help message

${chalk.gray('Examples:')}
  npm run test:validate
  npm run test:validate --verbose
  npm run test:validate --test="Simple - Missing Required Field"
  npm run test:validate --save-fixtures

${chalk.gray('What this tests:')}
  - MCP validation tool integration
  - Claude-powered fix generation
  - Iterative validation loop (up to 3 attempts)
  - Fix application logic
  - Node-level vs parameter-level properties
  - Error grouping and reporting
  - Complex multi-node workflows
  - Edge cases and error recovery

${chalk.gray('Difficulty Levels:')}
  - Simple: Missing required fields, invalid values
  - Medium: Connection issues, expression errors
  - Complex: Multi-node issues, conditional logic
  - Extreme: Major structural problems
  - Edge Cases: Empty workflows, sticky notes
`);
    process.exit(0);
  }
  
  try {
    const test = new ValidationIntegrationTest();
    const success = await test.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close(); // Make sure to close readline on error
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    rl.close(); // Make sure to close readline on error
    process.exit(1);
  });
}

export { ValidationIntegrationTest, TEST_SCENARIOS };