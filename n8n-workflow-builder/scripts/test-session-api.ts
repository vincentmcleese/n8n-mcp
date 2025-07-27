// Test session API route
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testSessionAPI() {
  console.log('🔍 Testing Session API Route...\n');

  try {
    // Start the dev server first in a separate terminal
    console.log('⚠️  Make sure the dev server is running: npm run dev\n');
    
    const baseUrl = 'http://localhost:3000';
    
    // Test 1: Valid session creation
    console.log('1️⃣ Testing Valid Session Creation...');
    const validResponse = await fetch(`${baseUrl}/api/workflow/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Create a workflow that receives webhooks and sends to Slack',
        metadata: {
          name: 'Test Workflow',
          description: 'Testing session creation',
        },
      }),
    });

    if (validResponse.ok) {
      const data = await validResponse.json();
      console.log('✅ Created session:', data);
    } else {
      console.error('❌ Failed:', await validResponse.text());
    }

    // Test 2: Invalid request (missing prompt)
    console.log('\n2️⃣ Testing Invalid Request (missing prompt)...');
    const invalidResponse = await fetch(`${baseUrl}/api/workflow/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metadata: {
          name: 'Test',
        },
      }),
    });

    if (invalidResponse.status === 400) {
      const error = await invalidResponse.json();
      console.log('✅ Correctly rejected invalid request:', error.error);
    } else {
      console.error('❌ Should have rejected invalid request');
    }

    // Test 3: Empty prompt
    console.log('\n3️⃣ Testing Empty Prompt...');
    const emptyResponse = await fetch(`${baseUrl}/api/workflow/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: '',
      }),
    });

    if (emptyResponse.status === 400) {
      console.log('✅ Correctly rejected empty prompt');
    } else {
      console.error('❌ Should have rejected empty prompt');
    }

    // Test 4: OPTIONS request (CORS)
    console.log('\n4️⃣ Testing OPTIONS Request (CORS)...');
    const optionsResponse = await fetch(`${baseUrl}/api/workflow/create`, {
      method: 'OPTIONS',
    });

    if (optionsResponse.ok) {
      console.log('✅ CORS preflight successful');
      console.log('   Headers:', optionsResponse.headers.get('Access-Control-Allow-Methods'));
    } else {
      console.error('❌ CORS preflight failed');
    }

    console.log('\n🎉 API tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testSessionAPI().catch(console.error);