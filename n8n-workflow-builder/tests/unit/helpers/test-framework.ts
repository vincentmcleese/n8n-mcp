import { test as nodeTest, describe as nodeDescribe } from 'node:test';
import assert from 'node:assert/strict';

// Export node test utilities with simpler names
export const test = nodeTest;
export const describe = nodeDescribe;
export const expect = assert;

// Helper for async error testing
export async function expectError(fn: () => Promise<any>, errorMessage?: string) {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (errorMessage && error instanceof Error) {
      assert.equal(error.message, errorMessage);
    }
    return error;
  }
}

// Test result tracking
export interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: Error;
  duration: number;
}

export class TestReporter {
  private results: TestResult[] = [];
  
  addResult(result: TestResult) {
    this.results.push(result);
  }
  
  getResults() {
    return this.results;
  }
  
  printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    
    console.log('\n=== Test Summary ===');
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  ❌ ${r.suite} > ${r.test}`);
          if (r.error) {
            console.log(`     ${r.error.message}`);
          }
        });
    }
    
    return failed === 0;
  }
}