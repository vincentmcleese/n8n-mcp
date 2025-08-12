/**
 * Hooks for integrating TestReporter with the orchestrator
 * 
 * Provides token tracking and detailed logging integration
 */

import { TestReporter } from './test-reporter';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface HookContext {
  reporter: TestReporter;
  currentPhase: 'discovery' | 'configuration' | 'building' | 'validation' | 'documentation' | null;
}

/**
 * Create orchestrator hooks for test reporting
 */
export function createTestReporterHooks(reporter: TestReporter) {
  const context: HookContext = {
    reporter,
    currentPhase: null,
  };

  return {
    /**
     * Hook into Claude API calls to track token usage
     */
    onClaudeRequest: (phase: HookContext['currentPhase'], request: any) => {
      context.currentPhase = phase;
      if (phase) {
        reporter.log('DEBUG', 'Claude', `Sending request for ${phase} phase`);
      }
    },

    /**
     * Capture Claude API response and token usage
     */
    onClaudeResponse: (response: any) => {
      if (context.currentPhase && response?.usage) {
        reporter.trackTokenUsage(
          context.currentPhase,
          response.usage.input_tokens || response.usage.prompt_tokens || 0,
          response.usage.output_tokens || response.usage.completion_tokens || 0
        );
      }
    },

    /**
     * Hook into MCP tool calls
     */
    onMCPToolCall: (tool: string, params: any) => {
      reporter.log('INFO', 'MCP', `Calling tool: ${tool}`);
      reporter.log('DEBUG', 'MCP', `Parameters: ${JSON.stringify(params)}`);
    },

    /**
     * Hook into MCP tool responses
     */
    onMCPToolResponse: (tool: string, response: any) => {
      if (response?.isError) {
        reporter.log('ERROR', 'MCP', `Tool ${tool} failed: ${response.error}`);
      } else {
        reporter.log('DEBUG', 'MCP', `Tool ${tool} completed successfully`);
      }
    },

    /**
     * Hook into orchestrator tool usage
     */
    onToolUse: (tool: string, params?: any) => {
      reporter.log('INFO', 'Tools', `Using tool: ${tool}`);
      if (params && process.env.LOG_LEVEL === 'debug') {
        reporter.log('DEBUG', 'Tools', `Parameters: ${JSON.stringify(params)}`);
      }
    },

    /**
     * Hook into orchestrator state changes
     */
    onStateChange: (phase: HookContext['currentPhase'], state: any) => {
      if (phase) {
        reporter.updateSessionState(phase, state);
      }
    },

    /**
     * Hook into orchestrator errors
     */
    onError: (phase: HookContext['currentPhase'], error: any) => {
      if (phase) {
        reporter.addError(phase, error);
      }
    },

    /**
     * Hook into orchestrator warnings
     */
    onWarning: (phase: HookContext['currentPhase'], warning: string) => {
      if (phase) {
        reporter.addWarning(phase, warning);
      }
    },

    /**
     * Hook into node discovery
     */
    onNodeDiscovered: (node: any) => {
      if (context.currentPhase === 'discovery') {
        reporter.log('INFO', 'Orchestrator', `Discovered node: ${node.type} - ${node.purpose}`);
      }
    },

    /**
     * Hook into node configuration
     */
    onNodeConfigured: (node: any) => {
      if (context.currentPhase === 'configuration') {
        reporter.log('INFO', 'Orchestrator', `Configured node: ${node.id}`);
      }
    },

    /**
     * Hook into validation fixes
     */
    onValidationFix: (error: string, fix: string) => {
      if (context.currentPhase === 'validation') {
        reporter.log('INFO', 'Orchestrator', `Applied fix for: ${error}`);
        reporter.log('DEBUG', 'Orchestrator', `Fix details: ${fix}`);
      }
    },
  };
}

/**
 * Patch the orchestrator to use reporter hooks
 */
export function patchOrchestratorWithReporter(
  orchestrator: any,
  reporter: TestReporter
): void {
  const hooks = createTestReporterHooks(reporter);
  
  // Store original methods
  const originalRunDiscovery = orchestrator.runDiscoveryPhase;
  const originalRunConfiguration = orchestrator.runConfigurationPhase;
  const originalRunBuilding = orchestrator.runBuildingPhase;
  const originalRunValidation = orchestrator.runValidationPhase;
  const originalRunDocumentation = orchestrator.runDocumentationPhase;

  // Wrap discovery phase
  orchestrator.runDiscoveryPhase = async function(sessionId: string, prompt: string) {
    hooks.onClaudeRequest('discovery', { prompt });
    const result = await originalRunDiscovery.call(this, sessionId, prompt);
    if (result.tokenUsage) {
      hooks.onClaudeResponse({ usage: result.tokenUsage });
    }
    return result;
  };

  // Wrap configuration phase
  orchestrator.runConfigurationPhase = async function(sessionId: string) {
    hooks.onClaudeRequest('configuration', {});
    const result = await originalRunConfiguration.call(this, sessionId);
    if (result.tokenUsage) {
      hooks.onClaudeResponse({ usage: result.tokenUsage });
    }
    return result;
  };

  // Wrap building phase
  orchestrator.runBuildingPhase = async function(sessionId: string) {
    hooks.onClaudeRequest('building', {});
    const result = await originalRunBuilding.call(this, sessionId);
    if (result.tokenUsage) {
      hooks.onClaudeResponse({ usage: result.tokenUsage });
    }
    return result;
  };

  // Wrap validation phase
  orchestrator.runValidationPhase = async function(sessionId: string, buildingResult: any) {
    hooks.onClaudeRequest('validation', {});
    const result = await originalRunValidation.call(this, sessionId, buildingResult);
    if (result.tokenUsage) {
      hooks.onClaudeResponse({ usage: result.tokenUsage });
    }
    return result;
  };

  // Wrap documentation phase
  orchestrator.runDocumentationPhase = async function(sessionId: string, validationResult: any) {
    hooks.onClaudeRequest('documentation', {});
    const result = await originalRunDocumentation.call(this, sessionId, validationResult);
    if (result.tokenUsage) {
      hooks.onClaudeResponse({ usage: result.tokenUsage });
    }
    return result;
  };

  // If orchestrator has an MCP client, wrap it too
  if (orchestrator.mcpClient) {
    const originalCallTool = orchestrator.mcpClient.callTool;
    if (originalCallTool) {
      orchestrator.mcpClient.callTool = async function(tool: string, params: any) {
        hooks.onMCPToolCall(tool, params);
        const result = await originalCallTool.call(this, tool, params);
        hooks.onMCPToolResponse(tool, result);
        return result;
      };
    }
  }
}