import { createOrchestrator } from './lib/orchestrator';
import { ClaudeService } from './services/claude';
import { loggers } from './lib/utils/logger';
import chalk from 'chalk';

// Test the conditional logic case
async function testConditionalLogic() {
  console.log(chalk.blue('\n🔍 Testing Conditional Logic Detection\n'));
  
  const prompt = "Receive webhook with order data, check if amount is greater than 100, if yes send to Slack channel #high-value, if no send email to admin@example.com";
  
  // Create orchestrator
  const orchestrator = createOrchestrator();
  
  // Create a unique session ID
  const sessionId = `test_conditional_${Date.now()}`;
  
  console.log(chalk.cyan('Prompt:'), prompt);
  console.log(chalk.cyan('Session ID:'), sessionId);
  console.log('\n' + chalk.yellow('─'.repeat(50)) + '\n');
  
  try {
    // Run discovery phase
    console.log(chalk.green('Running discovery phase...'));
    const discoveryResult = await orchestrator.discovery.run({
      sessionId,
      prompt
    });
    
    console.log('\n' + chalk.blue('Discovery Result:'));
    console.log(chalk.gray('Success:'), discoveryResult.success);
    console.log(chalk.gray('Phase:'), discoveryResult.phase);
    console.log(chalk.gray('Discovered Nodes:'), discoveryResult.discoveredNodes.length);
    console.log(chalk.gray('Selected Nodes:'), discoveryResult.selectedNodeIds.length);
    
    // Show discovered nodes
    console.log('\n' + chalk.yellow('Discovered Nodes:'));
    discoveryResult.discoveredNodes.forEach((node, i) => {
      console.log(`  ${i + 1}. ${chalk.cyan(node.type)} - ${node.displayName}`);
      console.log(`     Purpose: ${node.purpose}`);
      console.log(`     Pre-configured: ${node.isPreConfigured || false}`);
    });
    
    // Check metadata for task vs searched nodes
    const metadata = (discoveryResult as any).metadata;
    if (metadata) {
      console.log('\n' + chalk.yellow('Metadata:'));
      console.log(chalk.gray('Task Nodes:'), metadata.taskNodes);
      console.log(chalk.gray('Searched Nodes:'), metadata.searchedNodes);
      console.log(chalk.gray('Workflow Pattern:'), metadata.workflow_pattern);
      console.log(chalk.gray('Complexity:'), metadata.complexity);
    }
    
    // Now let's also check what Claude's intent analysis returned
    console.log('\n' + chalk.blue('Analyzing Intent Directly...'));
    const claudeService = new ClaudeService(loggers.claude);
    const intentResult = await claudeService.analyzeIntent({ prompt });
    
    if (intentResult.success && intentResult.data) {
      const analysis = intentResult.data;
      console.log('\n' + chalk.yellow('Intent Analysis:'));
      console.log(chalk.gray('Intent:'), analysis.intent);
      console.log(chalk.gray('Matched Tasks:'), analysis.matched_tasks);
      console.log(chalk.gray('Workflow Pattern:'), analysis.workflow_pattern);
      
      console.log('\n' + chalk.yellow('Logic Flow:'));
      analysis.logic_flow.forEach(step => {
        console.log(`  Step ${step.step}: ${step.action}`);
        console.log(`    Type: ${step.type}, Task: ${step.task || 'N/A'}, NodeType: ${step.nodeType || 'N/A'}`);
      });
      
      console.log('\n' + chalk.yellow('Unmatched Capabilities:'));
      if (analysis.unmatched_capabilities.length === 0) {
        console.log(chalk.red('  ❌ No unmatched capabilities detected!'));
      } else {
        analysis.unmatched_capabilities.forEach(cap => {
          console.log(`  - ${cap.name}: ${cap.description}`);
          console.log(`    Search terms: ${cap.searchTerms.join(', ')}`);
        });
      }
      
      console.log('\n' + chalk.yellow('Task Selection Reasoning:'));
      if (analysis.task_selection_reasoning) {
        analysis.task_selection_reasoning.forEach(({ task, reason }) => {
          console.log(`  📦 ${task}: ${reason}`);
        });
      }
    }
    
    // Summary
    console.log('\n' + chalk.blue('Summary:'));
    const taskCount = metadata?.taskNodes?.length || 0;
    const searchedCount = metadata?.searchedNodes?.length || 0;
    console.log(chalk.gray('Pre-configured tasks found:'), taskCount);
    console.log(chalk.gray('Nodes from search:'), searchedCount);
    
    if (searchedCount === 0) {
      console.log(chalk.red('\n❌ ISSUE: No IF node was searched for or found!'));
      console.log(chalk.yellow('Expected: 1 node (IF) should be identified as a gap and searched'));
    } else {
      console.log(chalk.green('\n✅ IF node was properly identified and searched'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error);
  }
  
  process.exit(0);
}

// Run the test
testConditionalLogic().catch(console.error);