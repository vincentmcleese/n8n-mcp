/**
 * Prompt Builder for Configuration Phase
 * 
 * Builds targeted prompts using essentials and category rules
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCategoryRules } from './configuration-rules';
import type { DiscoveredNode } from '@/types/workflow';

export interface PromptBuilderInput {
  node: DiscoveredNode;
  essentials: any;
  workflowContext: {
    description: string;
    userPrompt: string;
  };
}

export class ConfigurationPromptBuilder {
  private taskTemplatePath: string;
  private searchTemplatePath: string;
  private taskTemplate: string | null = null;
  private searchTemplate: string | null = null;
  
  constructor() {
    this.taskTemplatePath = path.join(
      process.cwd(),
      'services/claude/prompts/configureprompt-tasktemplates.md'
    );
    this.searchTemplatePath = path.join(
      process.cwd(),
      'services/claude/prompts/configureprompt-searchednodes.md'
    );
  }
  
  /**
   * Load the appropriate prompt template
   */
  private loadTemplate(isTaskNode: boolean): string {
    if (isTaskNode) {
      if (!this.taskTemplate) {
        try {
          this.taskTemplate = fs.readFileSync(this.taskTemplatePath, 'utf-8');
        } catch (error) {
          // Fallback to inline template if file not found
          this.taskTemplate = this.getInlineTaskTemplate();
        }
      }
      return this.taskTemplate;
    } else {
      if (!this.searchTemplate) {
        try {
          this.searchTemplate = fs.readFileSync(this.searchTemplatePath, 'utf-8');
        } catch (error) {
          // Fallback to inline template if file not found
          this.searchTemplate = this.getInlineSearchTemplate();
        }
      }
      return this.searchTemplate;
    }
  }
  
  /**
   * Build configuration prompt for a node
   */
  buildPrompt(input: PromptBuilderInput): string {
    const { node, essentials, workflowContext } = input;
    
    // Detect if this is a task node (has pre-configured template)
    const isTaskNode = node.isPreConfigured && node.config;
    const template = this.loadTemplate(isTaskNode);
    
    // Get category-specific rules
    const rules = getCategoryRules(node.category || 'general', node.type);
    
    // For task nodes, essentials will actually be the restructured task template
    const dataToInsert = isTaskNode ? essentials : essentials;
    const dataPlaceholder = isTaskNode ? '[TASK_TEMPLATE_OUTPUT]' : '[NODE_ESSENTIALS_OUTPUT]';
    
    // Replace placeholders in template
    const prompt = template
      .replace('[USER_GOAL]', workflowContext.userPrompt || workflowContext.description)
      .replace(/\[NODE_TYPE\]/g, node.type)
      .replace(/\[NODE_ID\]/g, node.id)
      .replace(/\[CATEGORY\]/g, node.category || 'general')
      .replace('[NODE_PURPOSE]', node.purpose || 'Process data')
      .replace(dataPlaceholder, JSON.stringify(dataToInsert, null, 2))
      .replace('[CATEGORY_RULES]', rules);
    
    return prompt;
  }
  
  /**
   * Build a simplified prompt for pre-configured nodes (shouldn't be needed)
   */
  buildSimplePrompt(node: DiscoveredNode, config: any): string {
    return `Node ${node.id} (${node.type}) is pre-configured with:
${JSON.stringify(config, null, 2)}

This node was configured from a task template and should not need additional configuration.`;
  }
  
  /**
   * Inline search template as fallback
   */
  private getInlineSearchTemplate(): string {
    return `# Configure Node

User Goal: [USER_GOAL]

Node Type: [NODE_TYPE]
Category: [CATEGORY]
Purpose: [NODE_PURPOSE]

## Node Essentials
\`\`\`json
[NODE_ESSENTIALS_OUTPUT]
\`\`\`

## Configuration Rules
[CATEGORY_RULES]

## Instructions
Configure this node based on:
1. The user's goal
2. The node essentials (required and common properties)
3. The category-specific rules

CRITICAL OUTPUT REQUIREMENT:
The response has been prefilled with {"operations":[
- Continue directly with the configuration object
- Do NOT add any text, greetings, or explanations
- Do NOT start a new JSON structure
- Your response should continue with: {"type":"configureNode",...}],"reasoning":[...]}
- Ensure the JSON is valid and complete`;
  }
  
  /**
   * Inline task template as fallback
   */
  private getInlineTaskTemplate(): string {
    return `# Configure Node - Task Template

User Goal: [USER_GOAL]

Node Type: [NODE_TYPE]
Category: [CATEGORY]
Purpose: [NODE_PURPOSE]

## Task Template (Starting Configuration)
\`\`\`json
[TASK_TEMPLATE_OUTPUT]
\`\`\`

## Configuration Rules
[CATEGORY_RULES]

## Instructions
Customize this pre-configured template based on:
1. The user's goal
2. The task template provided above
3. The category-specific rules

Adapt and customize the parameters while maintaining the core structure.

CRITICAL OUTPUT REQUIREMENT:
The response has been prefilled with {"operations":[
- Continue directly with the configuration object
- Do NOT add any text, greetings, or explanations
- Do NOT start a new JSON structure
- Your response should continue with: {"type":"configureNode",...}],"reasoning":[...]}
- Ensure the JSON is valid and complete`;
  }
}