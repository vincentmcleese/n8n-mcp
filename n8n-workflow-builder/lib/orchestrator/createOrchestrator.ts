// lib/orchestrator/createOrchestrator.ts

import { WorkflowOrchestrator } from "@/lib/workflow-orchestrator";
import { MCPClient } from "@/lib/mcp-client";
import { PhaseManager } from "@/lib/phase-manager";
import { SessionRepo } from "@/lib/orchestrator/context/SessionRepo";
import { NodeContextService } from "@/lib/orchestrator/context/NodeContextService";
import { OrchestratorDeps } from "@/lib/orchestrator/contracts/OrchestratorDeps";

/**
 * Factory function to create a WorkflowOrchestrator with default dependencies
 * This maintains backward compatibility while allowing for dependency injection
 */
export function createOrchestrator(overrides?: Partial<OrchestratorDeps>): WorkflowOrchestrator {
  // Create MCP client first as it's needed by NodeContextService
  const mcpClient = overrides?.mcpClient || MCPClient.getInstance({
    serverUrl: process.env.MCP_SERVER_URL || "https://mcp.smithery.ai",
    apiKey: process.env.MCP_API_KEY || "",
    profile: process.env.MCP_PROFILE || "default",
  });

  const deps: OrchestratorDeps = {
    claudeService: overrides?.claudeService || null, // Claude service now optional
    mcpClient,
    phaseManager: overrides?.phaseManager || new PhaseManager(),
    sessionRepo: overrides?.sessionRepo || new SessionRepo(),
    nodeContextService: overrides?.nodeContextService || new NodeContextService(mcpClient),
  };

  return new WorkflowOrchestrator(deps);
}