// app/api/workflow/[sessionId]/seo/route.ts

import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/services/session-manager";
import { getSEOGenerator } from "@/lib/services/seo-generator.service";
import { GenerateSEORequest, GenerateSEOResponse } from "@/types/seo";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/workflow/[sessionId]/seo
 * Returns the SEO metadata for a workflow session
 */
export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Load session from database
    const session = await sessionManager.loadSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Return existing SEO metadata if available
    if (session.state.seo) {
      return NextResponse.json({
        success: true,
        seo: session.state.seo
      } as GenerateSEOResponse);
    }

    // No SEO metadata available
    return NextResponse.json({
      success: false,
      error: "SEO metadata not yet generated. Complete discovery phase first."
    } as GenerateSEOResponse);
  } catch (error) {
    logger.error("Failed to get SEO metadata:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to retrieve SEO metadata" 
      } as GenerateSEOResponse,
      { status: 500 }
    );
  }
}

/**
 * POST /api/workflow/[sessionId]/seo
 * Generate or regenerate SEO metadata for a workflow
 */
export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const body = await request.json() as GenerateSEORequest;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Load session from database
    const session = await sessionManager.loadSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if SEO already exists and force flag is not set
    if (session.state.seo && !body.force) {
      return NextResponse.json({
        success: true,
        seo: session.state.seo
      } as GenerateSEOResponse);
    }

    // Check if discovery phase is complete
    if (session.state.discovered.length === 0 || session.state.selected.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Cannot generate SEO metadata. Discovery phase must be completed first."
      } as GenerateSEOResponse, { status: 400 });
    }

    // Generate SEO metadata
    const seoGenerator = getSEOGenerator();
    const seoMetadata = await seoGenerator.generateSEO(
      session.state.discovered,
      session.state.selected,
      session.state.userPrompt,
      sessionId
    );

    // Apply SEO operation to session
    await sessionManager.applyOperations(sessionId, [
      {
        type: "setSEOMetadata",
        seo: seoMetadata
      }
    ]);

    return NextResponse.json({
      success: true,
      seo: seoMetadata
    } as GenerateSEOResponse);
  } catch (error) {
    logger.error("Failed to generate SEO metadata:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to generate SEO metadata" 
      } as GenerateSEOResponse,
      { status: 500 }
    );
  }
}