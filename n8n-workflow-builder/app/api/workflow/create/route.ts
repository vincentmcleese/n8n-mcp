import { NextRequest, NextResponse } from 'next/server';
import { createWorkflowSession } from '@/lib/session-utils';
import { z } from 'zod';

/**
 * Request validation schema
 */
const createSessionSchema = z.object({
  prompt: z.string().min(1).max(1000),
  metadata: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }).optional(),
});

/**
 * POST /api/workflow/create
 * Creates a new workflow session
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    
    // Validate input
    const validationResult = createSessionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request', 
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const { prompt, metadata } = validationResult.data;

    // Create the session
    const session = await createWorkflowSession(prompt, metadata);

    // Return success response
    return NextResponse.json({
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
    
  } catch (error) {
    console.error('Session creation error:', error);
    
    // Handle database errors
    if (error instanceof Error && error.message.includes('Failed to create session')) {
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to create session' },
        { status: 503 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/workflow/create
 * CORS preflight support
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}