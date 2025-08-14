import { createServerClientInstance } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirectTo') || '/';

  if (code) {
    const supabase = await createServerClientInstance();
    
    const { data: authData, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && authData?.user) {
      // Check if this is a user returning from login with a pending workflow
      // The redirectTo will be like /workflow/wf_123456_abc
      if (redirectTo.startsWith('/workflow/')) {
        // Store a flag in cookies to indicate user just authenticated
        const cookieStore = await cookies();
        cookieStore.set('just_authenticated', 'true', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60, // 1 minute expiry
          path: '/'
        });
      }
      
      // Redirect to the intended destination (will be /workflow/[sessionId])
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
    
    console.error('Auth callback error:', error);
  }

  // Authentication failed or no code provided
  return NextResponse.redirect(`${origin}/?auth=error`);
}