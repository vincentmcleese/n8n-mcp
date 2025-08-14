import { createServerClientInstance } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  
  const supabase = await createServerClientInstance();
  
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Logout error:', error);
  }
  
  // Always redirect to home after logout attempt
  return NextResponse.redirect(`${origin}/`, {
    status: 302,
  });
}

export async function GET(request: Request) {
  // Support GET for easier testing, but POST is preferred
  return POST(request);
}