#!/usr/bin/env ts-node

/**
 * Test runner script with verbosity control
 * 
 * Usage:
 *   npm run test:verbose       # Run tests with verbose logging
 *   npm run test:quiet         # Run tests with minimal logging (default)
 *   npm run test:debug         # Run tests with debug-level logging
 */

import { execSync } from 'child_process';
import * as process from 'process';

// Get verbosity level from command line or environment
const args = process.argv.slice(2);
const verbosityLevel = args[0] || process.env.TEST_VERBOSITY || 'info';

// Map verbosity levels to environment variables
const envVars: Record<string, string> = {
  quiet: 'LOG_LEVEL=error',
  info: 'LOG_LEVEL=info',
  verbose: 'TEST_VERBOSE=true LOG_LEVEL=verbose',
  debug: 'TEST_VERBOSE=true LOG_LEVEL=debug',
};

const env = envVars[verbosityLevel] || envVars.info;

console.log(`Running tests with verbosity level: ${verbosityLevel}`);
console.log(`Environment: ${env}`);
console.log('');

// Run jest with the appropriate environment variables
try {
  execSync(`${env} jest ${args.slice(1).join(' ')}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...Object.fromEntries(env.split(' ').map(pair => pair.split('='))),
    },
  });
} catch (error) {
  process.exit(1);
}