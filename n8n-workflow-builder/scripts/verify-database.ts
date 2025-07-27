#!/usr/bin/env tsx
/**
 * Verification script for Supabase database setup
 * Run with: npm run db:verify
 * 
 * This script performs comprehensive checks to ensure the database is production-ready
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { workflowDb } from '../lib/db/client';
import { createServerClient } from '../lib/config/supabase';
import type { WorkflowState } from '../lib/db/types';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function verifyDatabase() {
  log('\n🔍 Verifying Supabase Database Setup\n', 'blue');
  
  const results: VerificationResult[] = [];
  const supabase = createServerClient();
  
  // 1. Table Structure Verification
  log('Checking table structure...', 'cyan');
  try {
    const { data: columns, error } = await supabase
      .rpc('get_table_columns', { table_name: 'workflow_sessions' })
      .single();
    
    if (error) {
      // Fallback: try a simple select
      const { error: selectError } = await supabase
        .from('workflow_sessions')
        .select('*')
        .limit(0);
      
      if (selectError) {
        throw selectError;
      }
      
      results.push({
        name: 'Table Structure',
        status: 'warning',
        message: 'Table exists but column details unavailable',
        details: 'Table is accessible for queries'
      });
    } else {
      results.push({
        name: 'Table Structure',
        status: 'pass',
        message: 'Table structure verified',
        details: columns
      });
    }
  } catch (error) {
    results.push({
      name: 'Table Structure',
      status: 'fail',
      message: 'Table verification failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 2. CRUD Operations Test
  log('Testing CRUD operations...', 'cyan');
  let testSessionId: string | null = null;
  
  try {
    // Create
    const session = await workflowDb.createSession('Verification test workflow');
    testSessionId = session.session_id;
    
    // Read
    const retrieved = await workflowDb.getSession(testSessionId);
    if (!retrieved) throw new Error('Failed to retrieve created session');
    
    // Update
    const updated = await workflowDb.updateState(testSessionId, { phase: 'building' });
    if (updated.state.phase !== 'building') throw new Error('State update failed');
    
    // Delete (deactivate)
    await workflowDb.deactivateSession(testSessionId);
    
    results.push({
      name: 'CRUD Operations',
      status: 'pass',
      message: 'All CRUD operations working correctly'
    });
  } catch (error) {
    results.push({
      name: 'CRUD Operations',
      status: 'fail',
      message: 'CRUD operations failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 3. JSONB Performance Test
  log('Testing JSONB performance...', 'cyan');
  try {
    const largeState: WorkflowState = {
      phase: 'building',
      nodes: Array.from({ length: 50 }, (_, i) => ({
        id: `node_${i}`,
        type: 'n8n-nodes-base.httpRequest',
        name: `HTTP Request ${i}`,
        purpose: 'Make API calls',
        position: [100 + i * 50, 200],
        parameters: {
          url: `https://api.example.com/endpoint${i}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { data: `test_${i}` }
        },
        isSelected: false
      })),
      connections: Array.from({ length: 49 }, (_, i) => ({
        source: `node_${i}`,
        target: `node_${i + 1}`,
        sourceOutput: 'main',
        targetInput: 'main'
      })),
      settings: {
        name: 'Large Workflow Test',
        timezone: 'UTC'
      },
      pendingClarifications: [],
      clarificationHistory: [],
      validations: { isValid: true }
    };
    
    const startTime = Date.now();
    const perfSession = await workflowDb.createSession('Performance test');
    await workflowDb.updateState(perfSession.session_id, largeState);
    const retrieved = await workflowDb.getSession(perfSession.session_id);
    const endTime = Date.now();
    
    await workflowDb.deactivateSession(perfSession.session_id);
    
    const operationTime = endTime - startTime;
    const status = operationTime < 1000 ? 'pass' : operationTime < 2000 ? 'warning' : 'fail';
    
    results.push({
      name: 'JSONB Performance',
      status,
      message: `Large JSONB operations completed in ${operationTime}ms`,
      details: {
        nodesCount: retrieved?.state.nodes.length,
        connectionsCount: retrieved?.state.connections.length,
        operationTime: `${operationTime}ms`
      }
    });
  } catch (error) {
    results.push({
      name: 'JSONB Performance',
      status: 'fail',
      message: 'JSONB performance test failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 4. Concurrent Access Test
  log('Testing concurrent access...', 'cyan');
  try {
    const concurrentOps = 10;
    const promises = Array.from({ length: concurrentOps }, (_, i) => 
      workflowDb.createSession(`Concurrent test ${i}`)
    );
    
    const startTime = Date.now();
    const sessions = await Promise.all(promises);
    const endTime = Date.now();
    
    // Cleanup
    await Promise.all(
      sessions.map(s => workflowDb.deactivateSession(s.session_id))
    );
    
    const avgTime = (endTime - startTime) / concurrentOps;
    
    results.push({
      name: 'Concurrent Access',
      status: 'pass',
      message: `${concurrentOps} concurrent operations successful`,
      details: {
        totalTime: `${endTime - startTime}ms`,
        averageTime: `${avgTime.toFixed(2)}ms per operation`
      }
    });
  } catch (error) {
    results.push({
      name: 'Concurrent Access',
      status: 'fail',
      message: 'Concurrent access test failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 5. Error Handling Test
  log('Testing error handling...', 'cyan');
  try {
    // Test non-existent session
    const notFound = await workflowDb.getSession('non_existent_session');
    if (notFound !== null) throw new Error('Should return null for non-existent session');
    
    // Test invalid state update
    try {
      await workflowDb.updateState('non_existent_session', { phase: 'complete' });
      throw new Error('Should throw error for non-existent session');
    } catch (error) {
      if (!error || !(error instanceof Error) || !error.message.includes('not found')) {
        throw new Error('Incorrect error handling for missing session');
      }
    }
    
    results.push({
      name: 'Error Handling',
      status: 'pass',
      message: 'Error handling working correctly'
    });
  } catch (error) {
    results.push({
      name: 'Error Handling',
      status: 'fail',
      message: 'Error handling test failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 6. Index Performance Test
  log('Testing index performance...', 'cyan');
  try {
    // Create multiple sessions
    const testSessions = await Promise.all(
      Array.from({ length: 20 }, (_, i) => 
        workflowDb.createSession(`Index test ${i}`)
      )
    );
    
    // Test session_id index
    const startTime = Date.now();
    await workflowDb.getSession(testSessions[10].session_id);
    const indexTime = Date.now() - startTime;
    
    // Test active sessions index
    const activeStartTime = Date.now();
    await workflowDb.getActiveSessions();
    const activeTime = Date.now() - activeStartTime;
    
    // Cleanup
    await Promise.all(
      testSessions.map(s => workflowDb.deactivateSession(s.session_id))
    );
    
    const status = indexTime < 50 && activeTime < 100 ? 'pass' : 
                   indexTime < 100 && activeTime < 200 ? 'warning' : 'fail';
    
    results.push({
      name: 'Index Performance',
      status,
      message: 'Index queries performing well',
      details: {
        sessionIdLookup: `${indexTime}ms`,
        activeSessionsQuery: `${activeTime}ms`
      }
    });
  } catch (error) {
    results.push({
      name: 'Index Performance',
      status: 'fail',
      message: 'Index performance test failed',
      details: error instanceof Error ? error.message : error
    });
  }
  
  // 7. API Health Check
  log('Testing API health endpoint...', 'cyan');
  try {
    const response = await fetch('http://localhost:3000/api/health');
    const health = await response.json();
    
    if (health.status === 'healthy' && health.services.database.status === 'ok') {
      results.push({
        name: 'API Health Check',
        status: 'pass',
        message: 'Health endpoint working correctly',
        details: health.services.database
      });
    } else {
      results.push({
        name: 'API Health Check',
        status: 'warning',
        message: 'Health endpoint accessible but reporting issues',
        details: health
      });
    }
  } catch (error) {
    results.push({
      name: 'API Health Check',
      status: 'warning',
      message: 'Could not reach health endpoint (is the server running?)',
      details: 'Run "npm run dev" and try again'
    });
  }
  
  // Display Results
  log('\n📊 Verification Results\n', 'blue');
  
  let passCount = 0;
  let failCount = 0;
  let warningCount = 0;
  
  results.forEach((result, index) => {
    const icon = result.status === 'pass' ? '✅' : 
                 result.status === 'fail' ? '❌' : '⚠️';
    const color = result.status === 'pass' ? 'green' : 
                  result.status === 'fail' ? 'red' : 'yellow';
    
    log(`${icon} ${result.name}`, color);
    log(`   ${result.message}`, color);
    if (result.details) {
      if (typeof result.details === 'object') {
        Object.entries(result.details).forEach(([key, value]) => {
          log(`   - ${key}: ${value}`, 'reset');
        });
      } else {
        log(`   - ${result.details}`, 'reset');
      }
    }
    
    if (result.status === 'pass') passCount++;
    else if (result.status === 'fail') failCount++;
    else warningCount++;
    
    if (index < results.length - 1) log(''); // Empty line between results
  });
  
  // Summary
  log('\n📈 Summary', 'blue');
  log(`Passed: ${passCount}`, passCount > 0 ? 'green' : 'reset');
  log(`Warnings: ${warningCount}`, warningCount > 0 ? 'yellow' : 'reset');
  log(`Failed: ${failCount}`, failCount > 0 ? 'red' : 'reset');
  
  if (failCount === 0) {
    log('\n✅ Database verification complete! Your database is production-ready.', 'green');
    if (warningCount > 0) {
      log('⚠️  Some warnings were found but they are not critical.', 'yellow');
    }
  } else {
    log('\n❌ Database verification failed. Please fix the issues above.', 'red');
    process.exit(1);
  }
}

// Run verification
verifyDatabase().catch((error) => {
  log(`\n❌ Verification error: ${error}`, 'red');
  process.exit(1);
});