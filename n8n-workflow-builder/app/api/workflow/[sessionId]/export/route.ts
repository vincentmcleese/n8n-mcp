import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/services/session-manager";
import { isMockEnabled, mockExportWorkflow } from "@/lib/mocks/workflow";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/workflow/[sessionId]/export
 * Returns the complete workflow JSON for download
 */
export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    if (isMockEnabled()) {
      return NextResponse.json(mockExportWorkflow());
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

    // Check if workflow is complete
    if (session.state.phase !== "complete") {
      return NextResponse.json(
        { error: "Workflow is not yet complete" },
        { status: 400 }
      );
    }

    // Return the workflow data with configuration analysis
    return NextResponse.json({
      workflow: session.state.workflow,
      configAnalysis: session.state.configAnalysis,
      isReady: session.state.configAnalysis?.isComplete || false,
      seo: session.state.seo // Include SEO if available
    });
  } catch (error) {
    logger.error("Failed to export workflow:", error);
    return NextResponse.json(
      { error: "Failed to export workflow" },
      { status: 500 }
    );
  }
}
