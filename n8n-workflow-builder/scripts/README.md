# Test Scripts

This directory contains test scripts for the n8n Workflow Builder.

## Full End-to-End Test

### test-full-supabase-flow.ts

Comprehensive end-to-end test that validates the complete workflow lifecycle with Supabase state persistence.

**Features:**
- Tests all 5 workflow phases (Discovery, Configuration, Building, Validation, Documentation)
- Session recovery testing between phases
- Supabase state persistence validation
- Automatic clarification handling
- Comprehensive reporting and metrics
- Session archival and cleanup

**Usage:**
```bash
# Ensure environment variables are set
export USE_SUPABASE_STATE=true
export ANTHROPIC_API_KEY=your_key_here
export NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
export NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
export SUPABASE_SERVICE_KEY=your_service_key

# Run the test
cd n8n-workflow-builder
npm run tsx scripts/test-full-supabase-flow.ts
```

**Output:**
- Console logs showing real-time progress
- Detailed final report with metrics
- `final-test-output.json` with complete test results

**Test Workflow:**
The test uses the prompt: "Create a workflow to send daily Slack notifications from a Google Sheets spreadsheet"

**Expected Results:**
- All 5 phases complete successfully
- Session recovery works between each phase
- Valid n8n workflow JSON generated
- Supabase persistence verified
- Session properly archived

**Metrics Tracked:**
- Phase execution times
- Total operations performed
- Claude tokens used
- Nodes discovered and configured
- Validation fixes applied
- Sticky notes added
- Session recovery success rate

This test demonstrates that the full workflow orchestrator works end-to-end with persistent state management.