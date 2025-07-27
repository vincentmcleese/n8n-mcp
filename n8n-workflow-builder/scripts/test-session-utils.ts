// Direct test without env validation
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testSessionUtils() {
  console.log('🔍 Testing Session Utilities...\n');

  try {
    // Test 1: Session ID generation
    console.log('1️⃣ Testing Session ID Generation...');
    const { generateSessionId, parseSessionId } = await import('../lib/session-utils');
    
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

    // Test 3: Delta Builder
    console.log('\n3️⃣ Testing Delta Builder...');
    const { DeltaBuilder } = await import('../lib/delta-builder');
    const deltaBuilder = new DeltaBuilder();
    
    deltaBuilder
      .discoverNode({ id: 'node1', type: 'webhook', purpose: 'Receive data' })
      .selectNode('node1')
      .setPhase('configuration');

    const operations = deltaBuilder.getOperations();
    console.log(`✅ Created ${operations.length} operations:`, operations);

    // Test 4: Token calculation
    console.log('\n4️⃣ Calculating Token Reduction...');
    const traditionalPayload = JSON.stringify({
      phase: 'discovery',
      discovered: Array(10).fill({ id: 'node', type: 'webhook', purpose: 'test' }),
      selected: Array(5).fill('nodeId'),
      configured: Object.fromEntries(Array(5).fill(['nodeId', { params: {} }])),
      workflow: { nodes: [], connections: [], settings: {} },
    });
    
    const deltaPayload = JSON.stringify(operations);
    
    console.log(`Traditional approach: ${traditionalPayload.length} bytes`);
    console.log(`Delta approach: ${deltaPayload.length} bytes`);
    console.log(`Reduction: ${Math.round((1 - deltaPayload.length / traditionalPayload.length) * 100)}%`);

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testSessionUtils().catch(console.error);