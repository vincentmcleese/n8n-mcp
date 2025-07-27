#!/usr/bin/env node

/**
 * Environment validation script for CI/CD
 * Run this before build to ensure all required environment variables are set
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

// Environment variable groups
const envGroups = {
  public: {
    label: 'Public Environment Variables',
    vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  },
  private: {
    label: 'Private Environment Variables',
    vars: ['ANTHROPIC_API_KEY', 'MCP_SERVER_URL', 'MCP_API_KEY', 'MCP_PROFILE', 'CRON_SECRET'],
  },
};

// Check if we're in CI/CD environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

function validateEnvironment() {
  console.log(`${colors.blue}🔍 Validating environment variables...${colors.reset}\n`);
  
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  
  // Check each group
  Object.entries(envGroups).forEach(([groupKey, group]) => {
    console.log(`${colors.blue}${group.label}:${colors.reset}`);
    
    group.vars.forEach(varName => {
      const value = process.env[varName];
      const isPublic = varName.startsWith('NEXT_PUBLIC_');
      
      if (!value) {
        // In production or CI, all variables should be set
        if (isCI || process.env.NODE_ENV === 'production') {
          errors.push(`❌ ${varName} is not set`);
          console.log(`  ${colors.red}❌ ${varName}${colors.reset} - Not set`);
        } else {
          // In development, private vars are optional
          if (!isPublic && groupKey === 'private') {
            warnings.push(`⚠️  ${varName} is not set (optional in development)`);
            console.log(`  ${colors.yellow}⚠️  ${varName}${colors.reset} - Not set (optional)`);
          } else {
            errors.push(`❌ ${varName} is not set`);
            console.log(`  ${colors.red}❌ ${varName}${colors.reset} - Not set`);
          }
        }
      } else {
        // Validate format
        if (varName.includes('URL') && !value.startsWith('http')) {
          warnings.push(`⚠️  ${varName} doesn't look like a valid URL`);
          console.log(`  ${colors.yellow}⚠️  ${varName}${colors.reset} - Invalid URL format`);
        } else if (varName === 'CRON_SECRET' && value.length < 32) {
          warnings.push(`⚠️  ${varName} should be at least 32 characters for security`);
          console.log(`  ${colors.yellow}⚠️  ${varName}${colors.reset} - Too short (${value.length} chars)`);
        } else {
          console.log(`  ${colors.green}✅ ${varName}${colors.reset} - Set`);
        }
      }
    });
    
    console.log('');
  });
  
  // Check for .env.local file
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envLocalPath) && !isCI) {
    info.push('💡 No .env.local file found. Create one from .env.example');
  }
  
  // Summary
  console.log(`${colors.blue}📊 Summary:${colors.reset}`);
  console.log(`  Total variables checked: ${Object.values(envGroups).reduce((sum, g) => sum + g.vars.length, 0)}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  
  if (info.length > 0) {
    console.log(`\n${colors.blue}💡 Information:${colors.reset}`);
    info.forEach(msg => console.log(`  ${msg}`));
  }
  
  if (warnings.length > 0) {
    console.log(`\n${colors.yellow}⚠️  Warnings:${colors.reset}`);
    warnings.forEach(msg => console.log(`  ${msg}`));
  }
  
  if (errors.length > 0) {
    console.log(`\n${colors.red}❌ Errors:${colors.reset}`);
    errors.forEach(msg => console.log(`  ${msg}`));
    console.log(`\n${colors.red}Environment validation failed!${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`\n${colors.green}✅ Environment validation passed!${colors.reset}`);
}

// Run validation
validateEnvironment();