# Unit Tests for n8n Workflow Builder

This directory contains unit tests for each phase of the workflow builder, implemented using Node.js's built-in test runner instead of Jest (due to ESM compatibility issues).

## Test Structure

```
tests/unit/
├── helpers/
│   ├── test-framework.ts    # Test utilities and assertions
│   ├── mocks.ts             # Mock implementations
│   └── phase-test-utils.ts  # Helper functions for phase testing
├── runners/
│   ├── discovery.test.ts    # Discovery phase tests
│   ├── configuration.test.ts # Configuration phase tests
│   ├── building.test.ts     # Building phase tests
│   ├── validation.test.ts   # Validation phase tests
│   └── documentation.test.ts # Documentation phase tests
└── test-runner.ts           # Main test runner script
```

## Running Tests

### Run all unit tests:
```bash
npm test
# or
npm run test:unit:all
```

### Run tests for a specific phase:
```bash
npm run test:discovery
npm run test:configuration
npm run test:building
npm run test:validation
npm run test:documentation
```

### Run tests directly with tsx:
```bash
tsx tests/unit/test-runner.ts --phase discovery
```

## Test Implementation

Each phase test file tests the corresponding runner class with:
- Success scenarios
- Error handling
- Edge cases
- State management
- Operation logging

## Mocking Strategy

Since we can't use Jest mocks with ESM, we've implemented simple mock functions that:
- Track calls manually
- Return predefined responses
- Allow customization per test
- Simulate async behavior

## Adding New Tests

1. Create a new test file in the appropriate directory
2. Import the test framework utilities:
   ```typescript
   import { describe, test, expect } from '../helpers/test-framework';
   ```
3. Create mock dependencies using the mock helpers
4. Write your tests using Node's test runner syntax
5. Add the test file to the test runner if needed

## Example Test

```typescript
import { describe, test, expect } from '../helpers/test-framework';
import { MyRunner } from '@/lib/orchestrator/runners/my.runner';
import { createSimpleMockLogger } from '../helpers/mocks';

describe('MyRunner', () => {
  test('should do something', async () => {
    const runner = new MyRunner({
      loggers: {
        app: createSimpleMockLogger()
      }
    });
    
    const result = await runner.run({ sessionId: 'test' });
    expect.equal(result.success, true);
  });
});
```

## Note on ESM

These tests use Node.js's native ESM support with tsx as the loader. This avoids the Jest/ESM compatibility issues while still providing a robust testing framework.