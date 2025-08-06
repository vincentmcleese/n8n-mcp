/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Mock problematic ESM modules
    '^nanoid$': '<rootDir>/lib/nanoid-wrapper.js',
    '^lodash-es$': 'lodash',
    '^@supabase/supabase-js$': '<rootDir>/__mocks__/@supabase/supabase-js.js',
    // Handle .js extensions in imports
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Transform configuration - all ts-jest config goes here
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  
  // Don't transform ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(@smithery|@modelcontextprotocol|nanoid|lodash-es)/)',
  ],
  
  // ESM support
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // Inject jest globals
  injectGlobals: true,
  
  // Resolver options
  resolver: undefined,
  
  // Test patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)',
    '<rootDir>/**/*.(test|spec).(ts|tsx|js|jsx)',
  ],
  
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/tests/e2e/',
  ],
  
  // Coverage
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!lib/**/*.d.ts',
    '!**/*.config.js',
    '!**/__tests__/**',
  ],
  
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};