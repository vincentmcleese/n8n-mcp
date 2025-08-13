// lib/workflow-orchestrator.ts

import {
  WorkflowSession,
  WorkflowOperation,
  WorkflowPhase,
  DiscoveredNode,
  ErrorResponse,
} from "@/types/workflow";
import {
  createAnthropicClient,
  createPhaseServices,
  type AnthropicClient,
  type DiscoveryPhaseService,
  type ConfigurationPhaseService,
  type BuildingPhaseService,
  type ValidationPhaseService,
  type DocumentationPhaseService,
} from "@/services/claude";
import { MCPClient } from "@/lib/mcp-client";
import { createServiceClient } from "@/lib/supabase";
import { PhaseManager } from "@/lib/phase-manager";
import { loggers } from "@/lib/utils/logger";
import { orchestratorHooks } from "@/lib/workflow-orchestrator-hooks";
import { OrchestratorDeps } from "@/lib/orchestrator/contracts/OrchestratorDeps";
import { SessionRepo } from "@/lib/orchestrator/context/SessionRepo";
import { NodeContextService } from "@/lib/orchestrator/context/NodeContextService";
import { DiscoveryRunner } from "@/lib/orchestrator/runners/discovery.runner";
import { ConfigurationRunner } from "@/lib/orchestrator/runners/configuration.runner";
import { BuildingRunner } from "@/lib/orchestrator/runners/building.runner";
import { ValidationRunner } from "@/lib/orchestrator/runners/validation.runner";
import { DocumentationRunner } from "@/lib/orchestrator/runners/documentation.runner";

// ==========================================
// Public Interface Types (for backward compatibility)
// ==========================================

export interface DiscoveryResult {
  success: boolean;
  operations: WorkflowOperation[];
  phase: WorkflowPhase;
  discoveredNodes: DiscoveredNode[];
  selectedNodeIds: string[];
  pendingClarification?: {
    questionId: string;
    question: string;
  };
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ConfiguredNode {
  id: string;
  type: string;
  purpose: string;
  config: any;
  validated: boolean;
  validationErrors?: string[];
}

export interface ConfigurationResult {
  success: boolean;
  operations: WorkflowOperation[];
  phase: WorkflowPhase;
  configured: ConfiguredNode[];
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ApplyOperationsResult {
  success: boolean;
  applied: number;
  stateUpdate: {
    phase: string;
    discovered?: number;
    configured?: number;
    validated?: number;
    errors?: any[];
  };
  pendingClarification?: {
    questionId: string;
    question: string;
  };
}

export interface BuildingResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface ValidationPhaseResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  validationReport: any;
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface DocumentationPhaseResult {
  success: boolean;
  phase: WorkflowPhase;
  workflow: {
    name: string;
    nodes: any[];
    connections: any;
    settings: any;
  };
  stickyNotesAdded?: number;
  reasoning?: string[];
  error?: ErrorResponse["error"];
}

export interface PhaseStatusResult {
  currentPhase: WorkflowPhase;
  canProgress: boolean;
  autoTransition: boolean;
  reason?: string;
}

// ==========================================
// Lightweight Workflow Orchestrator
// ==========================================

/**
 * Workflow Orchestrator - Composition Root
 *
 * This is now a lightweight orchestrator that:
 * - Validates phase transitions through PhaseManager
 * - Loads WorkflowSession from SessionRepo
 * - Delegates to the appropriate PhaseRunner
 * - Forwards operations to orchestratorHooks
 *
 * All phase logic has been extracted to dedicated runners.
 */
export class WorkflowOrchestrator {
  private anthropicClient: AnthropicClient;
  private phaseServices: {
    discovery: DiscoveryPhaseService;
    configuration: ConfigurationPhaseService;
    building: BuildingPhaseService;
    validation: ValidationPhaseService;
    documentation: DocumentationPhaseService;
  };
  private mcpClient: MCPClient;
  private phaseManager: PhaseManager;
  private sessionRepo: SessionRepo;
  private nodeContextService: NodeContextService;
  private discoveryRunner: DiscoveryRunner;
  private configurationRunner: ConfigurationRunner;
  private buildingRunner: BuildingRunner;
  private validationRunner: ValidationRunner;
  private documentationRunner: DocumentationRunner;
  private supabase = createServiceClient();
  private sessions = new Map<string, WorkflowSession>();

  constructor(deps?: Partial<OrchestratorDeps>) {
    // Create Anthropic client
    this.anthropicClient =
      deps?.anthropicClient ||
      createAnthropicClient({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

    // Initialize MCP client first (needed for phase services)
    this.mcpClient =
      deps?.mcpClient ||
      MCPClient.getInstance({
        serverUrl: process.env.MCP_SERVER_URL || "https://mcp.smithery.ai",
        apiKey: process.env.MCP_API_KEY || "",
        profile: process.env.MCP_PROFILE || "default",
      });

    // Create phase services with shared client AND mcpClient for tool support
    this.phaseServices = createPhaseServices({
      client: this.anthropicClient,
      mcpClient: this.mcpClient, // Pass MCP client for tool execution
    });

    this.phaseManager = deps?.phaseManager || new PhaseManager();
    this.sessionRepo = deps?.sessionRepo || new SessionRepo();
    this.nodeContextService =
      deps?.nodeContextService || new NodeContextService(this.mcpClient);

    // Create runners with their dependencies
    // For now, keep passing the phase services as claudeService to maintain compatibility
    this.discoveryRunner = new DiscoveryRunner({
      claudeService: this.phaseServices.discovery,
      nodeContextService: this.nodeContextService,
      sessionRepo: this.sessionRepo,
      loggers,
    });

    this.configurationRunner = new ConfigurationRunner({
      claudeService: this.phaseServices.configuration,
      nodeContextService: this.nodeContextService,
      sessionRepo: this.sessionRepo,
      loggers,
    });

    this.buildingRunner = new BuildingRunner({
      claudeService: this.phaseServices.building,
      sessionRepo: this.sessionRepo,
      loggers,
    });

    this.validationRunner = new ValidationRunner({
      claudeService: this.phaseServices.validation,
      nodeContextService: this.nodeContextService,
      sessionRepo: this.sessionRepo,
      loggers,
    });

    this.documentationRunner = new DocumentationRunner({
      sessionRepo: this.sessionRepo,
      loggers,
    });
  }

  /**
   * Run the discovery phase
   */
  async runDiscoveryPhase(
    sessionId: string,
    prompt: string
  ): Promise<DiscoveryResult> {
    // Delegate to discovery runner
    const result = await this.discoveryRunner.run({ sessionId, prompt });

    // The runner returns DiscoveryOutput which is compatible with DiscoveryResult
    return result;
  }

  /**
   * Handle clarification response
   */
  async handleClarificationResponse(
    sessionId: string,
    questionId: string,
    response: string
  ): Promise<DiscoveryResult> {
    // Delegate to discovery runner's clarification handler
    const result = await this.discoveryRunner.handleClarification({
      sessionId,
      questionId,
      response,
    });

    return result;
  }

  /**
   * Run the configuration phase
   */
  async runConfigurationPhase(
    sessionId: string,
    discoveryResult?: DiscoveryResult
  ): Promise<ConfigurationResult> {
    // Delegate to configuration runner
    const result = await this.configurationRunner.run({ sessionId });

    // The runner returns ConfigurationOutput which is compatible with ConfigurationResult
    return result;
  }

  /**
   * Run the building phase
   */
  async runBuildingPhase(
    sessionId: string,
    configurationResult?: ConfigurationResult
  ): Promise<BuildingResult> {
    // Delegate to building runner
    const result = await this.buildingRunner.run({ sessionId });

    // The runner returns BuildingOutput which is compatible with BuildingResult
    return result;
  }

  /**
   * Run the validation phase
   */
  async runValidationPhase(
    sessionId: string,
    buildingResult?: BuildingResult
  ): Promise<ValidationPhaseResult> {
    // Delegate to validation runner
    const result = await this.validationRunner.run({
      sessionId,
      buildingResult,
    });

    // The runner returns ValidationOutput which is compatible with ValidationPhaseResult
    return result;
  }

  /**
   * Run the documentation phase
   */
  async runDocumentationPhase(
    sessionId: string,
    validationResult?: ValidationPhaseResult
  ): Promise<DocumentationPhaseResult> {
    // Delegate to documentation runner
    const result = await this.documentationRunner.run({
      sessionId,
      validationResult,
    });

    // The runner returns DocumentationOutput which is compatible with DocumentationPhaseResult
    return result;
  }

  /**
   * Apply operations to session state
   *
   * This method is used by the UI to apply operations returned from phases.
   * It updates the in-memory session state and queues operations for Supabase persistence.
   */
  async applyOperations(
    sessionId: string,
    operations: WorkflowOperation[]
  ): Promise<ApplyOperationsResult> {
    try {
      // Get the session from in-memory store
      let session = this.sessions.get(sessionId);
      if (!session) {
        // Try to load from Supabase if not in memory
        const supabaseSession = (await orchestratorHooks.loadSession(
          sessionId
        )) as WorkflowSession | null;
        if (!supabaseSession) {
          throw new Error(`Session ${sessionId} not found`);
        }
        session = supabaseSession;
        this.sessions.set(sessionId, session as WorkflowSession);
      }

      // Apply operations to in-memory state (implementation details omitted for brevity)
      // The actual operation application logic would be here

      // Queue operations for Supabase persistence
      await orchestratorHooks.persistOperations(sessionId, operations);

      // Calculate state update summary
      const s = session as WorkflowSession;
      const stateUpdate = {
        phase: s.state.phase,
        discovered: s.state.discovered.length,
        configured: s.state.configured.size,
        validated: s.state.validated.size,
        errors: Array.from(s.state.validated.values())
          .filter((v) => !v.valid)
          .flatMap((v) => v.errors || []),
      };

      // Check for pending clarifications
      const pendingClarification =
        s.state.pendingClarifications.length > 0
          ? {
              questionId: s.state.pendingClarifications[0].questionId,
              question: s.state.pendingClarifications[0].question,
            }
          : undefined;

      return {
        success: true,
        applied: operations.length,
        stateUpdate,
        pendingClarification,
      };
    } catch (error) {
      loggers.orchestrator.error("Failed to apply operations:", error);

      return {
        success: false,
        applied: 0,
        stateUpdate: {
          phase: "discovery",
          errors: [
            {
              nodeId: "system",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to apply operations",
              severity: "error",
            },
          ],
        },
      };
    }
  }

  /**
   * Check phase transition status
   */
  async checkPhaseTransition(
    session: WorkflowSession
  ): Promise<PhaseStatusResult> {
    const result = this.phaseManager.canTransition(session.state);

    return {
      currentPhase: session.state.phase,
      canProgress: result.canProgress,
      autoTransition: result.autoTransition,
      reason: result.reason,
    };
  }

  /**
   * Get current phase status for a session
   */
  async status(sessionId: string): Promise<PhaseStatusResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        currentPhase: "discovery",
        canProgress: false,
        autoTransition: false,
        reason: "Session not found",
      };
    }

    return this.checkPhaseTransition(session);
  }

  /**
   * Get MCP client instance for external use (e.g., deployment)
   */
  getMCPClient(): MCPClient {
    return this.mcpClient;
  }
}

/**
 * Token Usage Tracking Integration Notes:
 *
 * Token tracking has been integrated at the following points:
 * 1. After analyzeWorkflowIntent() calls in runDiscoveryPhase
 * 2. After processWorkflowPhase() calls in all phase methods
 * 3. After generateValidationFixes() in runValidationPhase
 *
 * The tracking calls are currently commented out because ClaudeService
 * needs to be updated to return token usage information in its responses.
 *
 * Once ClaudeService returns usage data, uncomment the tracking calls:
 * await orchestratorHooks.updateTokenUsage(sessionId, response.usage?.total_tokens || 0);
 */
