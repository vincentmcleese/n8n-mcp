/**
 * Gap Search Service
 * 
 * Handles searching for nodes to fill gaps in workflow capabilities
 * that aren't covered by pre-configured task templates.
 * Uses optimized search strategies with fallback terms.
 */

import { MCPClient } from '@/lib/mcp-client';
import { loggers } from '@/lib/utils/logger';
import type { UnmatchedCapability } from './task-service';

/**
 * Search result for a capability
 */
export interface CapabilitySearchResult {
  capability: string;
  nodes: any[];
  searchTerms: string[];
  totalFound: number;
  searchStrategy: 'primary' | 'alternative' | 'optimized' | 'not_found';
}

/**
 * Complete search results for all gaps
 */
export interface GapSearchResults {
  results: Record<string, CapabilitySearchResult>;
  summary: {
    totalCapabilities: number;
    found: number;
    notFound: number;
    totalNodes: number;
  };
}

/**
 * Node option for Claude to select from
 */
export interface NodeOption {
  nodeType: string;
  displayName: string;
  description?: string;
  category?: string;
  isAITool?: boolean;
}

/**
 * Service for searching nodes to fill capability gaps
 */
export class GapSearchService {
  private mcpClient: MCPClient;
  private logger = loggers.orchestrator; // Use orchestrator logger since discovery doesn't exist
  
  /**
   * Search optimization mappings
   * Maps generic terms to specific node search terms
   */
  private readonly searchOptimizations: Record<string, string[]> = {
    // Databases
    'database': ['postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'mssql'],
    'sql': ['postgres', 'mysql', 'mssql', 'sqlite'],
    'nosql': ['mongodb', 'redis', 'couchdb', 'dynamodb'],
    
    // Communication
    'notify': ['slack', 'email', 'webhook', 'discord', 'teams', 'telegram'],
    'message': ['slack', 'discord', 'telegram', 'sms', 'whatsapp'],
    'chat': ['slack', 'discord', 'telegram', 'teams', 'whatsapp'],
    
    // Files
    'file': ['ftp', 's3', 'dropbox', 'googledrive', 'box', 'onedrive'],
    'storage': ['s3', 'dropbox', 'googledrive', 'box', 'azure'],
    'cloud': ['aws', 's3', 'azure', 'gcp', 'digitalocean'],
    
    // Spreadsheets
    'spreadsheet': ['googlesheets', 'excel', 'airtable', 'notion'],
    'table': ['airtable', 'notion', 'googlesheets', 'excel'],
    
    // APIs
    'api': ['httpRequest', 'graphql', 'rest', 'soap', 'webhook'],
    'rest': ['httpRequest', 'api', 'rest'],
    'graphql': ['graphql', 'api'],
    
    // Data Processing
    'transform': ['code', 'function', 'setData', 'itemLists', 'jq'],
    'process': ['code', 'function', 'itemLists', 'splitInBatches'],
    'manipulate': ['setData', 'code', 'function', 'itemLists'],
    
    // Control Flow
    'condition': ['if', 'switch', 'filter', 'router'],
    'loop': ['splitInBatches', 'loop', 'itemLists'],
    'wait': ['wait', 'delay', 'schedule', 'cron'],
    'merge': ['merge', 'join', 'combine', 'itemLists'],
    'split': ['splitInBatches', 'itemLists', 'split'],
    
    // Authentication
    'auth': ['oauth', 'jwt', 'credentials', 'httpRequest'],
    'oauth': ['oauth2', 'oauth', 'google', 'microsoft'],
    
    // AI/ML
    'ai': ['openai', 'anthropic', 'langchain', 'huggingface', 'cohere'],
    'llm': ['openai', 'anthropic', 'langchain', 'huggingface'],
    'ml': ['huggingface', 'tensorflow', 'pytorch'],
    
    // Monitoring
    'monitor': ['webhook', 'cron', 'schedule', 'interval'],
    'schedule': ['cron', 'schedule', 'interval', 'wait'],
    
    // E-commerce
    'payment': ['stripe', 'paypal', 'square', 'shopify'],
    'ecommerce': ['shopify', 'woocommerce', 'magento', 'stripe'],
    
    // CRM
    'crm': ['hubspot', 'salesforce', 'pipedrive', 'zoho'],
    'customer': ['hubspot', 'salesforce', 'zendesk', 'intercom']
  };

  constructor(mcpClient?: MCPClient) {
    // Use provided client or try to get singleton instance
    if (mcpClient) {
      this.mcpClient = mcpClient;
    } else {
      try {
        this.mcpClient = MCPClient.getInstance();
      } catch (error) {
        // Running in mock mode or no MCP available
        this.mcpClient = undefined as any;
      }
    }
  }

  /**
   * Search for nodes to fill capability gaps
   * @param capabilities Unmatched capabilities from intent analysis
   * @returns Search results for each capability
   */
  async searchForGaps(capabilities: UnmatchedCapability[]): Promise<GapSearchResults> {
    this.logger.info(`Searching for ${capabilities.length} capability gaps`);
    
    // If no MCP client (mock mode), return empty results
    if (!this.mcpClient) {
      this.logger.warn('No MCP client available - running in mock mode');
      const emptyResults: Record<string, CapabilitySearchResult> = {};
      capabilities.forEach(cap => {
        emptyResults[cap.name] = {
          capability: cap.name,
          nodes: [],
          searchTerms: cap.searchTerms,
          totalFound: 0,
          searchStrategy: 'not_found'
        };
      });
      return {
        results: emptyResults,
        summary: {
          totalCapabilities: capabilities.length,
          found: 0,
          notFound: capabilities.length,
          totalNodes: 0
        }
      };
    }
    
    // Ensure MCP client is connected before batch operation
    try {
      const connectionStatus = this.mcpClient.getConnectionStatus();
      if (!connectionStatus.isConnected) {
        this.logger.debug('MCP client not connected, attempting to connect...');
        await this.mcpClient.connect();
      }
    } catch (error) {
      this.logger.error('Failed to establish MCP connection for gap search:', error);
      const emptyResults: Record<string, CapabilitySearchResult> = {};
      capabilities.forEach(cap => {
        emptyResults[cap.name] = {
          capability: cap.name,
          nodes: [],
          searchTerms: cap.searchTerms,
          totalFound: 0,
          searchStrategy: 'not_found'
        };
      });
      return {
        results: emptyResults,
        summary: {
          totalCapabilities: capabilities.length,
          found: 0,
          notFound: capabilities.length,
          totalNodes: 0
        }
      };
    }
    
    const results: Record<string, CapabilitySearchResult> = {};
    let totalNodesFound = 0;
    
    // Process capabilities in parallel for better performance
    const searchPromises = capabilities.map(async (capability) => {
      const searchResult = await this.searchForCapability(capability);
      results[capability.name] = searchResult;
      totalNodesFound += searchResult.totalFound;
    });
    
    await Promise.all(searchPromises);
    
    // Calculate summary
    const found = Object.values(results).filter(r => r.totalFound > 0).length;
    const notFound = capabilities.length - found;
    
    const summary = {
      totalCapabilities: capabilities.length,
      found,
      notFound,
      totalNodes: totalNodesFound
    };
    
    this.logger.info(
      `Gap search complete: ${found}/${capabilities.length} capabilities found, ` +
      `${totalNodesFound} total nodes discovered`
    );
    
    if (notFound > 0) {
      const missing = Object.entries(results)
        .filter(([_, r]) => r.totalFound === 0)
        .map(([name]) => name);
      this.logger.warn(`No nodes found for: ${missing.join(', ')}`);
    }
    
    return { results, summary };
  }

  /**
   * Search for a single capability using progressive strategy
   */
  private async searchForCapability(capability: UnmatchedCapability): Promise<CapabilitySearchResult> {
    const { name, searchTerms } = capability;
    
    this.logger.debug(`Searching for capability: ${name}`);
    
    // Try primary search term first
    if (searchTerms.length > 0) {
      const primaryResult = await this.searchNodes(searchTerms[0]);
      if (primaryResult.length > 0) {
        this.logger.debug(`✅ Found ${primaryResult.length} nodes with primary term: ${searchTerms[0]}`);
        
        // Debug log IF nodes in raw search results
        primaryResult.forEach((node: any) => {
          if (node.nodeType && node.nodeType.toLowerCase().includes('if')) {
            this.logger.debug(`Raw IF node from search:`, {
              nodeType: node.nodeType,
              type: node.type,
              displayName: node.displayName,
              name: node.name,
              category: node.category,
              description: node.description?.substring(0, 50)
            });
          }
        });
        
        return {
          capability: name,
          nodes: primaryResult,
          searchTerms: [searchTerms[0]],
          totalFound: primaryResult.length,
          searchStrategy: 'primary'
        };
      }
    }
    
    // Try alternative search terms
    if (searchTerms.length > 1) {
      for (const altTerm of searchTerms.slice(1)) {
        const altResult = await this.searchNodes(altTerm);
        if (altResult.length > 0) {
          this.logger.debug(`✅ Found ${altResult.length} nodes with alternative term: ${altTerm}`);
          return {
            capability: name,
            nodes: altResult,
            searchTerms: [altTerm],
            totalFound: altResult.length,
            searchStrategy: 'alternative'
          };
        }
      }
    }
    
    // Try optimized search terms based on capability name
    const optimizedTerms = this.getOptimizedSearchTerms(name);
    for (const optimizedTerm of optimizedTerms) {
      const optResult = await this.searchNodes(optimizedTerm);
      if (optResult.length > 0) {
        this.logger.debug(`✅ Found ${optResult.length} nodes with optimized term: ${optimizedTerm}`);
        return {
          capability: name,
          nodes: optResult,
          searchTerms: [optimizedTerm],
          totalFound: optResult.length,
          searchStrategy: 'optimized'
        };
      }
    }
    
    // No results found
    this.logger.debug(`❌ No nodes found for capability: ${name}`);
    return {
      capability: name,
      nodes: [],
      searchTerms: [...searchTerms, ...optimizedTerms],
      totalFound: 0,
      searchStrategy: 'not_found'
    };
  }

  /**
   * Search for nodes using MCP
   */
  private async searchNodes(query: string, limit: number = 20): Promise<any[]> {
    try {
      const result = await this.mcpClient.searchNodes({ query, limit });
      
      if (result && result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          const parsed = JSON.parse(content.text);
          
          // Handle the actual MCP response format which has a 'results' property
          if (parsed.results && Array.isArray(parsed.results)) {
            return parsed.results;  // Standard format: { query: "...", results: [...] }
          } else if (Array.isArray(parsed)) {
            return parsed;  // Direct array format (legacy/fallback)
          } else {
            this.logger.warn(`Unexpected search response format for query "${query}":`, Object.keys(parsed));
            return [];
          }
        }
      }
      
      return [];
    } catch (error) {
      this.logger.error(`Error searching for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get optimized search terms based on capability name
   */
  private getOptimizedSearchTerms(capabilityName: string): string[] {
    const terms: string[] = [];
    const lowerName = capabilityName.toLowerCase();
    
    // Check each optimization key
    for (const [key, values] of Object.entries(this.searchOptimizations)) {
      if (lowerName.includes(key)) {
        terms.push(...values);
      }
    }
    
    // If no optimizations found, try variations of the capability name
    if (terms.length === 0) {
      // Remove common words and try parts
      const words = lowerName
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'into'].includes(w));
      
      terms.push(...words);
      
      // Try the full name without spaces
      terms.push(capabilityName.replace(/\s+/g, ''));
    }
    
    // Remove duplicates
    return [...new Set(terms)];
  }

  /**
   * Format search results for Claude selection
   * Groups nodes by category and provides clear options
   */
  formatResultsForSelection(results: GapSearchResults): string {
    const sections: string[] = [];
    
    for (const [capability, result] of Object.entries(results.results)) {
      if (result.totalFound === 0) {
        sections.push(`## ${capability}\nNo nodes found - may need manual configuration or clarification\n`);
        continue;
      }
      
      sections.push(`## ${capability}`);
      sections.push(`Found ${result.totalFound} options (searched: ${result.searchTerms.join(', ')})\n`);
      
      // Group nodes by category if available
      const byCategory: Record<string, NodeOption[]> = {};
      
      result.nodes.forEach((node: any) => {
        const category = node.category || 'Other';
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push({
          nodeType: node.nodeType || node.type,
          displayName: node.displayName || node.name,
          description: node.description,
          category: node.category,
          isAITool: node.isAITool
        });
      });
      
      // Format each category
      for (const [category, nodes] of Object.entries(byCategory)) {
        sections.push(`### ${category}:`);
        nodes.slice(0, 5).forEach((node, i) => {
          // Debug log for IF node
          if (node.nodeType && node.nodeType.toLowerCase().includes('if')) {
            this.logger.debug(`IF node in search results: nodeType="${node.nodeType}", displayName="${node.displayName}", category="${category}"`);
          }
          
          sections.push(`${i + 1}. **${node.nodeType}** - ${node.displayName}`);
          if (node.description) {
            sections.push(`   ${node.description}`);
          }
          if (node.isAITool) {
            sections.push(`   🤖 Can be used as AI tool`);
          }
        });
        
        if (nodes.length > 5) {
          sections.push(`   ... and ${nodes.length - 5} more options`);
        }
        sections.push('');
      }
    }
    
    return sections.join('\n');
  }

  /**
   * Get search optimization suggestions for a term
   * Useful for debugging and improving search
   */
  getSuggestionsForTerm(term: string): string[] {
    const suggestions: string[] = [];
    const lowerTerm = term.toLowerCase();
    
    // Find all optimization keys that might apply
    for (const [key, values] of Object.entries(this.searchOptimizations)) {
      if (lowerTerm.includes(key) || key.includes(lowerTerm)) {
        suggestions.push(...values);
      }
    }
    
    return [...new Set(suggestions)];
  }
}