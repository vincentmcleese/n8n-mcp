// lib/db/workflow-queries.ts

import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/config/env";
import { WorkflowBySlugResponse } from "@/types/seo";

/**
 * Database queries for workflow operations
 */
export class WorkflowQueries {
  private supabase;

  constructor() {
    const env = getEnv();
    this.supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  /**
   * Find a workflow by its SEO slug
   * Searches the state.seo.slug field in JSONB
   * Option B: Selective fields for optimal performance
   */
  async findBySlug(slug: string): Promise<WorkflowBySlugResponse | null> {
    try {
      // Option B: Only fetch essential fields for display
      type Row = {
        session_id: string;
        created_at: string;
        updated_at: string;
        state: any;
        is_vetted?: boolean;
      };
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .select("session_id, created_at, updated_at, state, is_vetted")
        .eq("state->seo->>slug", slug)
        .single<Row>();

      if (error || !data) {
        console.error("Workflow not found by slug:", slug, error);
        return null;
      }

      // Parse the JSONB fields from full state
      const state = (data.state || {}) as any;
      const seo = state.seo as any;
      const nodes = state.workflow?.nodes as any[] | undefined;
      const settings = state.workflow?.settings as any;
      const userPrompt = state.userPrompt as string;
      const configAnalysis = state.configAnalysis as any;

      if (!seo) {
        console.error("Workflow found but no SEO metadata:", slug);
        return null;
      }

      return {
        sessionId: data.session_id,
        workflow: {
          nodes: nodes || [],
          settings: settings || {},
        },
        seo: seo,
        configAnalysis: configAnalysis,
        userPrompt: userPrompt || "",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isVetted: data.is_vetted || false,
      };
    } catch (error) {
      console.error("Error finding workflow by slug:", error);
      return null;
    }
  }

  /**
   * Find a workflow by session ID
   */
  async findBySessionId(
    sessionId: string
  ): Promise<WorkflowBySlugResponse | null> {
    try {
      type Row = {
        session_id: string;
        created_at: string;
        updated_at: string;
        state: any;
      };
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single<Row>();

      if (error || !data) {
        console.error("Workflow not found by session ID:", sessionId, error);
        return null;
      }

      const state = data.state as any;

      // Return even if no SEO metadata
      return {
        sessionId: data.session_id,
        workflow: state.workflow,
        seo: state.seo || null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error("Error finding workflow by session ID:", error);
      return null;
    }
  }

  /**
   * List recent workflows with SEO metadata
   * Useful for sitemap generation
   */
  async listPublicWorkflows(
    limit: number = 100
  ): Promise<WorkflowBySlugResponse[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_sessions")
        .select("*")
        .not("state->seo", "is", null)
        .eq("state->phase", "complete")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !data) {
        console.error("Error listing public workflows:", error);
        return [];
      }

      return data
        .map((row) => {
          const state = row.state as any;
          if (!state?.seo) return null;

          return {
            sessionId: row.session_id,
            workflow: state.workflow,
            seo: state.seo,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        })
        .filter(Boolean) as WorkflowBySlugResponse[];
    } catch (error) {
      console.error("Error listing public workflows:", error);
      return [];
    }
  }

  /**
   * Check if a slug already exists
   * Useful for ensuring unique slugs
   */
  async slugExists(slug: string): Promise<boolean> {
    try {
      const { count, error } = await this.supabase
        .from("workflow_sessions")
        .select("session_id", { count: "exact", head: true })
        .eq("state->seo->>slug", slug);

      if (error) {
        console.error("Error checking slug existence:", error);
        return false;
      }

      return (count || 0) > 0;
    } catch (error) {
      console.error("Error checking slug existence:", error);
      return false;
    }
  }
}

// Singleton instance
let workflowQueriesInstance: WorkflowQueries | null = null;

export function getWorkflowQueries(): WorkflowQueries {
  if (!workflowQueriesInstance) {
    workflowQueriesInstance = new WorkflowQueries();
  }
  return workflowQueriesInstance;
}
