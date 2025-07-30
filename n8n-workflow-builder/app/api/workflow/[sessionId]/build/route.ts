import { NextRequest, NextResponse } from 'next/server';
import { WorkflowOrchestrator } from '@/lib/workflow-orchestrator';
import { getWorkflowSession } from '@/lib/session-utils';

/**
 * POST /api/workflow/[sessionId]/build
 * Run building phase to create final workflow
 */
export async function POST(
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
          message: 'The specified workflow session does not exist'
        },
        { status: 404 }
      );
    }
    
    // Check if in correct phase
    if (session.state.phase !== 'building') {
      return NextResponse.json(
        { 
          error: 'Invalid phase',
          message: `Session is in '${session.state.phase}' phase, expected 'building'`,
          currentPhase: session.state.phase
        },
        { status: 400 }
      );
    }
    
    // Check if validation passed
    if (!session.state.validated || Object.keys(session.state.validated).length === 0) {
      return NextResponse.json(
        { 
          error: 'Validation incomplete',
          message: 'Validation phase must complete successfully before building'
        },
        { status: 400 }
      );
    }
    
    // Run building phase
    const orchestrator = new WorkflowOrchestrator();
    const result = await orchestrator.runBuildingPhase(params.sessionId);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      phase: result.phase,
      nodes: result.nodes,
      connections: result.connections,
      performance: {
        responseTime,
        withinTarget: responseTime < 2000
      }
    });
    
  } catch (error) {
    console.error('Building phase error:', error);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(
      { 
        error: 'Building failed',
        message: error instanceof Error ? error.message : 'Failed to build workflow',
        retryable: true,
        performance: { responseTime }
      },
      { status: 500 }
    );
  }
}