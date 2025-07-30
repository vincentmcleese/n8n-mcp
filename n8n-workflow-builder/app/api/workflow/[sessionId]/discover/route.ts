import { NextRequest, NextResponse } from "next/server";
import { WorkflowOrchestrator } from "@/lib/workflow-orchestrator";
import { getWorkflowSession } from "@/lib/session-utils";

/**
 * POST /api/workflow/[sessionId]/discover
 * Run discovery phase with direct MCP integration
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
          error: "Session not found",
          message: "The specified workflow session does not exist",
        },
        { status: 404 }
      );
    }

    // Check if already past discovery phase
    if (session.state.phase !== "discovery") {
      return NextResponse.json(
        {
          error: "Invalid phase",
          message: `Session is in '${session.state.phase}' phase, discovery already completed`,
          currentPhase: session.state.phase,
        },
        { status: 400 }
      );
    }

    // Run discovery phase
    const orchestrator = new WorkflowOrchestrator();
    const result = await orchestrator.runDiscoveryPhase(
      params.sessionId,
      session.state.userPrompt
    );

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      phase: result.phase,
      discovered: result.discovered.length,
      selected: result.selected.length,
      nodes: result.discovered, // Include for debugging
      performance: {
        responseTime,
        withinTarget: responseTime < 2000,
      },
    });
  } catch (error) {
    console.error("Discovery phase error:", error);

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        error: "Discovery failed",
        message:
          error instanceof Error ? error.message : "Failed to discover nodes",
        retryable: true,
        performance: { responseTime },
      },
      { status: 500 }
    );
  }
}
