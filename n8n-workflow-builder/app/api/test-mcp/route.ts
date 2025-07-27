import { NextRequest, NextResponse } from 'next/server';
import MCPClient from '@/lib/mcp-client';
import { connectWithRetry, MCPCacheManager, MCPErrorRecovery } from '@/lib/mcp-error-handler';

/**
 * GET /api/test-mcp
 * Test MCP connection and list available tools
 * 
 * This is a temporary endpoint for testing MCP integration
 * Should be removed before production deployment
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cache = new MCPCacheManager();
  
  try {
    // Check cache first (fallback strategy)
    const cacheKey = 'mcp_tools_list';
    const cachedTools = cache.get(cacheKey);
    
    if (cachedTools) {
      console.log('Returning cached MCP tools');
      return NextResponse.json({
        success: true,
        source: 'cache',
        toolCount: cachedTools.length,
        tools: cachedTools,
        responseTime: Date.now() - startTime,
        cache: {
          hit: true,
          age: 'fresh'
        }
      });
    }

    // Initialize MCP client
    const mcp = MCPClient.getInstance({
      serverUrl: process.env.MCP_SERVER_URL!,
      apiKey: process.env.MCP_API_KEY!,
      profile: process.env.MCP_PROFILE!,
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 10000 // 10 seconds for test
    });

    // Connect with retry logic
    await connectWithRetry(mcp, 3, 1000);
    
    // Get connection status
    const status = mcp.getConnectionStatus();
    
    // List available tools
    const toolsResult = await mcp.listTools();
    const tools = toolsResult.tools.map(t => ({
      name: t.name,
      description: t.description
    }));
    
    // Cache the results
    cache.set(cacheKey, tools);
    
    // Health check
    const isHealthy = await mcp.healthCheck();
    
    // Test specific tools from PRD
    const expectedTools = [
      'search_nodes', 'get_node_info', 'list_node_types',
      'get_node_essentials', 'get_node_schema', 'validate_params',
      'validate_workflow', 'check_connections', 'get_input_schema',
      'get_output_schema', 'generate_workflow', 'optimize_workflow'
    ];
    
    const missingTools = expectedTools.filter(
      expected => !tools.some(t => t.name === expected)
    );
    
    const response = {
      success: true,
      source: 'live',
      toolCount: tools.length,
      tools: tools,
      connection: {
        status: status.isConnected ? 'connected' : 'disconnected',
        transport: status.transportType,
        attempts: status.connectionAttempts,
        healthy: isHealthy
      },
      validation: {
        expectedTools: expectedTools.length,
        foundTools: expectedTools.length - missingTools.length,
        missingTools: missingTools,
        compliant: missingTools.length === 0
      },
      performance: {
        responseTime: Date.now() - startTime,
        withinTarget: (Date.now() - startTime) < 500 // PRD target
      },
      cache: {
        hit: false,
        age: 'new'
      }
    };
    
    // Log performance metrics
    console.log(`MCP test completed in ${response.performance.responseTime}ms`);
    
    return NextResponse.json(response);
    
  } catch (error) {
    const errorRecovery = MCPErrorRecovery.getRecoveryStrategy(error as Error);
    
    MCPErrorRecovery.logError(error as Error, {
      operation: 'test_mcp_connection',
      endpoint: '/api/test-mcp'
    });
    
    // Try cache fallback
    if (errorRecovery.action === 'use_cache') {
      const cachedTools = cache.get('mcp_tools_list');
      if (cachedTools) {
        return NextResponse.json({
          success: false,
          source: 'cache_fallback',
          toolCount: cachedTools.length,
          tools: cachedTools,
          error: MCPErrorRecovery.createUserMessage(error as Error),
          recovery: errorRecovery,
          responseTime: Date.now() - startTime
        }, { status: 200 }); // 200 because we have fallback data
      }
    }
    
    return NextResponse.json({
      success: false,
      error: MCPErrorRecovery.createUserMessage(error as Error),
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
      recovery: errorRecovery,
      responseTime: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * DELETE /api/test-mcp
 * Clean up MCP connection (for testing)
 */
export async function DELETE(request: NextRequest) {
  try {
    const mcp = MCPClient.getInstance();
    await mcp.disconnect();
    
    return NextResponse.json({
      success: true,
      message: 'MCP connection closed'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to disconnect MCP client'
    }, { status: 500 });
  }
}