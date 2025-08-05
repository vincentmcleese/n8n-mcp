#!/usr/bin/env npx tsx
/**
 * Simple test to verify enhanced operations are being saved
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Enable Supabase state
process.env.USE_SUPABASE_STATE = 'true';

import { createServiceClient } from '../lib/supabase';

async function testEnhancedOperations() {
  console.log('🔍 Testing enhanced operations...');
  
  try {
    const supabase = createServiceClient();
    
    // Get the most recent session operations
    const { data, error } = await supabase
      .from('workflow_sessions')
      .select('operations, created_at')
      .not('operations', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.log('❌ No sessions with operations found');
      return;
    }
    
    const session = data[0];
    const operations = session.operations;
    
    console.log(`\n📊 Found ${operations.length} operations from session created at ${session.created_at}`);
    
    // Check for our enhancements
    let hasTimestamps = 0;
    let hasReasoning = 0;
    let hasOperationIndex = 0;
    
    operations.forEach((op, index) => {
      if (op.timestamp) hasTimestamps++;
      if (op.reasoning) hasReasoning++;
      if (op.operationIndex !== undefined) hasOperationIndex++;
      
      // Show first few operations
      if (index < 3) {
        console.log(`\n${index + 1}. ${op.type}`);
        console.log(`   Timestamp: ${op.timestamp || '❌ Missing'}`);
        console.log(`   Reasoning: ${op.reasoning || '❌ Missing'}`);
        console.log(`   OpIndex: ${op.operationIndex !== undefined ? op.operationIndex : '❌ Missing'}`);
      }
    });
    
    console.log('\n📈 Enhancement Summary:');
    console.log(`✅ Operations with timestamps: ${hasTimestamps}/${operations.length}`);
    console.log(`✅ Operations with reasoning: ${hasReasoning}/${operations.length}`);
    console.log(`✅ Operations with index: ${hasOperationIndex}/${operations.length}`);
    
    const success = hasTimestamps > 0 || hasReasoning > 0;
    console.log(`\n${success ? '🎉' : '❌'} Enhanced operations test: ${success ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEnhancedOperations().catch(console.error);