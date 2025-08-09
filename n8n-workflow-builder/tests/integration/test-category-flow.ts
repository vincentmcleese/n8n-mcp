#!/usr/bin/env npx tsx
/**
 * Test Category Flow Through All Phases
 * 
 * This test verifies that node categories from MCP are preserved
 * through discovery → configuration → building → documentation phases
 */

import { SupabaseSessionRepository } from '@/lib/session/SupabaseSessionRepository';
import { ClaudeService } from '@/services/claude/ClaudeService';
import { WorkflowOrchestrator } from '@/lib/orchestrator/WorkflowOrchestrator';
import { MCPClient } from '@/lib/mcp-client';
import { NodeContextService } from '@/lib/orchestrator/context/NodeContextService';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const USE_MOCK = process.env.USE_MOCK === 'true';

async function testCategoryFlow() {
  console.log(chalk.blue.bold('\n🔍 Testing Node Category Flow\n'));
  
  if (USE_MOCK) {
    console.log(chalk.yellow('⚠️  Running in MOCK mode - using simulated responses\n'));
  }

  const sessionRepo = new SupabaseSessionRepository();
  const claudeService = new ClaudeService();
  const mcpClient = USE_MOCK ? undefined : MCPClient.getInstance();
  const nodeContextService = new NodeContextService(mcpClient);
  
  const orchestrator = new WorkflowOrchestrator({
    sessionRepo,
    claudeService,
    nodeContextService,
    mcpClient,
  });

  try {
    // Connect MCP if not in mock mode
    if (!USE_MOCK && mcpClient) {
      console.log(chalk.gray('Connecting to MCP server...'));
      await mcpClient.connect();
      console.log(chalk.green('✓ MCP connected\n'));
    }

    // Test prompt with clear category requirements
    const prompt = "when its monday at 8am, retreive data from a folder and summarize it and email it to me";
    
    console.log(chalk.blue('Test Prompt:'), prompt);
    console.log(chalk.gray('Expected categories:'));
    console.log(chalk.gray('  - Schedule trigger → category: "trigger"'));
    console.log(chalk.gray('  - Data retrieval → category: "input"'));
    console.log(chalk.gray('  - Summarization → category: "transform"'));
    console.log(chalk.gray('  - Email send → category: "output"\n'));

    // Create session
    const { sessionId } = await sessionRepo.create();
    console.log(chalk.gray(`Session ID: ${sessionId}\n`));

    // Run all phases
    console.log(chalk.blue.bold('Running Workflow Generation...\n'));
    
    const result = await orchestrator.executeWorkflow({
      sessionId,
      prompt,
      skipDocumentation: false, // Include documentation to test sticky notes
    });

    if (!result.success) {
      throw new Error(`Workflow failed: ${result.error?.message}`);
    }

    // Check categories at each phase
    console.log(chalk.green.bold('\n✅ Workflow Generation Complete!\n'));
    
    // Load final session state
    const session = await sessionRepo.load(sessionId);
    
    // Check discovery phase
    console.log(chalk.blue('📦 Discovery Phase:'));
    const discovered = session?.state?.discovered || [];
    discovered.forEach(node => {
      const categoryLabel = node.category ? chalk.green(node.category) : chalk.red('MISSING');
      console.log(`  - ${node.type}: ${categoryLabel}`);
    });
    
    // Check configuration phase
    console.log(chalk.blue('\n⚙️ Configuration Phase:'));
    const configured = Array.from(session?.state?.configured?.values() || []);
    configured.forEach(node => {
      const categoryLabel = node.category ? chalk.green(node.category) : chalk.red('MISSING');
      console.log(`  - ${node.type}: ${categoryLabel}`);
    });
    
    // Check final workflow
    console.log(chalk.blue('\n🏗️ Building Phase:'));
    const workflow = result.workflow || session?.state?.workflow;
    const regularNodes = workflow?.nodes?.filter((n: any) => 
      n.type !== 'n8n-nodes-base.stickyNote'
    ) || [];
    
    regularNodes.forEach((node: any) => {
      const categoryLabel = node.category ? chalk.green(node.category) : chalk.red('MISSING');
      console.log(`  - ${node.type}: ${categoryLabel}`);
    });
    
    // Check documentation phase (sticky notes)
    console.log(chalk.blue('\n📝 Documentation Phase:'));
    const stickyNotes = workflow?.nodes?.filter((n: any) => 
      n.type === 'n8n-nodes-base.stickyNote'
    ) || [];
    
    console.log(`  Sticky notes created: ${stickyNotes.length}`);
    stickyNotes.forEach((note: any) => {
      const content = note.parameters?.content || '';
      const phase = content.match(/## .* (Triggers|Inputs|Transform|Outputs)/)?.[1] || 'Unknown';
      console.log(`  - ${phase} phase sticky note`);
    });
    
    // Verify categories are preserved
    const missingCategories = regularNodes.filter((n: any) => !n.category);
    if (missingCategories.length > 0) {
      console.log(chalk.red(`\n⚠️ ${missingCategories.length} nodes missing categories!`));
      missingCategories.forEach((n: any) => {
        console.log(chalk.red(`  - ${n.type} (${n.id})`));
      });
    } else {
      console.log(chalk.green('\n✅ All nodes have categories preserved!'));
    }
    
    // Check sticky note phases
    const expectedPhases = new Set(['Triggers', 'Inputs', 'Transform', 'Outputs']);
    const actualPhases = new Set(
      stickyNotes.map((note: any) => {
        const content = note.parameters?.content || '';
        return content.match(/## .* (Triggers|Inputs|Transform|Outputs)/)?.[1];
      }).filter(Boolean)
    );
    
    const missingPhases = [...expectedPhases].filter(p => !actualPhases.has(p));
    if (missingPhases.length > 0) {
      console.log(chalk.red(`\n⚠️ Missing sticky notes for phases: ${missingPhases.join(', ')}`));
    } else {
      console.log(chalk.green('✅ All expected phase sticky notes created!'));
    }
    
    // Save test output
    const outputDir = path.join(process.cwd(), 'tests', 'category-test-outputs');
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(
      outputDir,
      `category-flow-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify({
        prompt,
        sessionId,
        workflow,
        discovered: discovered.map(n => ({ type: n.type, category: n.category })),
        configured: configured.map(n => ({ type: n.type, category: n.category })),
        categoriesPreserved: missingCategories.length === 0,
        stickyNotesCorrect: missingPhases.length === 0,
      }, null, 2)
    );
    
    console.log(chalk.gray(`\nTest output saved to: ${outputPath}`));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    process.exit(1);
  } finally {
    if (!USE_MOCK && mcpClient) {
      await mcpClient.disconnect();
    }
  }
}

// Run the test
testCategoryFlow()
  .then(() => {
    console.log(chalk.green.bold('\n✅ Category flow test completed successfully!\n'));
    process.exit(0);
  })
  .catch((error) => {
    console.error(chalk.red.bold('\n❌ Category flow test failed:'), error);
    process.exit(1);
  });