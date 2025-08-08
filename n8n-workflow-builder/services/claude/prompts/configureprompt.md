# Node Configuration Request

## User Goal
[USER_GOAL]

## Node to Configure
- **Type**: [NODE_TYPE]
- **Category**: [CATEGORY]
- **Purpose**: [NODE_PURPOSE]

## Node Essentials (Core Properties)
```json
[NODE_ESSENTIALS_OUTPUT]
```

## Configuration Rules for [CATEGORY] Nodes
[CATEGORY_RULES]

## Instructions
Based on the user's goal and the node essentials above:

1. **Use the EXACT property names** shown in the essentials
2. **Follow the structure** defined in requiredProperties and commonProperties
3. **Apply the category-specific rules** provided above
4. **Fill in user-specific values** based on the goal

For properties with type "fixedCollection":
- Use the format: `{ "optionValue": [array] }`
- The optionValue comes from `options[].value` in the essentials

## Required Output Format
Return a JSON object with this EXACT structure:

```json
{
  "operations": [
    {
      "type": "configureNode",
      "nodeId": "[NODE_ID]",
      "config": {
        // Your configuration parameters here
      }
    }
  ],
  "reasoning": [
    "Explanation of configuration choices"
  ]
}
```

IMPORTANT: 
- The response MUST include an "operations" array
- Each operation MUST have "type": "configureNode"
- Each operation MUST have the exact "nodeId" being configured
- Each operation MUST have a "config" object with the node parameters
- Include a "reasoning" array with explanations