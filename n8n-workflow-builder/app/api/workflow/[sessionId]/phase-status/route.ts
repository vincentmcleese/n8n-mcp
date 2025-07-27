import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // TODO: Implement phase status retrieval logic
    
    return NextResponse.json({
      sessionId: params.sessionId,
      phase: 'initial',
      status: 'waiting',
      progress: 0,
      message: 'Waiting for user input'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get phase status' },
      { status: 500 }
    );
  }
}