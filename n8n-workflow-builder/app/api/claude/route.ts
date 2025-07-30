import { NextRequest, NextResponse } from 'next/server';
import { createClaudeService } from '@/lib/services/claude-service';
import { getRequestContext, createApiResponse, logApiOperation } from '@/lib/api-utils';
import type { WorkflowPhase, WorkflowOperation } from '@/types/workflow';

/**
 * POST /api/claude
 * Process workflow requests with Claude AI
 */
export async function POST(request: NextRequest) {
  const { requestId, debugMode } = getRequestContext(request);
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { sessionId, phase, prompt, selectedNodes, context } = body;
    
    logApiOperation(requestId, 'Claude AI Processing', {
      sessionId,
      phase,
      promptLength: prompt?.length,
      selectedNodesCount: selectedNodes?.length
    });
    
    // Initialize Claude service
    const claudeService = createClaudeService();
    
    // Process with Claude based on phase
    let operations: WorkflowOperation[] = [];
    let reasoning: string[] = [];
    
    switch (phase as WorkflowPhase) {
      case 'discovery':
        logApiOperation(requestId, 'Claude Discovery Analysis', { prompt });
        const discoveryResult = await claudeService.analyzeDiscoveryIntent(prompt, context);
        operations = discoveryResult.operations;
        reasoning = discoveryResult.reasoning;
        break;
        
      case 'configuration':
        // Extract selectedNodes from context if not provided directly
        const nodes = selectedNodes || context?.selectedNodes || [];
        logApiOperation(requestId, 'Claude Configuration Analysis', { 
          selectedNodesCount: nodes.length,
          contextNodes: context?.nodes?.length || 0
        });
        const configResult = await claudeService.generateConfiguration(
          prompt, 
          nodes, 
          context
        );
        operations = configResult.operations;
        reasoning = configResult.reasoning;
        break;
        
      case 'validation':
        logApiOperation(requestId, 'Claude Validation Analysis', { 
          contextKeys: Object.keys(context || {})
        });
        const validationResult = await claudeService.validateWorkflow(
          context
        );
        operations = validationResult.operations;
        reasoning = validationResult.reasoning;
        break;
        
      case 'building':
        logApiOperation(requestId, 'Claude Building Optimization', {
          nodesCount: context?.nodes?.length,
          connectionsCount: context?.connections?.length
        });
        const buildingResult = await claudeService.buildWorkflow(
          context
        );
        operations = buildingResult.operations;
        reasoning = buildingResult.reasoning;
        break;
        
      default:
        throw new Error(`Unsupported phase: ${phase}`);
    }
    
    const duration = Date.now() - startTime;
    
    // Log Claude's reasoning
    if (debugMode || process.env.NODE_ENV === 'test') {
      reasoning.forEach((reason, index) => {
        console.log(`[Claude Reasoning ${index + 1}] ${reason}`);
      });
    }
    
    logApiOperation(requestId, 'Claude Processing Complete', {
      operationsGenerated: operations.length,
      reasoningSteps: reasoning.length,
      duration
    });
    
    return createApiResponse(
      { 
        operations,
        reasoning: debugMode ? reasoning : undefined,
        performance: {
          duration,
          withinTarget: duration < 3000
        }
      },
      { 
        status: 200,
        requestId,
        logData: {
          phase,
          operationsCount: operations.length,
          duration
        }
      }
    );
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logApiOperation(requestId, 'Claude Processing Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });
    
    return createApiResponse(
      { 
        error: 'Claude processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true
      },
      { 
        status: 500,
        requestId
      }
    );
  }
}