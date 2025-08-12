/**
 * Preconfiguration Patches Registry
 * 
 * Central registry for all node configuration patches that fix known issues
 * before validation. These patches are applied to both task templates from MCP
 * and regular node configurations.
 */

import type { PreconfigurationPatch } from '@/types/orchestrator/patches';
import { loggers } from '@/lib/utils/logger';

export class PreconfigurationPatchRegistry {
  private patches = new Map<string, PreconfigurationPatch[]>();
  
  constructor() {
    this.registerBuiltInPatches();
  }
  
  /**
   * Register all built-in patches for known node configuration issues
   */
  private registerBuiltInPatches() {
    // Slack patch - fixes channel field structure
    this.addPatch({
      nodeType: 'nodes-base.slack',
      description: 'Fix Slack channel field name and add select field',
      patch: (config) => {
        const params = config.parameters || {};
        
        // Fix channel → channelId and add select field
        // The Slack node expects 'channelId' not 'channel'
        // and requires 'select: "channel"' to indicate where to send
        if (params.channel !== undefined) {
          params.channelId = params.channel;
          params.select = 'channel';
          delete params.channel;
        }
        
        // Ensure select field exists when channelId is present
        // This is required for the Slack node to know it's sending to a channel
        if (params.channelId && !params.select) {
          params.select = 'channel';
        }
        
        config.parameters = params;
        return config;
      }
    });
  }
  
  /**
   * Add a patch to the registry
   */
  private addPatch(patch: PreconfigurationPatch) {
    const patches = this.patches.get(patch.nodeType) || [];
    patches.push(patch);
    this.patches.set(patch.nodeType, patches);
  }
  
  /**
   * Apply all relevant patches to a node configuration
   */
  applyPatches(nodeType: string, config: any): {
    config: any;
    patchesApplied: string[];
  } {
    const patches = this.patches.get(nodeType) || [];
    const patchesApplied: string[] = [];
    let patchedConfig = { ...config };
    
    for (const patch of patches) {
      patchedConfig = patch.patch(patchedConfig);
      patchesApplied.push(patch.description);
      loggers.orchestrator.debug(`Applied patch to ${nodeType}: ${patch.description}`);
    }
    
    if (patchesApplied.length > 0) {
      loggers.orchestrator.debug(
        `Preconfiguration patches applied to ${nodeType}:`, 
        JSON.stringify(patchedConfig, null, 2)
      );
    }
    
    return { config: patchedConfig, patchesApplied };
  }
}

// Singleton instance for the application
export const patchRegistry = new PreconfigurationPatchRegistry();