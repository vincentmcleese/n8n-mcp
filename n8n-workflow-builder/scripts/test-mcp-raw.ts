#!/usr/bin/env tsx

/**
 * Test raw MCP response to see actual structure
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';

async function testRawMCP() {
  const { MCPClient } = await import('@/lib/mcp-client');
  
  console.log(chalk.bold.blue('\n🔍 Testing Raw MCP Response\n'));
  
  try {
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL!,
      apiKey: process.env.MCP_API_KEY!,
      profile: process.env.MCP_PROFILE!
    });
    
    await mcpClient.connect();
    console.log(chalk.green('✅ MCP connected\n'));
    
    // Test search for 'csv' which we know works
    console.log(chalk.cyan('Testing search for "csv":'));
    const result = await mcpClient.searchNodes({ query: 'csv', limit: 5 });
    
    console.log(chalk.yellow('\nRaw result structure:'));
    console.log('Type:', typeof result);
    console.log('Has content?:', !!result?.content);
    
    if (result?.content) {
      console.log('Content length:', result.content.length);
      
      if (result.content.length > 0) {
        const firstContent = result.content[0];
        console.log('\nFirst content item:');
        console.log('  Type:', firstContent.type);
        console.log('  Has text?:', !!firstContent.text);
        
        if (firstContent.text) {
          console.log('\nText content (first 500 chars):');
          console.log(firstContent.text.substring(0, 500));
          
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(firstContent.text);
            console.log('\n✅ Successfully parsed as JSON');
            console.log('Parsed type:', typeof parsed);
            console.log('Is array?:', Array.isArray(parsed));
            
            if (parsed.results) {
              console.log('\n🎯 Found results property!');
              console.log('Results is array?:', Array.isArray(parsed.results));
              console.log('Results count:', parsed.results.length);
              
              if (parsed.results.length > 0) {
                console.log('\nFirst result:');
                console.log(JSON.stringify(parsed.results[0], null, 2));
              }
            } else if (Array.isArray(parsed)) {
              console.log('Parsed is directly an array with', parsed.length, 'items');
              if (parsed.length > 0) {
                console.log('\nFirst item:');
                console.log(JSON.stringify(parsed[0], null, 2));
              }
            } else {
              console.log('\nParsed object keys:', Object.keys(parsed));
            }
          } catch (e) {
            console.log(chalk.red('❌ Failed to parse as JSON:'), e);
          }
        }
      }
    } else {
      console.log(chalk.red('No content in result'));
    }
    
    // Also test a search that might not work
    console.log(chalk.cyan('\n\nTesting search for "mongodb":'));
    const result2 = await mcpClient.searchNodes({ query: 'mongodb', limit: 5 });
    
    if (result2?.content?.length > 0 && result2.content[0].text) {
      try {
        const parsed = JSON.parse(result2.content[0].text);
        if (parsed.results) {
          console.log(chalk.green(`✅ Found ${parsed.results.length} results for "mongodb"`));
        } else if (Array.isArray(parsed)) {
          console.log(chalk.green(`✅ Found ${parsed.length} results for "mongodb"`));
        } else {
          console.log(chalk.yellow('Unexpected structure:'), Object.keys(parsed));
        }
      } catch (e) {
        console.log(chalk.red('Failed to parse'));
      }
    } else {
      console.log(chalk.red('No results for "mongodb"'));
    }
    
    await mcpClient.disconnect();
    console.log(chalk.bold.green('\n✨ Test complete!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    process.exit(1);
  }
}

testRawMCP().catch(console.error);