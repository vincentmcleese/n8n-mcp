#!/usr/bin/env npx tsx
/**
 * Create a test session to verify enhanced operations
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Enable Supabase state
process.env.USE_SUPABASE_STATE = 'true';

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import { createServiceClient } from '../lib/supabase';

async function createTestSession() {
  console.log('🚀 Creating test session with enhanced operations...');
  
  const orchestrator = new WorkflowOrchestrator();
  const supabase = createServiceClient();
  const sessionId = `test-enhanced-ops-${Date.now()}`;
  
  try {
    // Run just the discovery phase
    console.log('📍 Running discovery phase...');
    const result = await orchestrator.runDiscoveryPhase(
      sessionId,
      'Create a simple webhook that responds with a JSON message'
    );
    
    console.log(`✅ Discovery completed with ${result.operations.length} operations`);
    
    // Wait for async save
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check the database for enhanced operations
    console.log('\n🔍 Checking enhanced operations...');
    const { data, error } = await supabase
      .from('workflow_sessions')
      .select('operations')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data?.operations || data.operations.length === 0) {
      console.log('❌ No operations found in database');
      return;
    }
    
    console.log(`📊 Found ${data.operations.length} operations in database`);
    
    // Check for enhancements
    let hasTimestamps = 0;
    let hasReasoning = 0;
    let hasOperationIndex = 0;
    
    data.operations.forEach((op, index) => {
      if (op.timestamp) hasTimestamps++;
      if (op.reasoning) hasReasoning++;
      if (op.operationIndex !== undefined) hasOperationIndex++;
      
      // Show first operation in detail
      if (index === 0) {
        console.log(`\n📝 First operation details:`);
        console.log(`   Type: ${op.type}`);
        console.log(`   Timestamp: ${op.timestamp || '❌ Missing'}`);
        console.log(`   Reasoning: ${op.reasoning || '❌ Missing'}`);
        console.log(`   OpIndex: ${op.operationIndex !== undefined ? op.operationIndex : '❌ Missing'}`);
        if (op.node) {
          console.log(`   Node: ${op.node.type} - ${op.node.purpose}`);
        }
      }
    });
    
    console.log('\n📈 Enhancement Summary:');
    console.log(`✅ Operations with timestamps: ${hasTimestamps}/${data.operations.length}`);
    console.log(`✅ Operations with reasoning: ${hasReasoning}/${data.operations.length}`);
    console.log(`✅ Operations with index: ${hasOperationIndex}/${data.operations.length}`);
    
    const success = hasTimestamps > 0 || hasReasoning > 0;
    console.log(`\n${success ? '🎉' : '❌'} Enhanced operations test: ${success ? 'PASSED' : 'FAILED'}`);
    
    // Clean up
    await supabase
      .from('workflow_sessions')
      .delete()
      .eq('session_id', sessionId);
    
    console.log('🧹 Cleaned up test session');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Cleanup on error
    await supabase
      .from('workflow_sessions')
      .delete()
      .eq('session_id', sessionId);
  }
}

createTestSession().catch(console.error);