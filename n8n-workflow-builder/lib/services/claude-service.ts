/**
 * DEPRECATED: This file contains the legacy Claude service implementation.
 * All code has been migrated to the new modular architecture in /services/claude/
 * 
 * This file is kept for reference during testing but will be removed once migration is verified.
 * DO NOT USE THIS SERVICE - Use the new modular services instead:
 * - import { createPhaseServices } from '@/services/claude'
 */

// ============================================
// LEGACY CODE - COMMENTED OUT FOR MIGRATION
// ============================================

// Re-export from new location to maintain backward compatibility during migration
export { ClaudeService, createClaudeService } from '@/services/claude';

// Re-export types for backward compatibility
export type { 
  ClaudeAnalysis,
  NodeInfoRequirements,
  ClaudeResult,
  ClaudeBuildingResult,
  ClaudeValidationResult 
} from '@/services/claude';

/*
 * Original implementation has been moved to /services/claude/
 * The legacy code below is commented out but kept for reference.
 * 
 * To view the original implementation, see:
 * - /services/claude/client.ts - Core Anthropic client wrapper
 * - /services/claude/phases/*.ts - Phase-specific services
 * - /services/claude/prompts/*.ts - Prompt templates
 * - /services/claude/validation/*.ts - Response validation
 * - /services/claude/parsing/*.ts - JSON parsing utilities
 */

// Original code has been preserved in claude-service.ts.backup