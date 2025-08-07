#!/usr/bin/env tsx

/**
 * MCP Search Diagnostic Script
 * 
 * Tests the MCP search functionality to understand:
 * - What search terms work vs don't work
 * - How the search behaves (case sensitivity, partial matches, etc.)
 * - What nodes are actually available in the database
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise

async function testMCPSearch() {
  // Dynamic imports after env is loaded
  const { MCPClient } = await import('@/lib/mcp-client');
  const { isMCPConfigured } = await import('@/lib/config');
  
  console.log(chalk.bold.blue('\n🔍 MCP Search Diagnostic Tool\n'));
  
  // Check configuration
  if (!isMCPConfigured()) {
    console.error(chalk.red('❌ MCP not configured. Set MCP_SERVER_URL, MCP_API_KEY, and MCP_PROFILE in .env.local'));
    process.exit(1);
  }
  
  try {
    // Connect to MCP
    console.log(chalk.gray('Connecting to MCP server...'));
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL!,
      apiKey: process.env.MCP_API_KEY!,
      profile: process.env.MCP_PROFILE!
    });
    
    await mcpClient.connect();
    console.log(chalk.green('✅ MCP connected\n'));
    
    // Get database statistics
    console.log(chalk.bold.cyan('📊 Database Statistics:'));
    try {
      const stats = await mcpClient.callTool('get_database_statistics', {});
      const statsData = JSON.parse(stats?.content?.[0]?.text || '{}');
      console.log(chalk.gray(`   Total nodes: ${statsData.totalNodes || 'unknown'}`));
      console.log(chalk.gray(`   Categories: ${statsData.categories?.length || 'unknown'}`));
      console.log();
    } catch (e) {
      console.log(chalk.yellow('   Could not fetch statistics'));
    }
    
    // Test search terms - search by functionality keywords
    console.log(chalk.bold.cyan('🧪 Testing Search Terms (Functionality Keywords):\n'));
    
    const testTerms = [
      // Functionality terms
      { term: 'execute code', description: 'Code execution functionality' },
      { term: 'run javascript', description: 'JavaScript execution' },
      { term: 'make http request', description: 'HTTP request functionality' },
      { term: 'receive webhook', description: 'Webhook receiving' },
      { term: 'trigger webhook', description: 'Webhook trigger' },
      { term: 'set data', description: 'Setting/manipulating data' },
      
      // Database functionality
      { term: 'query mongodb', description: 'MongoDB querying' },
      { term: 'insert mongodb', description: 'MongoDB insertion' },
      { term: 'query database', description: 'Database querying' },
      { term: 'query postgres', description: 'PostgreSQL queries' },
      { term: 'mysql query', description: 'MySQL queries' },
      
      // Data processing functionality
      { term: 'parse json', description: 'JSON parsing' },
      { term: 'process csv', description: 'CSV processing' },
      { term: 'read excel', description: 'Excel reading' },
      { term: 'parse xml', description: 'XML parsing' },
      { term: 'transform data', description: 'Data transformation' },
      
      // Validation functionality
      { term: 'validate data', description: 'Data validation' },
      { term: 'check schema', description: 'Schema checking' },
      { term: 'conditional logic', description: 'Conditional processing' },
      { term: 'route data', description: 'Data routing' },
      
      // Communication functionality
      { term: 'send slack message', description: 'Slack messaging' },
      { term: 'send email', description: 'Email sending' },
      { term: 'post discord', description: 'Discord posting' },
      { term: 'send notification', description: 'Notifications' },
      
      // File functionality
      { term: 'read file', description: 'File reading' },
      { term: 'upload ftp', description: 'FTP uploading' },
      { term: 'upload s3', description: 'S3 uploading' },
      { term: 'download file', description: 'File downloading' },
      
      // API functionality
      { term: 'call api', description: 'API calling' },
      { term: 'rest api', description: 'REST API' },
      { term: 'graphql query', description: 'GraphQL queries' },
      
      // Single word tests (original)
      { term: 'webhook', description: 'Single word: webhook' },
      { term: 'http', description: 'Single word: http' },
      { term: 'code', description: 'Single word: code' },
      { term: 'mongodb', description: 'Single word: mongodb' },
      { term: 'slack', description: 'Single word: slack' },
    ];
    
    const results: any[] = [];
    
    for (const { term, description } of testTerms) {
      process.stdout.write(chalk.yellow(`   Testing "${term}" (${description})... `));
      
      try {
        const result = await mcpClient.searchNodes({ query: term, limit: 10 });
        
        let nodes: any[] = [];
        if (result && result.content && result.content.length > 0) {
          const content = result.content[0];
          if (content.type === 'text') {
            try {
              nodes = JSON.parse(content.text);
              if (!Array.isArray(nodes)) nodes = [];
            } catch {
              nodes = [];
            }
          }
        }
        
        if (nodes.length > 0) {
          console.log(chalk.green(`✅ Found ${nodes.length} nodes`));
          
          // Show first few node types
          const nodeTypes = nodes.slice(0, 3).map((n: any) => 
            n.nodeType || n.type || 'unknown'
          );
          console.log(chalk.gray(`      Examples: ${nodeTypes.join(', ')}`));
          
          results.push({ term, found: true, count: nodes.length, examples: nodeTypes });
        } else {
          console.log(chalk.red('❌ No results'));
          results.push({ term, found: false, count: 0 });
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`));
        results.push({ term, found: false, error: true });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // List nodes by category
    console.log(chalk.bold.cyan('\n📂 Listing Nodes by Category:\n'));
    
    // First, try to list without category to see all nodes
    console.log(chalk.yellow('   All nodes (no category filter):'));
    try {
      const result = await mcpClient.listNodes({ limit: 10 });
      
      let nodes: any[] = [];
      if (result && result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            nodes = JSON.parse(content.text);
            if (!Array.isArray(nodes)) nodes = [];
          } catch {
            nodes = [];
          }
        }
      }
      
      if (nodes.length > 0) {
        console.log(chalk.green(`      Found ${nodes.length} nodes`));
        const examples = nodes.slice(0, 5).map((n: any) => 
          n.displayName || n.nodeType || n.type || 'unknown'
        );
        console.log(chalk.gray(`      Examples: ${examples.join(', ')}`));
      } else {
        console.log(chalk.red('      No nodes returned'));
      }
    } catch (error) {
      console.log(chalk.red('      Error listing all nodes'));
    }
    
    // Common n8n categories
    const categories = [
      'core',
      'trigger',
      'action',
      'transform',
      'communication',
      'database',
      'file',
      'utility',
      'app', 
      'flow',
      'data'
    ];
    
    for (const category of categories) {
      try {
        const result = await mcpClient.listNodes({ category, limit: 5 });
        
        let nodes: any[] = [];
        if (result && result.content && result.content.length > 0) {
          const content = result.content[0];
          if (content.type === 'text') {
            try {
              nodes = JSON.parse(content.text);
              if (!Array.isArray(nodes)) nodes = [];
            } catch {
              nodes = [];
            }
          }
        }
        
        if (nodes.length > 0) {
          console.log(chalk.yellow(`   ${category}: `) + chalk.green(`${nodes.length} nodes`));
          const examples = nodes.slice(0, 3).map((n: any) => 
            n.displayName || n.nodeType || n.type || 'unknown'
          );
          console.log(chalk.gray(`      Examples: ${examples.join(', ')}`));
        } else {
          console.log(chalk.yellow(`   ${category}: `) + chalk.red('No nodes or category not found'));
        }
      } catch (error) {
        console.log(chalk.yellow(`   ${category}: `) + chalk.red('Error listing'));
      }
    }
    
    // Summary
    console.log(chalk.bold.cyan('\n📈 Summary:\n'));
    
    const working = results.filter(r => r.found);
    const notWorking = results.filter(r => !r.found);
    
    console.log(chalk.green(`   ✅ Working searches: ${working.length}/${results.length}`));
    if (working.length > 0) {
      console.log(chalk.gray(`      Terms: ${working.map(r => r.term).join(', ')}`));
    }
    
    console.log(chalk.red(`   ❌ Failed searches: ${notWorking.length}/${results.length}`));
    if (notWorking.length > 0) {
      console.log(chalk.gray(`      Terms: ${notWorking.map(r => r.term).join(', ')}`));
    }
    
    // Patterns
    console.log(chalk.bold.cyan('\n🔍 Patterns Observed:\n'));
    
    // Check case sensitivity
    const httpLower = results.find(r => r.term === 'http');
    const httpUpper = results.find(r => r.term === 'HTTP');
    if (httpLower && httpUpper) {
      if (httpLower.found !== httpUpper.found) {
        console.log(chalk.yellow('   ⚠️  Search appears to be case-sensitive'));
      } else {
        console.log(chalk.green('   ✅ Search is case-insensitive'));
      }
    }
    
    // Check format variations
    const camelCase = results.find(r => r.term === 'httpRequest');
    const kebabCase = results.find(r => r.term === 'http-request');
    const snakeCase = results.find(r => r.term === 'http_request');
    if (camelCase && kebabCase && snakeCase) {
      const formats = [camelCase, kebabCase, snakeCase];
      const working = formats.filter(f => f.found);
      if (working.length > 0) {
        console.log(chalk.green(`   ✅ Working formats: ${working.map(f => f.term).join(', ')}`));
      }
    }
    
    // Recommendations
    console.log(chalk.bold.cyan('\n💡 Recommendations:\n'));
    
    if (notWorking.some(r => ['mongodb', 'json', 'csv', 'validation'].includes(r.term))) {
      console.log(chalk.yellow('   1. Common terms like "mongodb", "json", "csv" are not finding nodes'));
      console.log(chalk.yellow('      → Consider using fallback to generic nodes like "code" or "function"'));
    }
    
    if (working.some(r => r.term === 'code' || r.term === 'function')) {
      console.log(chalk.green('   2. Generic nodes like "code" and "function" are available'));
      console.log(chalk.green('      → Use these as fallbacks when specific searches fail'));
    }
    
    console.log(chalk.yellow('   3. Consider implementing fuzzy search or synonyms'));
    console.log(chalk.yellow('      → Map "mongodb" to "mongo", "validation" to "if/switch", etc.'));
    
    // Cleanup
    await mcpClient.disconnect();
    console.log(chalk.bold.green('\n✨ Diagnostic complete!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    process.exit(1);
  }
}

// Run the diagnostic
testMCPSearch().catch(console.error);