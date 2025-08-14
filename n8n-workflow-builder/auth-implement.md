# Supabase Auth Implementation Guide

## Overview
This is an **MVP authentication implementation** using Supabase Auth with Google OAuth for the n8n Workflow Builder application. It provides secure user authentication with minimal complexity while following best practices.

## MVP Feature Set
✅ **Google OAuth login** - One-click authentication  
✅ **Session management** - Secure cookie-based sessions  
✅ **User avatar display** - Shows Google profile picture  
✅ **Logout functionality** - Clean session termination  
✅ **Route protection** - Middleware-based auth checks  
✅ **Auto token refresh** - Seamless session maintenance  

## Supabase Configuration Status

### ✅ Already Configured (No Changes Needed)
Based on your confirmation, these are already set up in Supabase:
- Google OAuth provider enabled
- OAuth consent screen configured
- Redirect URLs set up
- User table exists with `google_id` field
- 3 test users already in database

### ⚠️ Verify These Settings
Please confirm these are configured in your Supabase dashboard:

1. **Authentication > Providers > Google**
   - Enabled: ✓
   - Client ID: `[your-google-client-id]`
   - Client Secret: `[your-google-client-secret]`

2. **Authentication > URL Configuration**
   - Site URL: `http://localhost:3000` (for development)
   - Redirect URLs: 
     ```
     http://localhost:3000/api/auth/callback
     https://yourdomain.com/api/auth/callback
     ```

3. **Authentication > Email Templates** (Optional for MVP)
   - Can be customized later if adding email auth

## Implementation Checklist

### Phase 1: Core Setup (30 mins)
- [ ] Create `/middleware.ts` for session management
- [ ] Update `/lib/supabase.ts` with proper client exports
- [ ] Create `/lib/utils/supabase/server.ts` for server components
- [ ] Create `/lib/utils/supabase/middleware.ts` for session refresh

### Phase 2: API Routes (20 mins)
- [ ] Create `/app/api/auth/login/route.ts` - OAuth initiation
- [ ] Create `/app/api/auth/callback/route.ts` - OAuth callback handler
- [ ] Create `/app/api/auth/logout/route.ts` - Sign out handler

### Phase 3: UI Components (30 mins)
- [ ] Create `/components/ui/user-avatar.tsx` - Avatar with dropdown
- [ ] Update `/components/Header.tsx` - Add auth state management
- [ ] Create `/types/auth.ts` - TypeScript definitions

### Phase 4: Testing (20 mins)
- [ ] Test login flow
- [ ] Test logout flow
- [ ] Test session persistence
- [ ] Test protected routes

## File Structure
```
/n8n-workflow-builder
├── middleware.ts                 # NEW: Session refresh & route protection
├── auth-implement.md            # THIS FILE: Implementation guide
├── /app
│   └── /api
│       └── /auth
│           ├── /login
│           │   └── route.ts     # NEW: OAuth login
│           ├── /callback
│           │   └── route.ts     # NEW: OAuth callback
│           └── /logout
│               └── route.ts     # NEW: Logout handler
├── /components
│   ├── Header.tsx               # UPDATE: Add auth state
│   └── /ui
│       └── user-avatar.tsx     # NEW: User avatar dropdown
├── /lib
│   ├── supabase.ts             # EXISTING: Already configured
│   └── /utils
│       └── /supabase
│           ├── server.ts       # NEW: Server component client
│           └── middleware.ts    # NEW: Middleware utilities
└── /types
    └── auth.ts                  # NEW: Auth types
```

## Quick Start Code

### 1. Middleware (`/middleware.ts`)
```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### 2. Login Route (`/app/api/auth/login/route.ts`)
```typescript
import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirectTo = searchParams.get('redirectTo') || '/';
  
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/api/auth/callback?redirectTo=${redirectTo}`,
    },
  });

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  return NextResponse.redirect(data.url);
}
```

### 3. User Avatar Component (`/components/ui/user-avatar.tsx`)
```typescript
'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';

interface UserAvatarProps {
  user: User;
}

export function UserAvatar({ user }: UserAvatarProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <img
          src={user.user_metadata?.avatar_url || '/default-avatar.png'}
          alt={user.email || 'User'}
          className="w-8 h-8 rounded-full border border-neutral-200"
        />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 z-20">
            <div className="p-3 border-b border-neutral-100">
              <p className="text-sm font-semibold truncate">
                {user.user_metadata?.full_name || 'User'}
              </p>
              <p className="text-xs text-neutral-500 truncate">
                {user.email}
              </p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 rounded-b-lg">
                Logout
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
```

## Environment Variables
Ensure these are set in your `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Testing the Implementation

### 1. Login Flow
1. Click "Login" button in header
2. Redirected to Google OAuth
3. Authorize the application
4. Redirected back to app with session
5. Header shows user avatar

### 2. Logout Flow
1. Click on user avatar
2. Click "Logout" in dropdown
3. Session cleared
4. Redirected to homepage
5. Header shows "Login" button again

## Security Considerations

### ✅ Implemented Security Features
- **PKCE flow** - OAuth security standard
- **HTTP-only cookies** - Prevents XSS attacks
- **Server validation** - Using `getUser()` not `getSession()`
- **Automatic refresh** - Tokens refreshed in middleware
- **Secure redirects** - Validated redirect URLs

### ⚠️ Future Enhancements (Post-MVP)
- Rate limiting on auth endpoints
- Multi-factor authentication (MFA)
- Email verification for additional providers
- Session activity monitoring
- Account linking for multiple providers

## Common Issues & Solutions

### Issue: "User not authenticated" after login
**Solution**: Ensure middleware is properly configured and running

### Issue: Avatar image not loading
**Solution**: Add Google domain to Next.js image domains in `next.config.js`:
```javascript
images: {
  domains: ['lh3.googleusercontent.com'],
}
```

### Issue: Logout not working
**Solution**: Ensure the form is using POST method and action points to correct route

## MVP vs Full Implementation

### Current MVP ✅
- Google OAuth only
- Basic session management
- Simple avatar dropdown
- Essential route protection

### Future Enhancements 🚀
- Multiple OAuth providers (GitHub, Microsoft)
- Email/password authentication
- User profile management
- Role-based access control (RBAC)
- Session management UI
- Account settings page
- Email notifications

## Deployment Checklist

### For Production
1. Update Supabase redirect URLs to production domain
2. Set production environment variables in Vercel/hosting platform
3. Ensure Google OAuth app is verified for production use
4. Update Site URL in Supabase to production domain
5. Test OAuth flow on production URL

## Support & Documentation

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Next.js App Router Auth](https://nextjs.org/docs/app/building-your-application/authentication)
- [@supabase/ssr Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Google OAuth Setup](https://support.google.com/cloud/answer/6158849)

---

**Status**: Ready for MVP implementation  
**Estimated Time**: 1.5-2 hours  
**Complexity**: Medium  
**Dependencies**: Supabase project with Google OAuth configured