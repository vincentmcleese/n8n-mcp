#!/usr/bin/env npx tsx
/**
 * Test script to verify operations are being saved to the operations column
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Enable Supabase state
process.env.USE_SUPABASE_STATE = 'true';

import { createServiceClient } from '../lib/supabase';
import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';
import { loggers } from '../lib/utils/logger';

async function testOperationsColumn() {
  const supabase = createServiceClient();
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = `test-ops-${Date.now()}`;
  
  console.log(`\n🧪 Testing operations column with session: ${sessionId}\n`);

  try {
    // Step 1: Run discovery phase
    console.log('📍 Running discovery phase...');
    const discoveryResult = await orchestrator.runDiscoveryPhase(
      sessionId,
      'Create a simple webhook that sends a Slack message'
    );
    
    console.log(`✅ Discovery completed with ${discoveryResult.operations.length} operations`);
    
    // Wait a bit for async save
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Check the database
    console.log('\n📊 Checking database...');
    const { data, error } = await supabase
      .from('workflow_sessions')
      .select('operations, state')
      .eq('session_id', sessionId)
      .single();
    
    if (error) {
      throw new Error(`Failed to fetch session: ${error.message}`);
    }
    
    // Step 3: Verify operations column
    console.log('\n🔍 Verification Results:');
    console.log(`- Operations column has ${data.operations?.length || 0} operations`);
    console.log(`- State.operationHistory has ${data.state?.operationHistory?.length || 0} operations`);
    console.log(`- Match: ${data.operations?.length === data.state?.operationHistory?.length ? '✅' : '❌'}`);
    
    // Step 4: Display the enhanced narrative
    if (data.operations && data.operations.length > 0) {
      console.log('\n📖 Enhanced Operation Narrative:');
      data.operations.forEach((op: any, index: number) => {
        console.log(`\n${index + 1}. [${op.timestamp || 'No timestamp'}] ${op.type}`);
        if (op.node) {
          console.log(`   Node: ${op.node.type} - ${op.node.purpose}`);
        }
        if (op.nodeId) {
          console.log(`   Node ID: ${op.nodeId}`);
        }
        if (op.reasoning) {
          console.log(`   💭 Reasoning: ${op.reasoning}`);
        }
        if (op.operationIndex !== undefined) {
          console.log(`   📍 Operation Index: ${op.operationIndex}`);
        }
      });
      
      // Show the chronological story
      console.log('\n📚 The LLM\'s Story:');
      const narrative = data.operations
        .filter((op: any) => op.reasoning)
        .map((op: any, index: number) => `${index + 1}. ${op.reasoning}`)
        .join('\n');
      console.log(narrative);
    }
    
    // Cleanup
    await supabase
      .from('workflow_sessions')
      .delete()
      .eq('session_id', sessionId);
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    // Cleanup on error
    await supabase
      .from('workflow_sessions')
      .delete()
      .eq('session_id', sessionId);
    
    process.exit(1);
  }
}

// Run the test
testOperationsColumn().catch(console.error);