// types/seo.ts

/**
 * SEO metadata for workflows
 * Stored in state.seo in the database
 */
export interface WorkflowSEOMetadata {
  slug: string;                // URL-friendly identifier with unique suffix
  title: string;               // SEO title (50-60 chars)
  description: string;         // Meta description (150-160 chars)
  keywords: string[];          // 5-10 relevant search terms
  businessValue: string;       // Primary business outcome (2-4 words)
  category: WorkflowCategory;  // Main workflow category
  integrations: string[];      // List of integrated services/platforms
  generatedAt: string;         // ISO timestamp of generation
  ogImage?: string;           // Optional OpenGraph image URL
}

/**
 * Supported workflow categories
 */
export type WorkflowCategory = 
  | 'Data Integration'
  | 'Communication' 
  | 'Analytics'
  | 'Automation'
  | 'Security'
  | 'DevOps'
  | 'Sales'
  | 'Marketing'
  | 'Monitoring'
  | 'Productivity';

/**
 * SEO generation request
 */
export interface GenerateSEORequest {
  sessionId: string;
  force?: boolean;  // Force regeneration even if SEO exists
}

/**
 * SEO generation response
 */
export interface GenerateSEOResponse {
  success: boolean;
  seo?: WorkflowSEOMetadata;
  error?: string;
}

/**
 * Workflow lookup by slug
 */
export interface WorkflowBySlugResponse {
  sessionId: string;
  workflow: {
    nodes?: any[];
    settings?: any;
  };
  seo: WorkflowSEOMetadata;
  configAnalysis?: any; // Will be WorkflowConfigAnalysis type when imported
  userPrompt?: string;
  createdAt: string;
  updatedAt: string;
  isVetted?: boolean;
}