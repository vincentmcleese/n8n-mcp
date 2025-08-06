/**
 * Documentation Phase Prompts
 * 
 * Prompts for generating workflow documentation and sticky notes.
 */

import { 
  PromptParts,
  BASE_N8N_CONTEXT,
  JSON_OUTPUT_RULES,
  addVersionMetadata
} from './common';
import { PREFILLS } from '../constants';

/**
 * Generate prompt for documentation phase
 */
export function getDocumentationPrompt(
  userPrompt: string,
  workflow: any,
  nodeMetadata: any
): PromptParts {
  const systemPrompt = `You are an n8n workflow documentation expert.

Documentation Phase - Add helpful sticky notes with markdown formatting:
- Create clear, concise sticky notes that explain workflow sections
- Each sticky note MUST start with a markdown title: ## 🎯 Title Here
- Group related nodes together under a single sticky note
- Focus on WHAT the workflow section does, not HOW individual nodes work
- Use friendly, non-technical language where possible

Sticky Note Format:
- Title: ## [emoji] [Short Descriptive Title]
- Description: 2-3 sentences explaining the section's purpose

Emoji Guidelines:
- 🎯 = Triggers/Entry points (webhooks, schedules)
- 📊 = Data processing/transformation
- 🔄 = Integration/API connections
- 💾 = Database operations
- 📧 = Communication (email, slack, notifications)
- ✅ = Validation/Success flows
- ⚠️ = Error handling/Important warnings
- 🤖 = AI/Automation logic
- 🔧 = Configuration/Setup
- 📝 = Logging/Recording

Color Guidelines (1-7):
1. Yellow (default) = General information/standard flow
2. Green = Success paths/positive outcomes
3. Blue = Informational/data processing
4. Red = Warnings/error handling/critical sections
5. Cyan = External integrations/APIs
6. Purple = AI/ML/Advanced logic
7. Orange = Configuration/setup/initialization

Guidelines:
- Create 1-5 sticky notes total (less is more)
- Each sticky note should cover a logical group of connected nodes
- Choose colors based on the section's purpose
- Use emojis that match the section's function

Example format:
{
  "operations": [
    {
      "type": "addStickyNote",
      "note": {
        "id": "sticky_1",
        "content": "## 🎯 Webhook Entry Point\\n\\nReceives incoming webhook data and validates the payload structure before processing.",
        "nodeGroupIds": ["node_1", "node_2"],
        "color": 3
      }
    }
  ],
  "reasoning": ["Grouped webhook and validation nodes", "..."]
}

IMPORTANT: Each operation MUST have:
- type: "addStickyNote" 
- note object with: id (e.g. "sticky_1"), content (with markdown title), nodeGroupIds array, color (1-7)
- The nodeGroupIds should match the node IDs from the metadata
- Content MUST start with ## [emoji] [title]\\n\\n[description]

Return ONLY valid JSON matching this format exactly.`;

  const userMessage = `Original user request: "${userPrompt}"

Workflow metadata:
${JSON.stringify(nodeMetadata, null, 2)}

Create sticky notes to document this workflow. Group related nodes together and explain what each section does.

Remember to return valid JSON starting with {"operations":[ and include helpful reasoning.`;

  return addVersionMetadata({
    system: systemPrompt,
    user: userMessage,
    prefill: PREFILLS.DOCUMENTATION
  }, 'documentation');
}

export const DocumentationPrompts = {
  getDocumentationPrompt,
};