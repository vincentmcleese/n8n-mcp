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
- ✅ Use EXACT property names from essentials (typically lowercase like 'url', 'path', 'method')
- ✅ **Keep property names exactly as shown in essentials** - don't change capitalization
- ✅ Search for properties before assuming they exist
- ✅ Keep expressions simple and use string methods instead of regex when possible
- ✅ If property NOT in essentials → search_node_properties() for structure
- ✅ FixedCollections always need wrapper object - never direct arrays
- ✅ Start with minimal config, add incrementally
- ✅ Follow structure in requiredProperties/commonProperties

**DON'T:**

- ❌ Change property name capitalization (use exact case from essentials)
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

**IMPORTANT**: The response has been started with `{"operations":[`. You must continue this array with your configuration object.

Your response should be:

```
{
  "type": "configureNode",
  "nodeId": "[NODE_ID]",

  "config": {
    "notes": "[One sentence describing what this node achieves]",
      "typeVersion": "[USE_LATEST_FROM_ESSENTIALS]",
    // Other node-level properties (credentials, onError, etc.)
    "parameters": {
      // Parameter-level properties here
    }
  }
}],
"reasoning": [
  "Why this configuration solves the user's goal",
  "Any complexity added and why"
]}
```

**Critical Requirements:**

- **Continue the already-started JSON array** - do NOT start a new JSON structure
- **MUST include `typeVersion` from essentials (usually "X.Y" format can also be just "X" copy exactly)**
- **Never use regex literals in expressions** - they break JSON parsing.
- MUST have `type: "configureNode"`
- MUST include exact `nodeId`
- Node-level properties go OUTSIDE `parameters`
- Parameter-level properties go INSIDE `parameters`
- Include clear `reasoning` for choices made
- End with `]}` to properly close the array and object
