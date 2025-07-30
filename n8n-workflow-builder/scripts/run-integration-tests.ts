#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function runIntegrationTests() {
  console.log('🚀 Running Core Integration Tests\n');
  console.log('='.repeat(60));
  
  const tests = [
    {
      name: 'Discovery Phase Integration',
      file: 'test-discovery-phase-integration.ts',
      description: 'Tests node discovery, search, and selection'
    },
    {
      name: 'Configuration Phase Integration', 
      file: 'test-configuration-phase-integration.ts',
      description: 'Tests node configuration and parameter setting'
    },
    {
      name: 'Building Phase Integration',
      file: 'test-building-phase-integration.ts', 
      description: 'Tests workflow building and connections'
    },
    {
      name: 'Validation Phase Integration',
      file: 'test-validation-phase-integration.ts',
      description: 'Tests workflow validation and automatic fixing'
    },
    {
      name: 'Multi-Phase Integration',
      file: 'test-multi-phase-integration.ts',
      description: 'Tests complete workflow from discovery to export'
    }
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (const test of tests) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   ${test.description}`);
    console.log('-'.repeat(60));
    
    try {
      const { stdout, stderr } = await execAsync(`npx tsx scripts/${test.file}`, {
        cwd: process.cwd(),
        env: process.env
      });
      
      // Parse results from stdout
      const output = stdout + stderr;
      const passMatch = output.match(/Tests passed: (\d+)/);
      const failMatch = output.match(/Tests failed: (\d+)/);
      
      const passed = passMatch ? parseInt(passMatch[1]) : 0;
      const failed = failMatch ? parseInt(failMatch[1]) : 0;
      
      totalPassed += passed;
      totalFailed += failed;
      
      if (failed === 0) {
        console.log(`✅ All tests passed (${passed}/${passed})`);
      } else {
        console.log(`❌ Some tests failed (${passed}/${passed + failed})`);
      }
      
      // Show key output lines
      const lines = output.split('\n').filter(line => 
        line.includes('✅') || 
        line.includes('❌') || 
        line.includes('Test') ||
        line.includes('Error:')
      );
      
      lines.slice(0, 10).forEach(line => console.log(`   ${line.trim()}`));
      if (lines.length > 10) {
        console.log(`   ... (${lines.length - 10} more lines)`);
      }
      
    } catch (error) {
      console.log(`❌ Test crashed: ${error.message}`);
      totalFailed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 INTEGRATION TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests Run: ${tests.length}`);
  console.log(`Total Assertions Passed: ${totalPassed}`);
  console.log(`Total Assertions Failed: ${totalFailed}`);
  console.log(`Total Duration: ${duration}s`);
  console.log('='.repeat(60));
  
  if (totalFailed === 0) {
    console.log('\n✅ All integration tests passed!');
  } else {
    console.log(`\n❌ ${totalFailed} test assertions failed`);
  }
  
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run tests
runIntegrationTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});