#!/usr/bin/env tsx

/**
 * MCP List Nodes Test
 * 
 * Tests if list_nodes works even though search_nodes is broken
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

async function testMCPList() {
  const { MCPClient } = await import('@/lib/mcp-client');
  
  console.log(chalk.bold.blue('\n🔍 Testing MCP list_nodes\n'));
  
  try {
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL!,
      apiKey: process.env.MCP_API_KEY!,
      profile: process.env.MCP_PROFILE!
    });
    
    await mcpClient.connect();
    console.log(chalk.green('✅ MCP connected\n'));
    
    // Try list_nodes without category
    console.log(chalk.cyan('Testing list_nodes (no category):'));
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
        console.log(chalk.green(`✅ Found ${nodes.length} nodes`));
        nodes.slice(0, 5).forEach((node: any) => {
          console.log(chalk.gray(`   - ${node.nodeType || node.type}: ${node.displayName || node.name || 'unknown'}`));
        });
      } else {
        console.log(chalk.red('❌ No nodes returned'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`));
    }
    
    // Try list_ai_tools
    console.log(chalk.cyan('\nTesting list_ai_tools:'));
    try {
      const result = await mcpClient.listAITools();
      
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
        console.log(chalk.green(`✅ Found ${nodes.length} AI-capable nodes`));
        nodes.slice(0, 5).forEach((node: any) => {
          console.log(chalk.gray(`   - ${node.nodeType || node.type}: ${node.displayName || node.name || 'unknown'}`));
        });
      } else {
        console.log(chalk.red('❌ No AI nodes returned'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`));
    }
    
    // Try list_node_types
    console.log(chalk.cyan('\nTesting list_node_types:'));
    try {
      const result = await mcpClient.listNodeTypes();
      
      let types: any[] = [];
      if (result && result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            const data = JSON.parse(content.text);
            types = data.nodeTypes || data || [];
            if (!Array.isArray(types)) types = [];
          } catch {
            types = [];
          }
        }
      }
      
      if (types.length > 0) {
        console.log(chalk.green(`✅ Found ${types.length} node types`));
        // Show some examples
        const examples = types.slice(0, 10);
        examples.forEach((type: any) => {
          const typeStr = typeof type === 'string' ? type : (type.type || type.nodeType || 'unknown');
          console.log(chalk.gray(`   - ${typeStr}`));
        });
        if (types.length > 10) {
          console.log(chalk.gray(`   ... and ${types.length - 10} more`));
        }
      } else {
        console.log(chalk.red('❌ No node types returned'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`));
    }
    
    await mcpClient.disconnect();
    console.log(chalk.bold.green('\n✨ Test complete!\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    process.exit(1);
  }
}

testMCPList().catch(console.error);