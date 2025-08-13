/**
 * Node Categorization Service
 *
 * Categorizes searched nodes from MCP for optimized configuration.
 * Groups nodes by category, package, special type, and complexity to enable
 * targeted configuration strategies and reduce token usage.
 */

import { Logger } from "../../lib/utils/logger";

export interface SearchNodeResult {
  nodeType: string; // "nodes-base.slack"
  workflowNodeType: string; // "n8n-nodes-base.slack"
  displayName: string; // "Slack"
  description: string; // "Consume Slack API"
  category: string; // "output", "trigger", "transform", "input"
  package: string; // "n8n-nodes-base" or "@n8n/n8n-nodes-langchain"
  relevance: string; // "high", "medium", "low"
}

export interface CategorizedNodes {
  byCategory: {
    triggers: SearchNodeResult[];
    transforms: SearchNodeResult[];
    outputs: SearchNodeResult[];
    inputs: SearchNodeResult[];
  };
  byPackage: {
    core: SearchNodeResult[];
    ai: SearchNodeResult[];
  };
  bySpecialType: {
    codeNodes: SearchNodeResult[];
    aiModels: SearchNodeResult[];
    agents: SearchNodeResult[];
    databases: SearchNodeResult[];
    webhooks: SearchNodeResult[];
    httpRequests: SearchNodeResult[];
    conditions: SearchNodeResult[];
    loops: SearchNodeResult[];
    merges: SearchNodeResult[];
  };
  byComplexity: {
    simple: SearchNodeResult[];
    moderate: SearchNodeResult[];
    complex: SearchNodeResult[];
  };
  byConnectionPattern: {
    passthrough: SearchNodeResult[];
    branching: SearchNodeResult[];
    aggregating: SearchNodeResult[];
    generating: SearchNodeResult[];
  };
}

export interface ConfigurationStrategy {
  order: string[]; // Processing order
  batches: ConfigurationBatch[]; // Batch configuration groups
  rulesNeeded: string[]; // Required rule sets
  estimatedTokens: number; // Token budget estimate
}

export interface ConfigurationBatch {
  id: string;
  name: string;
  nodes: SearchNodeResult[];
  strategy: "minimal" | "credential-focused" | "individual" | "example-based";
  promptType: string;
  maxTokens: number;
  parallel?: boolean;
  priority: number;
}

export interface CategorizationResult {
  categorized: CategorizedNodes;
  configurationStrategy: ConfigurationStrategy;
  configurationBatches: ConfigurationBatch[];
  rulesNeeded: string[];
  promptTemplates: string[];
}

export class NodeCategorizationService {
  private logger: Logger;

  // Database node types
  private readonly DATABASE_TYPES = [
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "sqlite",
    "mssql",
  ];

  // AI model node types
  private readonly AI_MODEL_TYPES = [
    "openAi",
    "anthropic",
    "gemini",
    "cohere",
    "huggingFace",
    "ollama",
  ];

  // Condition node types
  private readonly CONDITION_TYPES = ["if", "switch", "filter", "router"];

  // Loop node types
  private readonly LOOP_TYPES = ["loop", "splitInBatches", "itemLists"];

  // Merge node types
  private readonly MERGE_TYPES = ["merge", "join", "combine", "aggregate"];

  constructor() {
    this.logger = Logger.create("NodeCategorizationService");
  }

  /**
   * Main categorization method
   */
  categorizeSearchedNodes(
    searchResults: SearchNodeResult[]
  ): CategorizationResult {
    this.logger.info(`Categorizing ${searchResults.length} searched nodes`);

    const categorized = {
      byCategory: this.groupByCategory(searchResults),
      byPackage: this.groupByPackage(searchResults),
      bySpecialType: this.groupBySpecialType(searchResults),
      byComplexity: this.groupByComplexity(searchResults),
      byConnectionPattern: this.groupByConnectionPattern(searchResults),
    };

    const strategy = this.buildConfigurationStrategy(categorized);
    const batches = this.createConfigurationBatches(categorized);
    const rulesNeeded = this.determineRulesNeeded(categorized);
    const promptTemplates = this.selectPromptTemplates(categorized);

    this.logger.info(`Categorization complete:
      - Triggers: ${categorized.byCategory.triggers.length}
      - Transforms: ${categorized.byCategory.transforms.length}
      - Outputs: ${categorized.byCategory.outputs.length}
      - Complex nodes: ${categorized.byComplexity.complex.length}
      - Batches created: ${batches.length}
      - Rules needed: ${rulesNeeded.join(", ")}`);

    return {
      categorized,
      configurationStrategy: strategy,
      configurationBatches: batches,
      rulesNeeded,
      promptTemplates,
    };
  }

  /**
   * Group nodes by their category field
   */
  private groupByCategory(
    nodes: SearchNodeResult[]
  ): CategorizedNodes["byCategory"] {
    return {
      triggers: nodes.filter((n) => n.category === "trigger"),
      transforms: nodes.filter((n) => n.category === "transform"),
      outputs: nodes.filter((n) => n.category === "output"),
      inputs: nodes.filter((n) => n.category === "input"),
    };
  }

  /**
   * Group nodes by package (core vs AI)
   */
  private groupByPackage(
    nodes: SearchNodeResult[]
  ): CategorizedNodes["byPackage"] {
    return {
      core: nodes.filter((n) => n.package === "n8n-nodes-base"),
      ai: nodes.filter(
        (n) =>
          n.package === "@n8n/n8n-nodes-langchain" ||
          n.package.includes("langchain")
      ),
    };
  }

  /**
   * Group nodes by special types based on nodeType analysis
   */
  private groupBySpecialType(
    nodes: SearchNodeResult[]
  ): CategorizedNodes["bySpecialType"] {
    return {
      codeNodes: nodes.filter(
        (n) =>
          n.nodeType === "nodes-base.code" ||
          n.nodeType === "nodes-base.function"
      ),
      aiModels: nodes.filter((n) => this.isAiModel(n)),
      agents: nodes.filter(
        (n) => n.nodeType.includes("agent") || n.nodeType.includes("Agent")
      ),
      databases: nodes.filter((n) => this.isDatabase(n)),
      webhooks: nodes.filter(
        (n) => n.nodeType.includes("webhook") || n.nodeType.includes("Webhook")
      ),
      httpRequests: nodes.filter(
        (n) =>
          n.nodeType.includes("httpRequest") ||
          n.nodeType === "nodes-base.httpRequest"
      ),
      conditions: nodes.filter((n) => this.isCondition(n)),
      loops: nodes.filter((n) => this.isLoop(n)),
      merges: nodes.filter((n) => this.isMerge(n)),
    };
  }

  /**
   * Group nodes by complexity assessment
   */
  private groupByComplexity(
    nodes: SearchNodeResult[]
  ): CategorizedNodes["byComplexity"] {
    return {
      simple: nodes.filter((n) => this.assessComplexity(n) === "simple"),
      moderate: nodes.filter((n) => this.assessComplexity(n) === "moderate"),
      complex: nodes.filter((n) => this.assessComplexity(n) === "complex"),
    };
  }

  /**
   * Group nodes by connection pattern
   */
  private groupByConnectionPattern(
    nodes: SearchNodeResult[]
  ): CategorizedNodes["byConnectionPattern"] {
    return {
      passthrough: nodes.filter((n) => this.isPassthrough(n)),
      branching: nodes.filter((n) => this.isBranching(n)),
      aggregating: nodes.filter((n) => this.isAggregating(n)),
      generating: nodes.filter((n) => this.isGenerating(n)),
    };
  }

  /**
   * Build configuration strategy based on categorization
   */
  private buildConfigurationStrategy(
    categorized: CategorizedNodes
  ): ConfigurationStrategy {
    // Optimal processing order
    const order = [
      "triggers", // Entry points first
      "inputs", // Data sources
      "transforms", // Core logic
      "conditions", // Branching logic
      "outputs", // Destinations
      "error_handlers", // Safety nets
    ];

    // Calculate estimated tokens
    const estimatedTokens =
      categorized.byComplexity.simple.length * 100 +
      categorized.byComplexity.moderate.length * 300 +
      categorized.byComplexity.complex.length * 500;

    return {
      order,
      batches: [], // Will be filled by createConfigurationBatches
      rulesNeeded: this.determineRulesNeeded(categorized),
      estimatedTokens,
    };
  }

  /**
   * Create configuration batches for efficient processing
   */
  private createConfigurationBatches(
    categorized: CategorizedNodes
  ): ConfigurationBatch[] {
    const batches: ConfigurationBatch[] = [];
    let priority = 1;

    // Batch 1: Simple passthrough nodes
    if (categorized.byComplexity.simple.length > 0) {
      batches.push({
        id: "simple-batch",
        name: "Simple Passthrough Nodes",
        nodes: categorized.byComplexity.simple,
        strategy: "minimal",
        promptType: "SIMPLE_BATCH_PROMPT",
        maxTokens: 500,
        parallel: true,
        priority: priority++,
      });
    }

    // Batch 2: Trigger nodes
    if (categorized.byCategory.triggers.length > 0) {
      batches.push({
        id: "trigger-batch",
        name: "Trigger Nodes",
        nodes: categorized.byCategory.triggers,
        strategy: "example-based",
        promptType: "TRIGGER_BATCH_PROMPT",
        maxTokens: 800,
        parallel: false,
        priority: priority++,
      });
    }

    // Batch 3: Database and auth-required nodes
    const authNodes = [
      ...categorized.bySpecialType.databases,
      ...categorized.bySpecialType.httpRequests.filter(
        (n) =>
          n.description.toLowerCase().includes("auth") ||
          n.description.toLowerCase().includes("api")
      ),
    ];

    if (authNodes.length > 0) {
      batches.push({
        id: "auth-batch",
        name: "Authentication Required Nodes",
        nodes: authNodes,
        strategy: "credential-focused",
        promptType: "AUTH_BATCH_PROMPT",
        maxTokens: 1200,
        parallel: false,
        priority: priority++,
      });
    }

    // Batch 4: AI and Agent nodes
    const aiNodes = [
      ...categorized.bySpecialType.aiModels,
      ...categorized.bySpecialType.agents,
      ...categorized.byPackage.ai,
    ];

    if (aiNodes.length > 0) {
      batches.push({
        id: "ai-batch",
        name: "AI and Agent Nodes",
        nodes: this.deduplicateNodes(aiNodes),
        strategy: "individual",
        promptType: "AI_NODE_PROMPT",
        maxTokens: 2000,
        parallel: false,
        priority: priority++,
      });
    }

    // Batch 5: Code and complex logic nodes
    if (categorized.bySpecialType.codeNodes.length > 0) {
      batches.push({
        id: "code-batch",
        name: "Code and Function Nodes",
        nodes: categorized.bySpecialType.codeNodes,
        strategy: "example-based",
        promptType: "CODE_NODE_PROMPT",
        maxTokens: 1500,
        parallel: false,
        priority: priority++,
      });
    }

    // Batch 6: Condition and branching nodes
    const branchingNodes = [
      ...categorized.bySpecialType.conditions,
      ...categorized.byConnectionPattern.branching,
    ];

    if (branchingNodes.length > 0) {
      batches.push({
        id: "condition-batch",
        name: "Condition and Branching Nodes",
        nodes: this.deduplicateNodes(branchingNodes),
        strategy: "example-based",
        promptType: "CONDITION_BATCH_PROMPT",
        maxTokens: 1000,
        parallel: false,
        priority: priority++,
      });
    }

    // Sort batches by priority
    return batches.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Determine which rule sets are needed
   */
  private determineRulesNeeded(categorized: CategorizedNodes): string[] {
    const rules: string[] = [];

    if (categorized.bySpecialType.codeNodes.length > 0) {
      rules.push("CODE_NODE_RULES");
    }

    if (
      categorized.byPackage.ai.length > 0 ||
      categorized.bySpecialType.aiModels.length > 0 ||
      categorized.bySpecialType.agents.length > 0
    ) {
      rules.push("AI_NODE_RULES", "AI_CONNECTION_RULES");
    }

    if (categorized.bySpecialType.webhooks.length > 0) {
      rules.push("WEBHOOK_RULES");
    }

    if (categorized.bySpecialType.databases.length > 0) {
      rules.push("DATABASE_RULES", "CREDENTIAL_RULES");
    }

    if (categorized.bySpecialType.conditions.length > 0) {
      rules.push("CONDITION_RULES", "EXPRESSION_RULES");
    }

    if (categorized.bySpecialType.loops.length > 0) {
      rules.push("LOOP_RULES");
    }

    if (categorized.byCategory.transforms.length > 0) {
      rules.push("TRANSFORM_RULES", "DATA_MAPPING_RULES");
    }

    return [...new Set(rules)]; // Remove duplicates
  }

  /**
   * Select appropriate prompt templates
   */
  private selectPromptTemplates(categorized: CategorizedNodes): string[] {
    const templates: string[] = [];

    // Add templates based on what's present
    if (categorized.byCategory.triggers.length > 0) {
      templates.push("TRIGGER_NODE_PROMPT");
    }
    if (categorized.byCategory.transforms.length > 0) {
      templates.push("TRANSFORM_NODE_PROMPT");
    }
    if (categorized.byCategory.outputs.length > 0) {
      templates.push("OUTPUT_NODE_PROMPT");
    }
    if (categorized.byPackage.ai.length > 0) {
      templates.push("AI_NODE_PROMPT");
    }
    if (categorized.bySpecialType.codeNodes.length > 0) {
      templates.push("CODE_NODE_PROMPT");
    }
    if (categorized.bySpecialType.databases.length > 0) {
      templates.push("DATABASE_NODE_PROMPT");
    }

    return templates;
  }

  /**
   * Helper: Check if node is an AI model
   */
  private isAiModel(node: SearchNodeResult): boolean {
    return this.AI_MODEL_TYPES.some((type) =>
      node.nodeType.toLowerCase().includes(type.toLowerCase())
    );
  }

  /**
   * Helper: Check if node is a database
   */
  private isDatabase(node: SearchNodeResult): boolean {
    return this.DATABASE_TYPES.some((db) =>
      node.nodeType.toLowerCase().includes(db)
    );
  }

  /**
   * Helper: Check if node is a condition
   */
  private isCondition(node: SearchNodeResult): boolean {
    return this.CONDITION_TYPES.some((type) =>
      node.nodeType.toLowerCase().includes(type)
    );
  }

  /**
   * Helper: Check if node is a loop
   */
  private isLoop(node: SearchNodeResult): boolean {
    return this.LOOP_TYPES.some((type) =>
      node.nodeType.toLowerCase().includes(type.toLowerCase())
    );
  }

  /**
   * Helper: Check if node is a merge
   */
  private isMerge(node: SearchNodeResult): boolean {
    return this.MERGE_TYPES.some((type) =>
      node.nodeType.toLowerCase().includes(type)
    );
  }

  /**
   * Helper: Assess node complexity
   */
  private assessComplexity(
    node: SearchNodeResult
  ): "simple" | "moderate" | "complex" {
    // Complex: AI, agents, code nodes
    if (
      this.isAiModel(node) ||
      node.nodeType.includes("agent") ||
      node.nodeType === "nodes-base.code"
    ) {
      return "complex";
    }

    // Complex: Databases
    if (this.isDatabase(node)) {
      return "complex";
    }

    // Moderate: Conditions, loops, auth-required
    if (
      this.isCondition(node) ||
      this.isLoop(node) ||
      node.description.toLowerCase().includes("auth")
    ) {
      return "moderate";
    }

    // Simple: Basic transforms, outputs without auth
    return "simple";
  }

  /**
   * Helper: Check if node is passthrough
   */
  private isPassthrough(node: SearchNodeResult): boolean {
    return (
      node.category === "transform" &&
      !this.isCondition(node) &&
      !this.isLoop(node) &&
      !this.isMerge(node)
    );
  }

  /**
   * Helper: Check if node is branching
   */
  private isBranching(node: SearchNodeResult): boolean {
    return (
      this.isCondition(node) ||
      node.nodeType.includes("router") ||
      node.nodeType.includes("switch")
    );
  }

  /**
   * Helper: Check if node is aggregating
   */
  private isAggregating(node: SearchNodeResult): boolean {
    return (
      this.isMerge(node) ||
      node.nodeType.includes("aggregate") ||
      node.nodeType.includes("combine")
    );
  }

  /**
   * Helper: Check if node is generating
   */
  private isGenerating(node: SearchNodeResult): boolean {
    return (
      node.category === "trigger" ||
      node.nodeType === "nodes-base.code" ||
      this.isAiModel(node)
    );
  }

  /**
   * Helper: Remove duplicate nodes from array
   */
  private deduplicateNodes(nodes: SearchNodeResult[]): SearchNodeResult[] {
    const seen = new Set<string>();
    return nodes.filter((node) => {
      const key = node.nodeType;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate configuration hints for a specific node
   */
  generateConfigurationHint(node: SearchNodeResult): {
    complexity: "simple" | "moderate" | "complex";
    needsCredentials: boolean;
    canBeAiTool: boolean;
    typicalRole: string;
    suggestedConfig: string[];
  } {
    return {
      complexity: this.assessComplexity(node),
      needsCredentials: this.checkCredentialNeeds(node),
      canBeAiTool: node.package === "@n8n/n8n-nodes-langchain",
      typicalRole: this.determineTypicalRole(node),
      suggestedConfig: this.getSuggestedConfig(node),
    };
  }

  /**
   * Check if node typically needs credentials
   */
  private checkCredentialNeeds(node: SearchNodeResult): boolean {
    return (
      this.isDatabase(node) ||
      node.description.toLowerCase().includes("auth") ||
      node.description.toLowerCase().includes("api") ||
      node.nodeType.includes("slack") ||
      node.nodeType.includes("gmail") ||
      node.nodeType.includes("sheets")
    );
  }

  /**
   * Determine typical role of node in workflow
   */
  private determineTypicalRole(node: SearchNodeResult): string {
    if (node.category === "trigger") return "workflow_starter";
    if (node.category === "output") return "data_destination";
    if (this.isCondition(node)) return "flow_control";
    if (this.isLoop(node)) return "batch_processor";
    if (this.isMerge(node)) return "data_combiner";
    if (node.category === "transform") return "data_transformer";
    return "general_processor";
  }

  /**
   * Get suggested configuration fields for node
   */
  private getSuggestedConfig(node: SearchNodeResult): string[] {
    const suggestions: string[] = [];

    if (node.category === "trigger") {
      suggestions.push("activation_method", "validation_rules");
    }

    if (this.isDatabase(node)) {
      suggestions.push("connection_string", "query", "operation_type");
    }

    if (this.isAiModel(node)) {
      suggestions.push("model", "temperature", "max_tokens", "system_prompt");
    }

    if (this.isCondition(node)) {
      suggestions.push("condition_expression", "branches", "fallback");
    }

    if (node.nodeType === "nodes-base.code") {
      suggestions.push("language", "code", "input_access", "output_format");
    }

    return suggestions;
  }
}
