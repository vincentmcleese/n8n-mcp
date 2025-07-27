import { 
  generateSessionId, 
  parseSessionId,
  createWorkflowSession,
  getWorkflowSession,
  applyOperations,
  getSessionStats
} from '../lib/session-utils';
import { DeltaBuilder } from '../lib/delta-builder';

async function verifySessionUtils() {
  console.log('🔍 Verifying Session Utilities...\n');

  try {
    // Test 1: Session ID generation
    console.log('1️⃣ Testing Session ID Generation...');
    const sessionId = generateSessionId();
    console.log(`✅ Generated session ID: ${sessionId}`);
    
    // Test 2: Session ID parsing
    console.log('\n2️⃣ Testing Session ID Parsing...');
    const parsed = parseSessionId(sessionId);
    console.log('✅ Parsed session:', {
      prefix: parsed.prefix,
      timestamp: new Date(parsed.timestamp).toISOString(),
      random: parsed.random,
    });

    // Test 3: Create workflow session
    console.log('\n3️⃣ Testing Session Creation...');
    const session = await createWorkflowSession('Test workflow prompt', {
      name: 'Test Workflow',
      description: 'Testing session utilities',
    });
    console.log('✅ Created session:', session);

    // Test 4: Retrieve session
    console.log('\n4️⃣ Testing Session Retrieval...');
    const retrieved = await getWorkflowSession(session.sessionId);
    console.log('✅ Retrieved session:', {
      sessionId: retrieved?.sessionId,
      phase: retrieved?.state.phase,
      prompt: retrieved?.state.userPrompt,
    });

    // Test 5: Delta operations
    console.log('\n5️⃣ Testing Delta Operations...');
    const deltaBuilder = new DeltaBuilder();
    deltaBuilder
      .discoverNode({ id: 'node1', type: 'webhook', purpose: 'Receive data' })
      .selectNode('node1')
      .setPhase('configuration');

    const operations = deltaBuilder.getOperations();
    console.log(`✅ Created ${operations.length} operations`);

    // Test 6: Apply operations
    console.log('\n6️⃣ Testing Apply Operations...');
    const result = await applyOperations(session.sessionId, operations);
    console.log('✅ Applied operations:', result);

    // Test 7: Get session stats
    console.log('\n7️⃣ Testing Session Stats...');
    const stats = await getSessionStats(session.sessionId);
    console.log('✅ Session stats:', stats);

    console.log('\n🎉 All session utility tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run verification
verifySessionUtils().catch(console.error);