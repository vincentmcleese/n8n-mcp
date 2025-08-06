import { NextResponse } from 'next/server';
import { WorkflowOrchestrator } from '@/lib/workflow-orchestrator';
import { nanoid } from 'nanoid';

/**
 * POST /api/workflow/create
 * Creates a new workflow session and starts the discovery phase
 */
export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Generate unique session ID
    const timestamp = Date.now();
    const random = nanoid(10);
    const sessionId = `wf_${timestamp}_${random}`;

    // Create orchestrator
    const orchestrator = new WorkflowOrchestrator();
    
    // Start discovery phase asynchronously
    // Don't await - let it run in background
    orchestrator.runDiscoveryPhase(sessionId, prompt).then(async (result) => {
      console.log(`Discovery phase result for ${sessionId}:`, {
        success: result.success,
        selectedNodeIds: result.selectedNodeIds,
        pendingClarification: result.pendingClarification,
        phase: result.phase
      });
      
      // After discovery, continue with other phases automatically
      if (!result.pendingClarification && result.selectedNodeIds?.length > 0) {
        console.log(`Starting configuration phase for ${sessionId} with ${result.selectedNodeIds.length} nodes`);
        // Continue processing phases in background
        try {
          await orchestrator.runConfigurationPhase(sessionId);
          await orchestrator.runBuildingPhase(sessionId);
          await orchestrator.runValidationPhase(sessionId);
          await orchestrator.runDocumentationPhase(sessionId);
        } catch (phaseError) {
          console.error(`Phase processing failed for ${sessionId}:`, phaseError);
        }
      } else {
        console.log(`Skipping automatic phase progression for ${sessionId}: pendingClarification=${!!result.pendingClarification}, selectedNodes=${result.selectedNodeIds?.length || 0}`);
      }
    }).catch(error => {
      console.error(`Background processing failed for ${sessionId}:`, error);
    });

    return NextResponse.json({
      sessionId,
      message: 'Workflow creation started',
      status: 'processing'
    });

  } catch (error) {
    console.error('Failed to create workflow:', error);
    return NextResponse.json(
      { error: 'Failed to create workflow session' },
      { status: 500 }
    );
  }
}