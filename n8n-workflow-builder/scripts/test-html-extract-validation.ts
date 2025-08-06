#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'debug';

import { MCPClient } from '@/lib/mcp-client';

// The problematic HTML Extract node structure from the user
const problematicNode = {
  "id": "node_3",
  "name": "Extract Product Data",
  "type": "n8n-nodes-base.htmlExtract",
  "onError": "continueRegularOutput",
  "position": [850, 300],
  "parameters": {
    "sourceData": "json",
    "dataPropertyName": "data",
    "extractionValues": {
      "sku": {
        "attribute": "text",
        "cssSelector": "[data-sku], .sku, .product-id",
        "returnArray": false
      },
      "price": {
        "attribute": "text",
        "cssSelector": ".price, .product-price, [data-testid*='price'], .cost, .amount",
        "returnArray": false
      },
      "description": {
        "attribute": "text",
        "cssSelector": ".description, .product-description, .product-details, .summary",
        "returnArray": false
      },
      "availability": {
        "attribute": "text",
        "cssSelector": ".stock, .availability, .in-stock, .out-of-stock",
        "returnArray": false
      },
      "product_name": {
        "attribute": "text",
        "cssSelector": "h1, .product-title, .product-name, [data-testid*='product-title']",
        "returnArray": false
      }
    }
  },
  "typeVersion": 1
};

// Correct structure (should use array notation for extractionValues.values)
const correctNode = {
  "id": "node_3",
  "name": "Extract Product Data",
  "type": "n8n-nodes-base.htmlExtract",
  "onError": "continueRegularOutput",
  "position": [850, 300],
  "parameters": {
    "sourceData": "json",
    "dataPropertyName": "data",
    "extractionValues": {
      "values": [
        {
          "key": "sku",
          "attribute": "text",
          "cssSelector": "[data-sku], .sku, .product-id",
          "returnArray": false
        },
        {
          "key": "price",
          "attribute": "text",
          "cssSelector": ".price, .product-price, [data-testid*='price'], .cost, .amount",
          "returnArray": false
        },
        {
          "key": "description",
          "attribute": "text",
          "cssSelector": ".description, .product-description, .product-details, .summary",
          "returnArray": false
        },
        {
          "key": "availability",
          "attribute": "text",
          "cssSelector": ".stock, .availability, .in-stock, .out-of-stock",
          "returnArray": false
        },
        {
          "key": "product_name",
          "attribute": "text",
          "cssSelector": "h1, .product-title, .product-name, [data-testid*='product-title']",
          "returnArray": false
        }
      ]
    }
  },
  "typeVersion": 1
};

async function testValidation() {
  console.log('🔍 Testing HTML Extract Node Validation');
  console.log('=========================================\n');

  try {
    // Initialize MCP client
    const mcpClient = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL || "https://mcp.smithery.ai",
      apiKey: process.env.MCP_API_KEY || "",
      profile: process.env.MCP_PROFILE || "default",
    });

    // Connect to MCP server
    console.log('📡 Connecting to MCP server...');
    await mcpClient.connect();
    console.log('✅ Connected to MCP server\n');

    // Test 1: Validate the problematic node structure
    console.log('Test 1: Validating PROBLEMATIC node structure (object notation)');
    console.log('----------------------------------------------------------------');
    console.log('Structure: extractionValues as object with direct properties\n');
    
    try {
      const problemValidation = await mcpClient.validateNodeOperation(
        'n8n-nodes-base.htmlExtract',
        problematicNode.parameters,
        'runtime'
      );

      console.log('Raw response:', problemValidation.content[0].text);
      
      let result;
      try {
        result = JSON.parse(problemValidation.content[0].text);
      } catch (parseError) {
        // If it's not JSON, it might be an error message
        console.log('  ❌ MCP returned an error:');
        console.log('    ', problemValidation.content[0].text);
        result = { valid: false, errors: [problemValidation.content[0].text] };
      }
      
      console.log('Validation result:');
      console.log('  Valid:', result.valid || result.isValid || false);
      
      if (result.errors && result.errors.length > 0) {
        console.log('  ❌ Errors found:');
        result.errors.forEach((error: any) => {
          console.log(`    - ${error.message || error}`);
        });
      } else if (!result.valid && !result.isValid) {
        console.log('  ❌ Validation failed but no specific errors provided');
      } else {
        console.log('  ✅ No errors found (MCP did NOT catch the issue!)');
      }
      
      if (result.warnings && result.warnings.length > 0) {
        console.log('  ⚠️  Warnings:');
        result.warnings.forEach((warning: any) => {
          console.log(`    - ${warning.message || warning}`);
        });
      }
    } catch (error) {
      console.log('  ❌ Validation call failed:', error);
    }

    console.log('\n');

    // Test 2: Validate the correct node structure
    console.log('Test 2: Validating CORRECT node structure (array notation)');
    console.log('-----------------------------------------------------------');
    console.log('Structure: extractionValues.values as array\n');
    
    try {
      const correctValidation = await mcpClient.validateNodeOperation(
        'n8n-nodes-base.htmlExtract',
        correctNode.parameters,
        'runtime'
      );

      console.log('Raw response:', correctValidation.content[0].text);
      
      let result;
      try {
        result = JSON.parse(correctValidation.content[0].text);
      } catch (parseError) {
        // If it's not JSON, it might be an error message
        console.log('  ❌ MCP returned an error:');
        console.log('    ', correctValidation.content[0].text);
        result = { valid: false, errors: [correctValidation.content[0].text] };
      }
      
      console.log('Validation result:');
      console.log('  Valid:', result.valid || result.isValid || false);
      
      if (result.errors && result.errors.length > 0) {
        console.log('  ❌ Errors found:');
        result.errors.forEach((error: any) => {
          console.log(`    - ${error.message || error}`);
        });
      } else {
        console.log('  ✅ No errors found');
      }
      
      if (result.warnings && result.warnings.length > 0) {
        console.log('  ⚠️  Warnings:');
        result.warnings.forEach((warning: any) => {
          console.log(`    - ${warning.message || warning}`);
        });
      }
    } catch (error) {
      console.log('  ❌ Validation call failed:', error);
    }

    console.log('\n');

    // Test 3: Validate as part of a workflow
    console.log('Test 3: Validating as part of a complete workflow');
    console.log('--------------------------------------------------');
    
    const workflow = {
      name: "Test HTML Extract Workflow",
      nodes: [
        {
          id: "node_1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          position: [250, 300],
          parameters: {
            path: "/test",
            httpMethod: "POST"
          },
          typeVersion: 1.1
        },
        problematicNode
      ],
      connections: {
        "node_1": {
          "main": [
            [
              {
                "node": "node_3",
                "type": "main",
                "index": 0
              }
            ]
          ]
        }
      },
      settings: {
        executionOrder: "v1"
      }
    };

    try {
      const workflowValidation = await mcpClient.validateWorkflow(workflow);
      const result = JSON.parse(workflowValidation.content[0].text);
      
      console.log('Workflow validation result:');
      console.log('  Valid:', result.valid || false);
      console.log('  Total errors:', result.errors?.length || 0);
      console.log('  Total warnings:', result.warnings?.length || 0);
      
      if (result.errors && result.errors.length > 0) {
        console.log('\n  ❌ Errors found:');
        result.errors.forEach((error: any, index: number) => {
          console.log(`\n  Error ${index + 1}:`);
          if (error.node) console.log(`    Node: ${error.node}`);
          if (error.field) console.log(`    Field: ${error.field}`);
          if (error.message) console.log(`    Message: ${error.message}`);
          if (error.details) console.log(`    Details: ${JSON.stringify(error.details)}`);
        });
      } else {
        console.log('  ✅ No errors found (MCP did NOT catch the issue!)');
      }
    } catch (error) {
      console.log('  ❌ Workflow validation call failed:', error);
    }

    // Disconnect
    await mcpClient.disconnect();
    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testValidation().catch(console.error);