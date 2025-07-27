# Project Structure

## Directory Layout

```
n8n-workflow-builder/
├── app/
│   ├── api/
│   │   ├── claude/                    # Claude API integration
│   │   │   └── route.ts
│   │   ├── cron/
│   │   │   └── cleanup/               # Cleanup expired sessions
│   │   │       └── route.ts
│   │   └── workflow/
│   │       ├── create/                # Create new workflow session
│   │       │   └── route.ts
│   │       └── [sessionId]/          # Session-specific endpoints
│   │           ├── apply/            # Apply workflow changes
│   │           │   └── route.ts
│   │           ├── export/           # Export workflow JSON
│   │           │   └── route.ts
│   │           ├── phase-status/     # Get current phase status
│   │           │   └── route.ts
│   │           └── state/            # Get/update session state
│   │               └── route.ts
│   └── workflow/                     # Workflow UI pages
│       ├── components/               # Reusable workflow components
│       │   ├── NodeSelector.tsx
│       │   ├── WorkflowChat.tsx
│       │   └── WorkflowPreview.tsx
│       ├── [sessionId]/             # Session-specific pages
│       │   ├── page.tsx             # Workflow builder page
│       │   └── result/              # Result display page
│       │       └── page.tsx
│       ├── layout.tsx               # Workflow layout wrapper
│       └── page.tsx                 # Workflow listing/home
├── hooks/                           # Custom React hooks
│   ├── useWorkflowBuilder.ts
│   └── useWorkflowSession.ts
├── lib/                             # Utility libraries
│   ├── config/                      # Configuration files
│   │   └── supabase.ts             # Existing Supabase config
│   └── supabase.ts                 # Supabase client utilities
├── types/                           # TypeScript type definitions
│   └── workflow.ts                  # Workflow-related types
└── scripts/                         # Build and utility scripts
    └── verify-structure.ts          # Structure verification script
```

## API Routes

- `POST /api/workflow/create` - Create new workflow session
- `GET/POST /api/workflow/[sessionId]/state` - Get/update session state
- `POST /api/workflow/[sessionId]/apply` - Apply workflow changes
- `GET /api/workflow/[sessionId]/export` - Export workflow as JSON
- `GET /api/workflow/[sessionId]/phase-status` - Get current phase status
- `POST /api/claude` - Claude API integration endpoint
- `GET /api/cron/cleanup` - Clean up expired sessions

## UI Routes

- `/workflow` - Workflow listing/home page
- `/workflow/[sessionId]` - Active workflow builder
- `/workflow/[sessionId]/result` - Display generated workflow

## Next Steps

1. Implement workflow types in `types/workflow.ts`
2. Set up Supabase client in `lib/supabase.ts`
3. Create workflow state management hooks
4. Implement API route logic
5. Build out UI components
```