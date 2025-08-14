import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  // Use env vars directly in middleware to avoid edge runtime issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are not set, just pass through
    return NextResponse.next({
      request,
    });
  }

  try {
    let response = NextResponse.next({
      request,
    });

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Refresh session if expired - required for Server Components
    const { data: { user }, error } = await supabase.auth.getUser();

    // Check for protected routes
    const isWorkflowRoute = request.nextUrl.pathname.startsWith('/workflow');
    const isWorkflowCreatePage = request.nextUrl.pathname === '/workflow/create';
    const isWorkflowCreateAPI = request.nextUrl.pathname === '/api/workflow/create';
    
    // Allow access to /workflow/create page for authenticated users
    // The page itself will handle the session retrieval logic
    if (isWorkflowCreatePage && user) {
      return response;
    }
    
    // Protect workflow routes (except the create page which handles its own auth)
    if (isWorkflowRoute && !isWorkflowCreatePage && !user && !error) {
      // Redirect to login if accessing protected route without auth
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/auth/login';
      redirectUrl.searchParams.set('returnUrl', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
    
    // API protection is handled in the API routes themselves
    // to provide proper JSON error responses

    return response;
  } catch (error) {
    console.error('Auth middleware error:', error);
    // On error, just pass through
    return NextResponse.next({
      request,
    });
  }
}