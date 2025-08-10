# n8n Node Configuration Request - Task Template Customization

## User Goal

**[USER_GOAL]**

## Node to Configure

- **Type**: `[NODE_TYPE]`
- **Category**: `[CATEGORY]`
- **Purpose**: [NODE_PURPOSE]

## Task Template (Starting Configuration)

This node has a pre-configured template from a common task pattern. Use this as your starting point and customize it based on the user's specific requirements:

```json
[TASK_TEMPLATE_OUTPUT]
```

**Important**: This template provides a solid foundation. Adapt and customize the parameters to match the user's specific goal while maintaining the core structure.

## Configuration Rules for [CATEGORY] Nodes

[CATEGORY_RULES]

---

## Customization Strategy

### Template-Based Approach

You have a pre-configured template that handles the common use case. Your job is to customize it for the user's specific needs.

#### Step 1: Analyze the Template

Review the provided template configuration - it already handles the basic task pattern.

#### Step 2: Identify Customization Needs

Compare the user's goal with the template:
- What parameters need adjustment?
- What values should be customized?
- Are there missing features the user needs?

#### Step 3: Customize Parameters

Modify the template based on:
- User's specific data sources/destinations
- Custom field mappings
- Authentication requirements
- Error handling preferences
- Rate limits or performance requirements

#### Step 4: Add Missing Features (if needed)

If the user needs features not in the template:

```javascript
search_node_properties(nodeType, "feature_name"); // Find additional properties
```

### Customization Rules

**DO:**

- ✅ **ALWAYS preserve typeVersion from template**
- ✅ Start with the template structure
- ✅ Customize values to match user's context
- ✅ Keep working configurations from template
- ✅ Add features only if explicitly needed
- ✅ Update notes to describe the customized purpose
- ✅ Maintain the node/parameter property separation

**DON'T:**

- ❌ Remove working template configurations
- ❌ Rebuild from scratch
- ❌ Over-customize beyond requirements
- ❌ Change structure unless necessary

---

## Property Structure Guidelines

### Template Structure Preservation

The template already has correct property separation:
1. **Node-level**: Properties like `onError`, `retryOnFail`, `notes`
2. **Parameter-level**: Properties within `parameters` object

Maintain this structure when customizing.

### Common Customizations

**Data Mappings**: Update field references
- Template: `{{$json.genericField}}`
- Customize to: `{{$json.userSpecificField}}`

**Authentication**: Update credentials if specified
- Template may have placeholder auth
- Add user's specific auth method

**Endpoints/Channels**: Update destinations
- Template: Generic webhook path or channel
- Customize to: User's specific endpoint

---

## Required Output Format

```json
{
  "operations": [
    {
      "type": "configureNode",
      "nodeId": "[NODE_ID]",
      "config": {
        "typeVersion": "[PRESERVE_FROM_TEMPLATE]", // Keep the template's typeVersion
        "notes": "[Updated description of what this customized node achieves]",
        // Preserve node-level properties from template
        "parameters": {
          // Customized parameter-level properties
          // Start with template, modify as needed
        }
      }
    }
  ],
  "reasoning": [
    "How the template was customized for the user's goal",
    "Specific parameters adjusted and why",
    "Any features added beyond the template"
  ]
}
```

**Critical Requirements:**

- **MUST preserve `typeVersion` from template**
- **MUST maintain template's property structure**
- MUST include `operations` array
- MUST have `type: "configureNode"`
- MUST include exact `nodeId`
- Customize values, not structure (unless necessary)
- Include clear `reasoning` for customizations made