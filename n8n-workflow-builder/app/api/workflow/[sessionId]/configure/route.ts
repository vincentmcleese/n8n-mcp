import { NextRequest, NextResponse } from 'next/server';
import { WorkflowOrchestrator } from '@/lib/workflow-orchestrator';
import { getWorkflowSession } from '@/lib/session-utils';

/**
 * POST /api/workflow/[sessionId]/configure
 * Run configuration phase
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
    if (session.state.phase !== 'configuration') {
      return NextResponse.json(
        { 
          error: 'Invalid phase',
          message: `Session is in '${session.state.phase}' phase, expected 'configuration'`,
          currentPhase: session.state.phase
        },
        { status: 400 }
      );
    }
    
    // Check if nodes are selected
    if (!session.state.selected || session.state.selected.length === 0) {
      return NextResponse.json(
        { 
          error: 'No nodes selected',
          message: 'Discovery phase must complete with selected nodes before configuration'
        },
        { status: 400 }
      );
    }
    
    // Run configuration phase
    const orchestrator = new WorkflowOrchestrator();
    const result = await orchestrator.runConfigurationPhase(params.sessionId);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      phase: result.phase,
      configured: result.configured,
      performance: {
        responseTime,
        withinTarget: responseTime < 2000
      }
    });
    
  } catch (error) {
    console.error('Configuration phase error:', error);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(
      { 
        error: 'Configuration failed',
        message: error instanceof Error ? error.message : 'Failed to configure nodes',
        retryable: true,
        performance: { responseTime }
      },
      { status: 500 }
    );
  }
}