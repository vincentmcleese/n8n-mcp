import { NextRequest, NextResponse } from 'next/server';
import { WorkflowOrchestrator } from '@/lib/workflow-orchestrator';
import { getWorkflowSession } from '@/lib/session-utils';

/**
 * POST /api/workflow/[sessionId]/validate
 * Run validation phase
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
    if (session.state.phase !== 'validation') {
      return NextResponse.json(
        { 
          error: 'Invalid phase',
          message: `Session is in '${session.state.phase}' phase, expected 'validation'`,
          currentPhase: session.state.phase
        },
        { status: 400 }
      );
    }
    
    // Check if nodes are configured
    if (!session.state.configured || Object.keys(session.state.configured).length === 0) {
      return NextResponse.json(
        { 
          error: 'No nodes configured',
          message: 'Configuration phase must complete before validation'
        },
        { status: 400 }
      );
    }
    
    // Run validation phase
    const orchestrator = new WorkflowOrchestrator();
    const result = await orchestrator.runValidationPhase(params.sessionId);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      phase: result.phase,
      valid: result.valid,
      errors: result.errors,
      performance: {
        responseTime,
        withinTarget: responseTime < 1000
      }
    });
    
  } catch (error) {
    console.error('Validation phase error:', error);
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(
      { 
        error: 'Validation failed',
        message: error instanceof Error ? error.message : 'Failed to validate workflow',
        retryable: true,
        performance: { responseTime }
      },
      { status: 500 }
    );
  }
}