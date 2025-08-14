import { createServerClientInstance } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirectTo = searchParams.get('redirectTo') || '/';
  
  const supabase = await createServerClientInstance();
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/api/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  if (data.url) {
    return NextResponse.redirect(data.url);
  }

  // Fallback redirect
  return NextResponse.redirect(`${origin}/?auth=error`);
}