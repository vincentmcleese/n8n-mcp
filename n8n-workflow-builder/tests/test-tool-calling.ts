#!/usr/bin/env tsx

/**
 * Test for Tool Calling in Configuration Phase
 * 
 * This test specifically checks if Claude calls MCP tools when configuring
 * complex nodes that require additional property research.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables BEFORE any module imports
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment with INFO level to see tool calls
process.env.NODE_ENV = 'test';
process.env.BUILD_WORKFLOW = 'true';
process.env.LOG_LEVEL = 'info'; // INFO level shows tool calls

import chalk from 'chalk';

// Test scenario that should trigger tool calls
const COMPLEX_SCRAPING_SCENARIO = {
  name: "Complex HTML Scraping with Authentication",
  prompt: "Create a webhook that scrapes all product data from our HTML website and saves it to CSV. The webhook should extract product names, prices, descriptions, and images from the product listing page, handle pagination, and use authentication headers.",
  discoveryOutput: {
    taskNodes: [{
      id: 'task_webhook_1',
      type: 'n8n-nodes-base.webhook',
      displayName: 'Webhook',
      purpose: 'Pre-configured: receive_webhook',
      isPreConfigured: true,
      config: { httpMethod: 'POST', path: 'webhook-scrape' }
    }],
    searchNodes: [
      {
        id: 'search_html_1',
        type: 'n8n-nodes-base.htmlExtract',
        displayName: 'HTML Extract',
        purpose: 'Extract data from HTML pages with CSS selectors, pagination, and authentication',
        category: 'extraction',
        isPreConfigured: false
      },
      {
        id: 'search_http_1',
        type: 'n8n-nodes-base.httpRequest',
        displayName: 'HTTP Request',
        purpose: 'Fetch HTML pages with authentication headers and retry logic',
        category: 'http',
        isPreConfigured: false
      },
      {
        id: 'search_csv_1',
        type: 'n8n-nodes-base.spreadsheetFile',
        displayName: 'Spreadsheet File',
        purpose: 'Save extracted data to CSV format',
        category: 'file',
        isPreConfigured: false
      }
    ]
  }
};

async function testToolCalling() {
  console.log(chalk.bold.blue('\n🔧 Tool Calling Test for Configuration Phase\n'));
  console.log(chalk.yellow('⚠️  Using REAL Claude API and MCP services'));
  console.log(chalk.cyan('🔍 Watch for tool calling logs (look for 🔧 symbols)...\n'));
  console.log('='.repeat(80));
  
  try {
    // Dynamic import to ensure env vars are loaded first
    const { WorkflowOrchestrator } = await import('@/lib/workflow-orchestrator');
    
    // Create orchestrator
    const orchestrator = new WorkflowOrchestrator();
    const sessionId = `test_tools_${Date.now()}`;
    
    console.log(chalk.gray(`\n📋 Test Scenario: ${COMPLEX_SCRAPING_SCENARIO.name}`));
    console.log(chalk.gray(`📝 Prompt: "${COMPLEX_SCRAPING_SCENARIO.prompt}"`));
    
    // Initialize session
    await orchestrator.sessionRepo.initialize(sessionId, COMPLEX_SCRAPING_SCENARIO.prompt);
    
    // Prepare discovered nodes
    const allNodes = [
      ...COMPLEX_SCRAPING_SCENARIO.discoveryOutput.taskNodes,
      ...COMPLEX_SCRAPING_SCENARIO.discoveryOutput.searchNodes
    ];
    
    // Create operations to simulate discovery phase
    const operations: any[] = [];
    
    // Add discovered nodes
    for (const node of allNodes) {
      operations.push({
        type: 'discoverNode',
        node: {
          id: node.id,
          type: node.type,
          displayName: node.displayName,
          purpose: node.purpose,
          category: node.category,
          isPreConfigured: node.isPreConfigured,
          config: node.config
        }
      });
    }
    
    // Select all nodes
    for (const node of allNodes) {
      operations.push({
        type: 'selectNode',
        nodeId: node.id
      });
    }
    
    // Mark discovery as complete
    operations.push({
      type: 'completePhase',
      phase: 'discovery'
    });
    
    // Persist operations
    await orchestrator.sessionRepo.persistOperations(sessionId, operations);
    await orchestrator.sessionRepo.save(sessionId);
    
    console.log(chalk.cyan(`\n🚀 Running configuration phase...`));
    console.log(chalk.cyan(`   Nodes to configure: ${allNodes.length}`));
    console.log(chalk.cyan(`   - Pre-configured (skipped): ${COMPLEX_SCRAPING_SCENARIO.discoveryOutput.taskNodes.length}`));
    console.log(chalk.cyan(`   - Need configuration: ${COMPLEX_SCRAPING_SCENARIO.discoveryOutput.searchNodes.length}`));
    
    console.log(chalk.yellow('\n📊 Tool Call Monitoring Started...\n'));
    console.log('='.repeat(80));
    
    // Run configuration phase
    const startTime = Date.now();
    const result = await orchestrator.runConfigurationPhase(sessionId);
    const duration = Date.now() - startTime;
    
    console.log('='.repeat(80));
    
    if (result.success) {
      console.log(chalk.green(`\n✅ Configuration completed in ${duration}ms`));
      
      // Check configured nodes
      if (result.configured && result.configured.length > 0) {
        console.log(chalk.cyan('\n📦 Configured Nodes:'));
        for (const node of result.configured) {
          const isComplex = node.type.includes('html') || node.type.includes('Html');
          const icon = isComplex ? '🌐' : '📄';
          console.log(chalk.gray(`   ${icon} ${node.type}:`));
          
          // Show key parameters
          if (node.parameters) {
            const params = Object.keys(node.parameters);
            if (params.length > 0) {
              console.log(chalk.gray(`      Parameters: ${params.slice(0, 5).join(', ')}${params.length > 5 ? '...' : ''}`));
            }
          }
          
          // Check for authentication or advanced properties
          if (node.parameters?.authentication || node.parameters?.headers || node.parameters?.options) {
            console.log(chalk.yellow(`      ⚡ Advanced properties configured!`));
          }
        }
      }
      
      // Analysis
      console.log(chalk.blue('\n📈 Tool Calling Analysis:'));
      console.log(chalk.gray('   If Claude needed additional node properties for complex configurations,'));
      console.log(chalk.gray('   you should have seen log entries like:'));
      console.log(chalk.gray('   - [Claude] 🔧 Claude requesting 1 tool(s): search_node_properties'));
      console.log(chalk.gray('   - [Tools] 🔧 Tool called: search_node_properties'));
      console.log(chalk.gray('   - [Tools] ✅ Tool search_node_properties completed'));
      
      // Save result for inspection
      const fs = await import('fs/promises');
      const outputPath = path.join(__dirname, 'test-outputs', `tool-calling-test-${new Date().toISOString().replace(/:/g, '-')}.json`);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
      console.log(chalk.gray(`\n💾 Full result saved to: ${outputPath}`));
      
    } else {
      console.log(chalk.red(`\n❌ Configuration failed: ${result.error?.message}`));
    }
    
    console.log(chalk.blue('\n📝 Summary:'));
    console.log(chalk.gray('   Tool calling is working if you saw 🔧 symbols in the logs above.'));
    console.log(chalk.gray('   If no tools were called, it may mean:'));
    console.log(chalk.gray('   1. The node essentials already contained all needed properties'));
    console.log(chalk.gray('   2. Claude determined the basic configuration was sufficient'));
    console.log(chalk.gray('   3. The prompt didn\'t require advanced properties'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed with error:'), error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testToolCalling()
    .then(() => {
      console.log(chalk.green('\n✨ Test completed successfully!'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('\n❌ Test failed:'), error);
      process.exit(1);
    });
}