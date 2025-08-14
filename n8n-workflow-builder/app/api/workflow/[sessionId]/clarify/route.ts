import { NextResponse } from "next/server";
import { WorkflowOrchestrator } from "@/lib/workflow-orchestrator";
import { isMockEnabled, mockClarifyResponse } from "@/lib/mocks/workflow";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/workflow/[sessionId]/clarify
 * Handles clarification responses from the user
 */
export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    if (isMockEnabled()) {
      return NextResponse.json(mockClarifyResponse());
    }
    const { sessionId } = params;
    const { questionId, response } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    if (!questionId || !response) {
      return NextResponse.json(
        { error: "Question ID and response are required" },
        { status: 400 }
      );
    }

    // Create orchestrator
    const orchestrator = new WorkflowOrchestrator();

    // Handle the clarification response
    const result = await orchestrator.handleClarificationResponse(
      sessionId,
      questionId,
      response
    );

    // Continue with remaining phases if no more clarifications needed
    if (!result.pendingClarification && result.selectedNodeIds?.length > 0) {
      logger.info(`Continuing workflow for ${sessionId} after clarification`);

      // Continue processing phases in background
      orchestrator
        .runConfigurationPhase(sessionId)
        .then(async () => {
          try {
            await orchestrator.runBuildingPhase(sessionId);
            await orchestrator.runValidationPhase(sessionId);
            await orchestrator.runDocumentationPhase(sessionId);
          } catch (phaseError) {
            logger.error(
              `Phase processing failed for ${sessionId}:`,
              phaseError
            );
          }
        })
        .catch((error) => {
          logger.error(`Configuration phase failed for ${sessionId}:`, error);
        });
    }

    return NextResponse.json({
      success: true,
      selectedNodes: result.selectedNodeIds?.length || 0,
      pendingClarification: result.pendingClarification,
      message: result.pendingClarification
        ? "Additional clarification needed"
        : "Thanks for the clarification! Processing your workflow...",
    });
  } catch (error) {
    logger.error("Failed to handle clarification:", error);
    return NextResponse.json(
      { error: "Failed to process clarification response" },
      { status: 500 }
    );
  }
}
