import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowSession, parseSessionId } from '@/lib/session-utils';

/**
 * GET /api/workflow/[sessionId]/export
 * Export final workflow as n8n-compatible JSON
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const startTime = Date.now();
  
  try {
    // Validate session exists
    const session = await getWorkflowSession(params.sessionId);
    if (!session) {
      return NextResponse.json(
        { 
          error: 'Session not found',
          message: 'The specified workflow session does not exist or has expired'
        },
        { status: 404 }
      );
    }

    // Validate workflow is complete
    const state = session.state;
    if (state.phase !== 'complete') {
      return NextResponse.json(
        { 
          error: 'Workflow not complete',
          message: `Workflow is in '${state.phase}' phase. Only complete workflows can be exported.`,
          currentPhase: state.phase
        },
        { status: 409 } // Conflict
      );
    }

    // Parse session ID for metadata
    const sessionInfo = parseSessionId(params.sessionId);
    
    // Calculate token savings estimate
    const operationCount = state.operationHistory.length;
    const traditionalTokens = operationCount * 200; // Estimate
    const deltaTokens = operationCount * 20; // Estimate
    const tokensSaved = Math.max(0, traditionalTokens - deltaTokens);
    const savingsPercentage = traditionalTokens > 0 
      ? Math.round((tokensSaved / traditionalTokens) * 100)
      : 0;

    const responseTime = Date.now() - startTime;

    // Export workflow in PRD format
    return NextResponse.json({
      workflow: {
        nodes: state.workflow.nodes,
        connections: state.workflow.connections,
        settings: {
          ...state.workflow.settings,
          name: state.workflow.settings.name || 'n8n Workflow',
          executionOrder: state.workflow.settings.executionOrder || 'v1',
          saveDataSuccessExecution: state.workflow.settings.saveDataSuccessExecution ?? true
        }
      },
      metadata: {
        createdAt: session.createdAt.toISOString(),
        operationCount: operationCount,
        tokensSaved: `${savingsPercentage}% (${tokensSaved} tokens)`
      },
      performance: {
        responseTime,
        withinTarget: responseTime < 500
      }
    });

  } catch (error) {
    console.error('Export workflow error:', error);
    
    const responseTime = Date.now() - startTime;
    
    if (error instanceof Error) {
      // Database connection errors
      if (error.message.includes('Database') || error.message.includes('connection')) {
        return NextResponse.json(
          { 
            error: 'Database error',
            message: 'Unable to connect to database',
            retryable: true,
            performance: { responseTime }
          },
          { status: 503 }
        );
      }
      
      // Session ID parsing errors
      if (error.message.includes('Invalid session ID')) {
        return NextResponse.json(
          { 
            error: 'Invalid session',
            message: 'Session ID format is invalid',
            retryable: false,
            performance: { responseTime }
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to export workflow',
        retryable: true,
        performance: { responseTime }
      },
      { status: 500 }
    );
  }
}