import { nanoid } from "nanoid";
import { createClient, createServiceClient } from "./supabase";
import {
  retryWithBackoff,
  DEFAULT_DB_RETRY_OPTIONS,
} from "./db/transaction-utils";
import type {
  WorkflowSession,
  WorkflowOperation,
  WorkflowPhase,
} from "@/types/workflow";

/**
 * Get appropriate Supabase client based on environment
 */
function getSupabaseClient() {
  // Always use service client for database operations
  // This ensures consistent behavior across all environments
  return createServiceClient();
}

/**
 * Generates a unique session ID with timestamp and random component
 * Format: wf_{timestamp}_{random}
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = nanoid(10);
  return `wf_${timestamp}_${random}`;
}

/**
 * Parses a session ID to extract its components
 */
export function parseSessionId(sessionId: string) {
  const parts = sessionId.split("_");
  if (parts.length !== 3 || parts[0] !== "wf") {
    throw new Error("Invalid session ID format");
  }

  return {
    prefix: parts[0],
    timestamp: parseInt(parts[1]),
    random: parts[2],
    createdAt: new Date(parseInt(parts[1])),
  };
}

/**
 * Creates a new workflow session in the database
 */
export async function createWorkflowSession(
  prompt: string,
  metadata?: {
    name?: string;
    description?: string;
    initialPrompt?: string;
  }
) {
  const supabase = getSupabaseClient();
  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  // Initialize empty state following PRD structure
  const initialState = {
    phase: "discovery" as WorkflowPhase,
    userPrompt: prompt,
    discovered: [],
    selected: [],
    configured: {},
    validated: {},
    workflow: {
      nodes: [],
      connections: [],
      settings: {
        name: metadata?.name || "Untitled Workflow",
        executionOrder: "v1",
        saveDataSuccessExecution: true,
      },
    },
    operationHistory: [],
    pendingClarifications: [],
    clarificationHistory: [],
    metadata: metadata || {},
  };

  const { data, error } = await supabase
    .from("workflow_sessions")
    .insert({
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      state: initialState,
      operations: [],
      user_prompt: prompt,
      is_active: true,
      version: 1,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return {
    sessionId,
    createdAt: now,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
  };
}

/**
 * Retrieves a workflow session from the database
 */
export async function getWorkflowSession(
  sessionId: string
): Promise<WorkflowSession | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("workflow_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (error || !data) {
    console.error("getWorkflowSession error:", error);
    return null;
  }

  // Debug logging - more detailed
  const state = data.state || {};
  console.log("getWorkflowSession - Raw data from DB:", {
    sessionId: data.session_id,
    stateKeys: Object.keys(state),
    discoveredLength: state.discovered?.length,
    selectedLength: state.selected?.length,
    phase: state.phase,
    // Log first discovered node to see structure
    firstDiscovered: state.discovered?.[0],
    discovered: state.discovered,
    selected: state.selected,
  });

  return {
    sessionId: data.session_id,
    createdAt: new Date(data.created_at),
    state: state,
  } as WorkflowSession;
}

/**
 * Updates a workflow session with new operations
 * This is the core of the delta-based architecture
 *
 * NEW: Returns the updated state directly to ensure read-after-write consistency
 */
export async function applyOperations(
  sessionId: string,
  operations: WorkflowOperation[]
): Promise<{
  success: boolean;
  error?: string;
  state?: any;
  version?: number;
}> {
  const supabase = getSupabaseClient();

  try {
    // First, get the current session with version for optimistic locking
    const { data: session, error: fetchError } = await supabase
      .from("workflow_sessions")
      .select("state, operations, version")
      .eq("session_id", sessionId)
      .single();

    if (fetchError || !session) {
      return { success: false, error: "Session not found" };
    }

    const currentVersion = session.version || 1;

    // Apply operations to the state
    let newState = { ...session.state };
    const newOperations = [...(session.operations || []), ...operations];

    // Process each operation (simplified - full implementation would handle all operation types)
    for (const op of operations) {
      switch (op.type) {
        case "setPhase":
          newState.phase = op.phase;
          break;
        case "discoverNode":
          // Initialize discovered array if it doesn't exist
          if (!newState.discovered) {
            newState.discovered = [];
          }

          // Add discovered node to the list
          if (
            op.node &&
            !newState.discovered.find(
              (n: { id: string }) => n.id === op.node.id
            )
          ) {
            newState.discovered.push(op.node);
          }
          break;
        case "selectNode":
          // Initialize selected array if it doesn't exist
          if (!newState.selected) {
            newState.selected = [];
          }

          // Add to selected list if not already there
          if (op.nodeId && !newState.selected.includes(op.nodeId)) {
            newState.selected.push(op.nodeId);
          }
          break;
        case "deselectNode":
          // Remove from selected list
          if (op.nodeId) {
            newState.selected = newState.selected.filter(
              (n: string) => n !== op.nodeId
            );
          }
          break;
        case "requestClarification":
          // Add clarification request
          if (op.question) {
            newState.pendingClarifications.push({
              questionId: `clarify_${Date.now()}`,
              question: op.question,
              context: {},
              timestamp: new Date(),
            });
          }
          break;
        // Add more operation handlers as needed
      }

      // Add operation to history
      newState.operationHistory.push({
        ...op,
        timestamp: new Date().toISOString(),
      });
    }

    // Update the session with new state and operations
    // Use RETURNING clause to get the updated state atomically
    console.log("Updating session with new state:", {
      sessionId,
      discovered: newState.discovered.length,
      selected: newState.selected.length,
      operations: operations.length,
      currentVersion,
    });

    const { data: updateData, error: updateError } = await supabase
      .from("workflow_sessions")
      .update({
        state: newState,
        operations: newOperations,
        updated_at: new Date().toISOString(),
        version: currentVersion + 1,
      })
      .eq("session_id", sessionId)
      .eq("version", currentVersion) // Optimistic locking
      .select("state, version")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);

      // Check if it's a version conflict
      if (updateError.code === "PGRST116") {
        // No rows returned = version mismatch
        return {
          success: false,
          error: "Version conflict - another update occurred",
        };
      }

      return { success: false, error: updateError.message };
    }

    if (!updateData) {
      // This shouldn't happen with .single(), but handle it just in case
      return { success: false, error: "Update failed - no data returned" };
    }

    console.log("Update successful with atomic return:", {
      discovered: updateData.state?.discovered?.length || 0,
      selected: updateData.state?.selected?.length || 0,
      version: updateData.version,
    });

    return {
      success: true,
      state: updateData.state,
      version: updateData.version,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Marks a session as inactive (soft delete)
 */
export async function deactivateSession(sessionId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("workflow_sessions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  return !error;
}

/**
 * Extends the session timeout by updating the updated_at timestamp
 */
export async function extendSessionTimeout(
  sessionId: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("workflow_sessions")
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  return !error;
}

/**
 * Gets session statistics for monitoring
 */
export async function getSessionStats(sessionId: string) {
  const session = await getWorkflowSession(sessionId);
  if (!session) return null;

  const state = session.state;
  console.log("getSessionStats - Raw state:", {
    sessionId,
    discovered: state.discovered,
    selected: state.selected,
    discoveredLength: state.discovered?.length || 0,
    selectedLength: state.selected?.length || 0,
  });

  return {
    phase: state.phase,
    stats: {
      discovered: state.discovered?.length || 0,
      selected: state.selected?.length || 0,
      configured: Object.keys(state.configured || {}).length,
      validated: Object.keys(state.validated || {}).length,
      operations: state.operationHistory?.length || 0,
    },
  };
}
