/**
 * Preconfiguration Patches Types
 * 
 * Types for the preconfiguration patch system that fixes known issues
 * in node configurations before validation.
 */

/**
 * A patch that fixes known configuration issues for a specific node type
 */
export interface PreconfigurationPatch {
  /** The node type this patch applies to (e.g., 'nodes-base.slack') */
  nodeType: string;
  
  /** Description of what this patch fixes */
  description: string;
  
  /** Function that applies the patch to a configuration */
  patch: (config: any) => any;
}

/**
 * Registry for managing and applying preconfiguration patches
 */
export interface PreconfigurationPatchRegistry {
  /** Map of node type to patches */
  patches: Map<string, PreconfigurationPatch[]>;
  
  /**
   * Apply all relevant patches to a node configuration
   * @param nodeType The type of node being configured
   * @param config The configuration to patch
   * @returns The patched configuration and list of applied patches
   */
  applyPatches(nodeType: string, config: any): {
    config: any;
    patchesApplied: string[];
  };
}