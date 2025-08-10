# n8n Node Configuration Request

## User Goal

**[USER_GOAL]**

## Node to Configure

- **Type**: `[NODE_TYPE]`
- **Category**: `[CATEGORY]`
- **Purpose**: [NODE_PURPOSE]

## Node Essentials (Core Properties)

```json
[NODE_ESSENTIALS_OUTPUT]
```

## Configuration Rules for [CATEGORY] Nodes

[CATEGORY_RULES]

---

## Configuration Strategy

### Progressive Complexity Approach

Start simple, add complexity only when the user's requirements demand it.

#### Level 1: Simple (80% of cases)

Use essentials only - the configuration provided above is usually sufficient.

#### Level 2: Feature Search (15% of cases)

Search for specific properties when user mentions them or required to complete the node purpose:

```javascript
search_node_properties(nodeType, "authentication"); // "with auth"
search_node_properties(nodeType, "retry"); // "reliable"
search_node_properties(nodeType, "pagination"); // "all pages"
```

#### Level 3: Complex (5% of cases)

For multi-feature requirements:

1. `get_node_documentation(nodeType)` - Understand patterns
2. Use essentials as foundation
3. Search multiple specific features
4. Build sophisticated config

#### Level 4: Full Schema (<1% of cases)

`get_node_info(nodeType)` - Last resort only (100KB+ response)

### Configuration Rules

**DO:**

- ✅ **ALWAYS include typeVersion from essentials (deployment critical!)**
- ✅ Use EXACT property names from essentials
- ✅ Search for properties before assuming they exist
- ✅ If property NOT in essentials → search_node_properties() for structure
- ✅ FixedCollections always need wrapper object - never direct arrays
- ✅ Start with minimal config, add incrementally
- ✅ Follow structure in requiredProperties/commonProperties

**DON'T:**

- ❌ Invent property names
- ❌ Add unrequested features
- ❌ Jump to get_node_info
- ❌ Over-engineer

---

## Property Structure Guidelines

### Node-level vs Parameter-level

1. **Parameter-level**: Properties in `commonProperties` or `requiredProperties`
2. **Node-level**: Properties in examples but NOT in commonProperties (credentials, onError, retryOnFail, notes)
3. Always add descriptive `notes` property at node-level

### FixedCollection Properties

Format: `{ "wrapperKey": [array] }`

- ALL fixedCollection properties require a wrapper - never a direct array
- The wrapper key should be visible in essentials (look for options[].name or the property structure)
- If not in essentials, you MUST search_node_properties() to find the correct wrapper
- Example: `extractionValues` needs `{ "values": [...] }` not direct array

---

## Required Output Format

```json
{
  "operations": [
    {
      "type": "configureNode",
      "nodeId": "[NODE_ID]",
      "config": {
        "typeVersion": "[USE_LATEST_FROM_ESSENTIALS]", // ALWAYS include latest typeVersion from essentials
        "notes": "[One sentence describing what this node achieves]",
        // Other node-level properties (credentials, onError, etc.)
        "parameters": {
          // Parameter-level properties here
        }
      }
    }
  ],
  "reasoning": [
    "Why this configuration solves the user's goal",
    "Any complexity added and why"
  ]
}
```

**Critical Requirements:**

- **MUST include `typeVersion` from essentials (prevents deployment failures)**
- MUST include `operations` array
- MUST have `type: "configureNode"`
- MUST include exact `nodeId`
- Node-level properties go OUTSIDE `parameters`
- Parameter-level properties go INSIDE `parameters`
- Include clear `reasoning` for choices made
