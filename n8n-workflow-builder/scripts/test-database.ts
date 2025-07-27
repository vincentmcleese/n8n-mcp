#!/usr/bin/env tsx
/**
 * Test script for Supabase database operations
 * Run with: npm run test:db
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { workflowDb } from '../lib/db/client';
import type { WorkflowState } from '../lib/db/types';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testDatabaseOperations() {
  log('\n🚀 Starting Supabase Database Tests\n', 'blue');
  
  let testSessionId: string | null = null;
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // Test 1: Health Check
    log('Test 1: Health Check', 'yellow');
    const isHealthy = await workflowDb.healthCheck();
    if (isHealthy) {
      log('✅ Database connection is healthy', 'green');
      testsPassed++;
    } else {
      log('❌ Database connection failed', 'red');
      testsFailed++;
      return;
    }
    
    // Test 2: Create Session
    log('\nTest 2: Create Session', 'yellow');
    const userPrompt = 'Test workflow: Monitor a website and send Slack alerts';
    const session = await workflowDb.createSession(userPrompt);
    testSessionId = session.session_id;
    
    if (session && session.session_id && session.user_prompt === userPrompt) {
      log(`✅ Session created: ${session.session_id}`, 'green');
      log(`   Created at: ${session.created_at}`, 'green');
      log(`   State phase: ${session.state.phase}`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to create session', 'red');
      testsFailed++;
    }
    
    // Test 3: Get Session
    log('\nTest 3: Get Session', 'yellow');
    const retrievedSession = await workflowDb.getSession(testSessionId!);
    
    if (retrievedSession && retrievedSession.session_id === testSessionId) {
      log(`✅ Session retrieved: ${retrievedSession.session_id}`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to retrieve session', 'red');
      testsFailed++;
    }
    
    // Test 4: Update State
    log('\nTest 4: Update State', 'yellow');
    const newState: Partial<WorkflowState> = {
      phase: 'building',
      nodes: [
        {
          id: 'temp_1',
          type: 'n8n-nodes-base.webhook',
          name: 'Webhook',
          purpose: 'Receive HTTP requests',
          position: [250, 300],
          parameters: {},
          isSelected: false
        }
      ]
    };
    
    const updatedSession = await workflowDb.updateState(testSessionId!, newState);
    
    if (updatedSession.state.phase === 'building' && updatedSession.state.nodes.length === 1) {
      log('✅ State updated successfully', 'green');
      log(`   Phase: ${updatedSession.state.phase}`, 'green');
      log(`   Nodes: ${updatedSession.state.nodes.length}`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to update state', 'red');
      testsFailed++;
    }
    
    // Test 5: Add Operation
    log('\nTest 5: Add Operation', 'yellow');
    const operation = {
      type: 'discoverNode',
      data: {
        node: {
          id: 'temp_1',
          type: 'n8n-nodes-base.webhook',
          purpose: 'Receive HTTP requests'
        }
      },
      createdBy: 'claude' as const
    };
    
    const sessionWithOp = await workflowDb.addOperation(testSessionId!, operation);
    
    if (sessionWithOp.operations.length === 1 && sessionWithOp.operations[0].type === 'discoverNode') {
      log('✅ Operation added successfully', 'green');
      log(`   Operations count: ${sessionWithOp.operations.length}`, 'green');
      log(`   Operation type: ${sessionWithOp.operations[0].type}`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to add operation', 'red');
      testsFailed++;
    }
    
    // Test 6: Update State with Operation
    log('\nTest 6: Update State with Operation', 'yellow');
    const stateUpdate: Partial<WorkflowState> = {
      phase: 'validation'
    };
    const newOperation = {
      type: 'validateWorkflow',
      data: {
        result: 'valid'
      },
      createdBy: 'system' as const
    };
    
    const finalSession = await workflowDb.updateStateWithOperation(
      testSessionId!,
      stateUpdate,
      newOperation
    );
    
    if (
      finalSession.state.phase === 'validation' &&
      finalSession.operations.length === 2 &&
      finalSession.operations[1].type === 'validateWorkflow'
    ) {
      log('✅ State and operation updated atomically', 'green');
      log(`   Phase: ${finalSession.state.phase}`, 'green');
      log(`   Operations: ${finalSession.operations.length}`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to update state with operation', 'red');
      testsFailed++;
    }
    
    // Test 7: Deactivate Session
    log('\nTest 7: Deactivate Session', 'yellow');
    await workflowDb.deactivateSession(testSessionId!);
    const deactivatedSession = await workflowDb.getSession(testSessionId!);
    
    if (deactivatedSession && !deactivatedSession.is_active) {
      log('✅ Session deactivated successfully', 'green');
      testsPassed++;
    } else {
      log('❌ Failed to deactivate session', 'red');
      testsFailed++;
    }
    
    // Test 8: Get Active Sessions
    log('\nTest 8: Get Active Sessions', 'yellow');
    const activeSessions = await workflowDb.getActiveSessions();
    
    if (Array.isArray(activeSessions)) {
      log(`✅ Retrieved ${activeSessions.length} active sessions`, 'green');
      testsPassed++;
    } else {
      log('❌ Failed to get active sessions', 'red');
      testsFailed++;
    }
    
    // Test 9: Test JSONB functionality
    log('\nTest 9: JSONB Functionality', 'yellow');
    const complexState: Partial<WorkflowState> = {
      nodes: [
        {
          id: 'node1',
          type: 'n8n-nodes-base.httpRequest',
          name: 'HTTP Request',
          purpose: 'Make API calls',
          position: [400, 300],
          parameters: {
            url: 'https://api.example.com',
            method: 'GET',
            headers: {
              'Authorization': 'Bearer token'
            }
          },
          isSelected: true
        }
      ],
      connections: [
        {
          source: 'temp_1',
          target: 'node1',
          sourceOutput: 'main',
          targetInput: 'main'
        }
      ],
      settings: {
        name: 'Complex Workflow',
        timezone: 'UTC',
        errorWorkflow: 'error-handler-id'
      }
    };
    
    const complexSession = await workflowDb.createSession('Test complex JSONB');
    const updated = await workflowDb.updateState(complexSession.session_id, complexState);
    
    if (
      updated.state.nodes[0].parameters.url === 'https://api.example.com' &&
      updated.state.connections.length === 1 &&
      updated.state.settings.errorWorkflow === 'error-handler-id'
    ) {
      log('✅ Complex JSONB data handled correctly', 'green');
      testsPassed++;
    } else {
      log('❌ Failed to handle complex JSONB data', 'red');
      testsFailed++;
    }
    
    // Cleanup
    await workflowDb.deactivateSession(complexSession.session_id);
    
  } catch (error) {
    log(`\n❌ Test failed with error: ${error}`, 'red');
    if (error instanceof Error) {
      log(`   ${error.stack}`, 'red');
    }
    testsFailed++;
  }
  
  // Summary
  log('\n📊 Test Summary', 'blue');
  log(`Tests Passed: ${testsPassed}`, testsPassed > 0 ? 'green' : 'reset');
  log(`Tests Failed: ${testsFailed}`, testsFailed > 0 ? 'red' : 'reset');
  log(`Total Tests: ${testsPassed + testsFailed}`, 'blue');
  
  if (testsFailed === 0) {
    log('\n✅ All tests passed! Database is working correctly.', 'green');
  } else {
    log('\n❌ Some tests failed. Please check the database setup.', 'red');
    process.exit(1);
  }
}

// Run tests
testDatabaseOperations().catch((error) => {
  log(`\n❌ Fatal error: ${error}`, 'red');
  process.exit(1);
});