#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'debug';

import { MCPClient } from '@/lib/mcp-client';

async function testParameterTypeValidation() {
  console.log('🔍 Testing MCP Parameter Type Validation');
  console.log('Can MCP detect when a parameter should be an array but is given an object?');
  console.log('==========================================================================\n');

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

    // Test different node types that might have array/object requirements
    const testCases = [
      {
        name: "HTTP Request with headers (should be object)",
        nodeType: "n8n-nodes-base.httpRequest",
        validParams: {
          url: "https://api.example.com",
          method: "GET",
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" }
            ]
          }
        },
        invalidParams: {
          url: "https://api.example.com",
          method: "GET",
          headerParameters: {
            "Content-Type": "application/json"  // Wrong: should be array of objects
          }
        }
      },
      {
        name: "Set node with values (should be array)",
        nodeType: "n8n-nodes-base.set",
        validParams: {
          values: {
            values: [
              { name: "field1", value: "value1" },
              { name: "field2", value: "value2" }
            ]
          }
        },
        invalidParams: {
          values: {
            field1: "value1",  // Wrong: should be array
            field2: "value2"
          }
        }
      },
      {
        name: "Function node with items manipulation",
        nodeType: "n8n-nodes-base.function",
        validParams: {
          functionCode: "return items;"
        },
        invalidParams: {
          functionCode: { code: "return items;" }  // Wrong: should be string, not object
        }
      }
    ];

    for (const testCase of testCases) {
      console.log(`\nTest: ${testCase.name}`);
      console.log('━'.repeat(60));
      
      // Test valid parameters
      console.log('\n✅ Testing VALID parameters:');
      console.log('Parameters:', JSON.stringify(testCase.validParams, null, 2));
      
      try {
        const validResult = await mcpClient.callTool("validate_node_operation", {
          nodeType: testCase.nodeType,
          config: testCase.validParams,
          profile: "runtime"
        });

        if (validResult?.content?.[0]?.type === "text") {
          const text = validResult.content[0].text;
          console.log('\nValidation response:', text.substring(0, 200));
          
          try {
            const parsed = JSON.parse(text);
            console.log('Result: Valid =', parsed.valid || parsed.isValid || false);
            if (parsed.errors?.length > 0) {
              console.log('Errors:', parsed.errors);
            }
          } catch (e) {
            // Not JSON, likely an error message
            const isError = text.toLowerCase().includes('error');
            console.log('Result: Valid =', !isError);
            if (isError) {
              console.log('Error message:', text);
            }
          }
        }
      } catch (error: any) {
        console.log('Validation failed:', error.message);
      }

      // Test invalid parameters
      console.log('\n❌ Testing INVALID parameters (wrong type):');
      console.log('Parameters:', JSON.stringify(testCase.invalidParams, null, 2));
      
      try {
        const invalidResult = await mcpClient.callTool("validate_node_operation", {
          nodeType: testCase.nodeType,
          config: testCase.invalidParams,
          profile: "runtime"
        });

        if (invalidResult?.content?.[0]?.type === "text") {
          const text = invalidResult.content[0].text;
          console.log('\nValidation response:', text.substring(0, 200));
          
          try {
            const parsed = JSON.parse(text);
            console.log('Result: Valid =', parsed.valid || parsed.isValid || false);
            if (parsed.errors?.length > 0) {
              console.log('🎯 MCP DETECTED THE TYPE ERROR:');
              parsed.errors.forEach((err: any) => {
                console.log('  -', err.message || err);
              });
            } else if (parsed.valid || parsed.isValid) {
              console.log('⚠️  MCP DID NOT DETECT the type mismatch (object vs array)');
            }
          } catch (e) {
            // Not JSON, likely an error message
            const isError = text.toLowerCase().includes('error');
            if (isError) {
              console.log('🎯 MCP DETECTED AN ERROR:');
              console.log('  ', text);
            } else {
              console.log('⚠️  MCP DID NOT DETECT the type mismatch');
            }
          }
        }
      } catch (error: any) {
        console.log('Validation failed:', error.message);
      }
    }

    // Now test with a simulated HTML Extract node structure
    console.log('\n\n' + '='.repeat(60));
    console.log('MAIN TEST: HTML Extract Node Structure');
    console.log('='.repeat(60));
    
    // Since the actual htmlExtract node doesn't exist in MCP, let's test with a Set node
    // which has a similar structure requirement (values must be an array)
    
    const objectNotation = {
      values: {
        sku: "test-sku",
        price: "100",
        description: "test description"
      }
    };
    
    const arrayNotation = {
      values: {
        values: [
          { name: "sku", value: "test-sku" },
          { name: "price", value: "100" },
          { name: "description", value: "test description" }
        ]
      }
    };
    
    console.log('\n1️⃣  Testing OBJECT notation (incorrect):');
    console.log(JSON.stringify(objectNotation, null, 2));
    
    try {
      const result = await mcpClient.callTool("validate_node_operation", {
        nodeType: "n8n-nodes-base.set",
        config: objectNotation,
        profile: "runtime"
      });
      
      if (result?.content?.[0]?.type === "text") {
        const text = result.content[0].text;
        try {
          const parsed = JSON.parse(text);
          if (!parsed.valid && parsed.errors?.length > 0) {
            console.log('\n✅ MCP CORRECTLY DETECTED THE ERROR:');
            parsed.errors.forEach((err: any) => {
              console.log('  -', err.message || err);
            });
          } else if (parsed.valid) {
            console.log('\n❌ MCP DID NOT DETECT the object vs array issue');
          }
        } catch (e) {
          if (text.toLowerCase().includes('error')) {
            console.log('\n✅ MCP DETECTED AN ERROR:', text);
          }
        }
      }
    } catch (error: any) {
      console.log('Validation error:', error.message);
    }
    
    console.log('\n2️⃣  Testing ARRAY notation (correct):');
    console.log(JSON.stringify(arrayNotation, null, 2));
    
    try {
      const result = await mcpClient.callTool("validate_node_operation", {
        nodeType: "n8n-nodes-base.set",
        config: arrayNotation,
        profile: "runtime"
      });
      
      if (result?.content?.[0]?.type === "text") {
        const text = result.content[0].text;
        try {
          const parsed = JSON.parse(text);
          if (parsed.valid || parsed.isValid) {
            console.log('\n✅ MCP validated the correct array structure');
          } else if (parsed.errors?.length > 0) {
            console.log('\n⚠️  Unexpected errors for valid structure:');
            parsed.errors.forEach((err: any) => {
              console.log('  -', err.message || err);
            });
          }
        } catch (e) {
          if (!text.toLowerCase().includes('error')) {
            console.log('\n✅ No errors for correct structure');
          } else {
            console.log('\n⚠️  Unexpected error:', text);
          }
        }
      }
    } catch (error: any) {
      console.log('Validation error:', error.message);
    }

    // Disconnect
    await mcpClient.disconnect();
    console.log('\n\n✅ Test completed');
    
    console.log('\n📊 SUMMARY:');
    console.log('The MCP validation tool\'s ability to detect object vs array type mismatches');
    console.log('depends on how the node\'s schema is defined in the MCP server.');
    console.log('If the schema strictly defines a parameter as an array type, it should catch it.');
    console.log('However, if the schema is loosely defined, it may not detect the mismatch.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testParameterTypeValidation().catch(console.error);