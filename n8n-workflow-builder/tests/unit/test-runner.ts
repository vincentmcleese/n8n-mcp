#!/usr/bin/env tsx
import { spawn } from 'child_process';
import * as path from 'path';

// Get command line arguments
const args = process.argv.slice(2);
const runAll = args.includes('--all');
const phase = args.find(arg => arg.startsWith('--phase='))?.split('=')[1] || 
              (args.includes('--phase') ? args[args.indexOf('--phase') + 1] : null);

// Define test files
const testFiles: Record<string, string> = {
  discovery: 'tests/unit/runners/discovery.test.ts',
  configuration: 'tests/unit/runners/configuration.test.ts',
  building: 'tests/unit/runners/building.test.ts',
  validation: 'tests/unit/runners/validation.test.ts',
  documentation: 'tests/unit/runners/documentation.test.ts'
};

// Set up environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Quiet logs during tests

async function runTestFile(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Use tsx directly to run the test files
    const child = spawn('tsx', [filePath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error'
      }
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function runTests() {
  console.log('🧪 n8n Workflow Builder - Unit Test Runner\n');
  
  let filesToRun: string[] = [];
  
  // Determine which tests to run
  if (runAll) {
    filesToRun = Object.values(testFiles);
    console.log('Running all unit tests...\n');
  } else if (phase && testFiles[phase]) {
    filesToRun = [testFiles[phase]];
    console.log(`Running ${phase} phase tests...\n`);
  } else if (!phase) {
    // Default to running all tests
    filesToRun = Object.values(testFiles);
    console.log('Running all unit tests...\n');
  } else {
    console.error(`Unknown phase: ${phase}`);
    console.error('Available phases: discovery, configuration, building, validation, documentation');
    process.exit(1);
  }
  
  let allPassed = true;
  
  // Run each test file
  for (const testFile of filesToRun) {
    const testName = path.basename(testFile, '.test.ts');
    console.log(`\n📁 Running ${testName} tests...`);
    
    const passed = await runTestFile(testFile);
    
    if (!passed) {
      allPassed = false;
      console.error(`❌ ${testName} tests failed`);
    } else {
      console.log(`✅ ${testName} tests passed`);
    }
  }
  
  // Print summary
  console.log('\n=== Test Summary ===');
  if (allPassed) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});