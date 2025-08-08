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
  private templatePath: string;
  private template: string | null = null;
  
  constructor() {
    this.templatePath = path.join(
      process.cwd(),
      'services/claude/prompts/configureprompt.md'
    );
  }
  
  /**
   * Load the prompt template
   */
  private loadTemplate(): string {
    if (!this.template) {
      try {
        this.template = fs.readFileSync(this.templatePath, 'utf-8');
      } catch (error) {
        // Fallback to inline template if file not found
        this.template = this.getInlineTemplate();
      }
    }
    return this.template;
  }
  
  /**
   * Build configuration prompt for a node
   */
  buildPrompt(input: PromptBuilderInput): string {
    const { node, essentials, workflowContext } = input;
    const template = this.loadTemplate();
    
    // Get category-specific rules
    const rules = getCategoryRules(node.category || 'general', node.type);
    
    // Replace placeholders in template
    const prompt = template
      .replace('[USER_GOAL]', workflowContext.userPrompt || workflowContext.description)
      .replace(/\[NODE_TYPE\]/g, node.type)
      .replace(/\[NODE_ID\]/g, node.id)
      .replace(/\[CATEGORY\]/g, node.category || 'general')
      .replace('[NODE_PURPOSE]', node.purpose || 'Process data')
      .replace('[NODE_ESSENTIALS_OUTPUT]', JSON.stringify(essentials, null, 2))
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
   * Inline template as fallback
   */
  private getInlineTemplate(): string {
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

Return ONLY a JSON object with the configuration.`;
  }
}