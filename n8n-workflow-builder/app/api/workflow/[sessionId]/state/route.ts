import { NextResponse, NextRequest } from "next/server";
import { sessionManager } from "@/lib/services/session-manager";
import { DiscoveredNode } from "@/types/workflow";
import { isMockEnabled, mockStateResponse } from "@/lib/mocks/workflow";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/workflow/[sessionId]/state
 * Returns the current phase and progress of a workflow session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    if (isMockEnabled()) {
      return NextResponse.json(mockStateResponse(request));
    }
    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Load session from database using singleton
    const session = await sessionManager.loadSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check for pending clarifications
    const pendingClarifications = session.state.pendingClarifications || [];
    const pendingClarification =
      pendingClarifications.length > 0 ? pendingClarifications[0] : null;

    const selectedNodes = session.state.selected
      .map((nodeId) => session.state.discovered.find((d) => d.id === nodeId))
      .filter(Boolean) as DiscoveredNode[];

    // Return current phase and basic stats
    return NextResponse.json({
      sessionId,
      phase: session.state.phase,
      complete: session.state.phase === "complete",
      seoSlug: (session.state as any).seo?.slug ?? null,
      stats: {
        discovered: session.state.discovered.length,
        selected: selectedNodes.length,
        configured: Object.keys(session.state.configured).length,
        validated: Object.keys(session.state.validated).length,
      },
      selectedNodes: selectedNodes.map((node) => ({
        id: node.id,
        nodeType: node.type,
        name: node.displayName || node.type,
      })),
      // Include prompt for display
      prompt: session.state.userPrompt,
      // Include pending clarification if any
      pendingClarification: pendingClarification
        ? {
            questionId: pendingClarification.questionId,
            question: pendingClarification.question,
          }
        : null,
    });
  } catch (error) {
    logger.error("Failed to get session state:", error);
    return NextResponse.json(
      { error: "Failed to retrieve session state" },
      { status: 500 }
    );
  }
}
