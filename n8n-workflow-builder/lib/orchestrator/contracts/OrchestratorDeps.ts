// lib/orchestrator/contracts/OrchestratorDeps.ts

import { ClaudeService } from "@/lib/services/claude-service";
import { AnthropicClient } from "@/services/claude";
import { MCPClient } from "@/lib/mcp-client";
import { PhaseManager } from "@/lib/phase-manager";
import { SessionRepo } from "@/lib/orchestrator/context/SessionRepo";
import { NodeContextService } from "@/lib/orchestrator/context/NodeContextService";

/**
 * Dependencies for WorkflowOrchestrator
 * Allows for easy testing and dependency injection
 */
export interface OrchestratorDeps {
  claudeService?: ClaudeService; // Deprecated - use anthropicClient
  anthropicClient?: AnthropicClient;
  mcpClient: MCPClient;
  phaseManager: PhaseManager;
  sessionRepo: SessionRepo;
  nodeContextService: NodeContextService;
}