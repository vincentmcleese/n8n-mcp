#!/usr/bin/env ts-node
/**
 * Test tool calling for web scraping scenario
 * This should trigger MCP tool calls for complex HTML node configuration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Now we can import services that depend on env vars
import { WorkflowRunner } from '../lib/workflow-runner';
import { loggers, LogLevel } from '../lib/utils/logger';

// Ensure we have verbose logging to see tool calls
loggers.claude.setLevel(LogLevel.INFO);
loggers.tools.setLevel(LogLevel.INFO);
loggers.mcp.setLevel(LogLevel.INFO);

async function testWebScrapingWorkflow() {
  const runner = new WorkflowRunner();
  
  const request = {
    description: "Create a webhook that scrapes all product data from our HTML website and saves it to CSV. The webhook should extract product names, prices, descriptions, and images from the product listing page."
  };

  console.log('\n📋 Test Request:', request.description);
  console.log('\n🔍 Watch for tool calling logs (🔧 symbols)...\n');
  console.log('=' . repeat(80));
  
  try {
    const result = await runner.run(request);
    
    console.log('\n' + '=' . repeat(80));
    console.log('\n✅ Workflow generated successfully');
    console.log('\nWorkflow Summary:');
    console.log('- Nodes:', result.workflow.nodes.length);
    console.log('- Connections:', result.workflow.connections.length);
    
    // Check if HTML node was configured with advanced properties
    const htmlNode = result.workflow.nodes.find((n: any) => n.type.includes('Html') || n.type.includes('html'));
    if (htmlNode) {
      console.log('\n🌐 HTML Node Configuration:');
      console.log('- Type:', htmlNode.type);
      console.log('- Properties configured:', Object.keys(htmlNode.parameters || {}).length);
      console.log('- Parameters:', JSON.stringify(htmlNode.parameters, null, 2));
    }
    
    // Save result for inspection
    const fs = await import('fs/promises');
    const outputPath = path.join(__dirname, 'test-outputs', `web-scraping-test-${new Date().toISOString()}.json`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Full result saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testWebScrapingWorkflow().catch(console.error);