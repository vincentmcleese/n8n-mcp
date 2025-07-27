import fs from 'fs';
import path from 'path';

const requiredDirs = [
  'app/workflow/[sessionId]/result',
  'app/workflow/components',
  'app/api/workflow/[sessionId]/apply',
  'app/api/workflow/[sessionId]/state', 
  'app/api/workflow/[sessionId]/export',
  'app/api/workflow/[sessionId]/phase-status',
  'app/api/workflow/create',
  'app/api/claude',
  'app/api/cron/cleanup',
  'lib',
  'hooks',
  'types'
];

const requiredFiles = [
  'types/workflow.ts',
  'lib/supabase.ts',
  'app/workflow/page.tsx',
  'app/workflow/layout.tsx',
  'app/workflow/[sessionId]/page.tsx',
  'app/workflow/[sessionId]/result/page.tsx',
  'app/workflow/components/WorkflowChat.tsx',
  'app/workflow/components/NodeSelector.tsx',
  'app/workflow/components/WorkflowPreview.tsx',
  'app/api/workflow/create/route.ts',
  'app/api/workflow/[sessionId]/state/route.ts',
  'app/api/workflow/[sessionId]/apply/route.ts',
  'app/api/workflow/[sessionId]/export/route.ts',
  'app/api/workflow/[sessionId]/phase-status/route.ts',
  'app/api/claude/route.ts',
  'app/api/cron/cleanup/route.ts',
  'hooks/useWorkflowSession.ts',
  'hooks/useWorkflowBuilder.ts'
];

console.log('Verifying project structure...\n');

let allValid = true;

// Check directories
console.log('Checking directories:');
for (const dir of requiredDirs) {
  const fullPath = path.join(process.cwd(), dir);
  const exists = fs.existsSync(fullPath);
  console.log(`  ${exists ? '✅' : '❌'} ${dir}`);
  if (!exists) allValid = false;
}

console.log('\nChecking files:');
// Check files
for (const file of requiredFiles) {
  const fullPath = path.join(process.cwd(), file);
  const exists = fs.existsSync(fullPath);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allValid = false;
}

console.log('\n' + (allValid ? '✅ All structure checks passed!' : '❌ Some files or directories are missing'));