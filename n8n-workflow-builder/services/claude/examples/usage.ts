/**
 * Example Usage of the New Modular Claude Services
 * 
 * This file demonstrates how to use the refactored Claude services
 * in the new modular architecture.
 */

import { 
  createPhaseServices,
  createAnthropicClient,
  DiscoveryPhaseService,
  ConfigurationPhaseService,
  BuildingPhaseService,
  ValidationPhaseService,
  DocumentationPhaseService,
  type PhaseContext
} from '../index';

// ==========================================
// Example 1: Using the Unified Factory
// ==========================================

async function example1_UnifiedFactory() {
  console.log('Example 1: Using createPhaseServices factory');
  
  // Create all phase services with shared configuration
  const phaseServices = createPhaseServices({
    onTokenUsage: (tokens) => {
      console.log(`Tokens used: ${tokens}`);
    }
  });
  
  // Define context that will be passed to all phases
  const context: PhaseContext = {
    sessionId: 'example-session-123',
    userIntent: 'Create a workflow that sends Slack notifications',
  };
  
  // Discovery Phase
  const discoveryResult = await phaseServices.discovery.execute({
    prompt: 'Send a Slack message when a webhook is received',
    sessionId: context.sessionId,
    context: {
      mcpDiscoveredNodes: [
        {
          type: 'n8n-nodes-base.webhook',
          displayName: 'Webhook',
          description: 'Receives HTTP requests',
          category: 'Trigger'
        },
        {
          type: 'n8n-nodes-base.slack',
          displayName: 'Slack',
          description: 'Send messages to Slack',
          category: 'Communication'
        }
      ],
      searchKeywords: ['webhook', 'slack']
    }
  }, context);
  
  if (discoveryResult.success) {
    console.log('Discovery operations:', discoveryResult.data?.operations.length);
    console.log('Token usage:', discoveryResult.usage);
  }
  
  // Configuration Phase
  const configResult = await phaseServices.configuration.execute({
    prompt: context.userIntent,
    selectedNodes: ['node_1', 'node_2'],
    context: {
      discoveredNodes: [
        { id: 'node_1', type: 'n8n-nodes-base.webhook', purpose: 'Receive incoming webhooks' },
        { id: 'node_2', type: 'n8n-nodes-base.slack', purpose: 'Send notification to Slack' }
      ]
    }
  }, context);
  
  if (configResult.success) {
    console.log('Configuration operations:', configResult.data?.operations.length);
  }
  
  // Continue with other phases...
}

// ==========================================
// Example 2: Using Individual Phase Services
// ==========================================

async function example2_IndividualServices() {
  console.log('Example 2: Creating individual phase services');
  
  // Create a shared client
  const client = createAnthropicClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  // Track total token usage across all phases
  let totalTokens = 0;
  const onTokenUsage = (tokens: number) => {
    totalTokens += tokens;
  };
  
  // Create individual phase services
  const discoveryService = new DiscoveryPhaseService({ client, onTokenUsage });
  const configService = new ConfigurationPhaseService({ client, onTokenUsage });
  const buildingService = new BuildingPhaseService({ client, onTokenUsage });
  
  const context: PhaseContext = {
    sessionId: 'example-session-456',
    userIntent: 'Process form data and store in database',
  };
  
  // Use services independently
  const intentAnalysis = await discoveryService.analyzeIntent({
    prompt: 'Process form submissions and store them in PostgreSQL'
  });
  
  if (intentAnalysis.success && intentAnalysis.data) {
    console.log('Intent:', intentAnalysis.data.intent);
    console.log('Suggested search terms:', intentAnalysis.data.suggestedSearchTerms);
  }
  
  console.log(`Total tokens used: ${totalTokens}`);
}

// ==========================================
// Example 3: Handling Clarifications
// ==========================================

async function example3_Clarifications() {
  console.log('Example 3: Handling clarification requests');
  
  const phaseServices = createPhaseServices();
  const context: PhaseContext = {
    sessionId: 'example-session-789',
    userIntent: 'Process data', // Intentionally vague
  };
  
  // Discovery might request clarification
  const discoveryResult = await phaseServices.discovery.execute({
    prompt: 'Process data',
    sessionId: context.sessionId,
    context: {
      mcpDiscoveredNodes: [], // No specific nodes found
      searchKeywords: ['process', 'data']
    }
  }, context);
  
  if (discoveryResult.success && discoveryResult.data) {
    // Check for clarification requests
    const clarificationOps = discoveryResult.data.operations.filter(
      op => op.type === 'requestClarification'
    );
    
    if (clarificationOps.length > 0) {
      console.log('Clarification needed:', clarificationOps[0]);
      
      // Handle the clarification
      const clarificationResult = await phaseServices.discovery.handleClarification({
        originalPrompt: 'Process data',
        questionId: (clarificationOps[0] as any).questionId,
        question: (clarificationOps[0] as any).question,
        response: 'Process CSV files and extract email addresses',
        existingState: {
          discovered: 0,
          selected: 0
        }
      });
      
      if (clarificationResult.success) {
        console.log('Additional operations after clarification:', 
          clarificationResult.data?.operations.length);
      }
    }
  }
}

// ==========================================
// Example 4: Complete Workflow Generation
// ==========================================

async function example4_CompleteWorkflow() {
  console.log('Example 4: Complete workflow generation pipeline');
  
  const phaseServices = createPhaseServices();
  const context: PhaseContext = {
    sessionId: 'example-workflow-001',
    userIntent: 'Monitor website uptime and send alerts',
  };
  
  try {
    // 1. Discovery Phase
    console.log('Starting Discovery...');
    const discovery = await phaseServices.discovery.execute({
      prompt: context.userIntent,
      sessionId: context.sessionId,
      context: {
        mcpDiscoveredNodes: [
          { type: 'n8n-nodes-base.httpRequest', displayName: 'HTTP Request' },
          { type: 'n8n-nodes-base.if', displayName: 'IF' },
          { type: 'n8n-nodes-base.slack', displayName: 'Slack' },
          { type: 'n8n-nodes-base.schedule', displayName: 'Schedule Trigger' }
        ],
        searchKeywords: ['http', 'monitor', 'alert', 'schedule']
      }
    }, context);
    
    // 2. Configuration Phase
    console.log('Starting Configuration...');
    const selectedNodes = ['node_1', 'node_2', 'node_3', 'node_4'];
    const configuration = await phaseServices.configuration.execute({
      prompt: context.userIntent,
      selectedNodes,
      context: {
        discoveredNodes: discovery.data?.operations
          .filter(op => op.type === 'discoverNode')
          .map((op: any) => op.node)
      }
    }, context);
    
    // 3. Building Phase
    console.log('Starting Building...');
    const building = await phaseServices.building.execute({
      userIntent: context.userIntent,
      configuredNodes: configuration.data?.operations
        .filter(op => op.type === 'configureNode')
        .map((op: any) => ({
          id: op.nodeId,
          type: op.nodeType || 'unknown',
          purpose: op.purpose || '',
          config: op.config
        })) || []
    }, context);
    
    // 4. Validation Phase
    console.log('Starting Validation...');
    const validation = await phaseServices.validation.execute({
      draftWorkflow: building.data
    }, context);
    
    // 5. Documentation Phase
    console.log('Starting Documentation...');
    const documentation = await phaseServices.documentation.execute({
      userPrompt: context.userIntent,
      workflow: validation.data?.workflow,
      nodeMetadata: validation.data?.workflow?.nodes?.map((n: any) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        position: n.position
      })) || []
    }, context);
    
    console.log('Workflow generation complete!');
    console.log('Final workflow:', validation.data?.workflow?.name);
    console.log('Sticky notes added:', documentation.data?.operations.length);
    
  } catch (error) {
    console.error('Error in workflow generation:', error);
  }
}

// ==========================================
// Example 5: Error Handling and Recovery
// ==========================================

async function example5_ErrorHandling() {
  console.log('Example 5: Error handling and recovery');
  
  const phaseServices = createPhaseServices();
  
  // Test with invalid configuration
  const configService = phaseServices.configuration;
  
  // Analyze node requirements
  const requirements = await configService.analyzeNodeRequirements({
    node: { id: 'test_node', type: 'n8n-nodes-base.slack', purpose: 'Send message' },
    userPrompt: 'Send a notification to the #general channel',
    nodeEssentials: {
      properties: [
        { name: 'resource', type: 'options', options: ['message', 'channel'] },
        { name: 'operation', type: 'options', options: ['post', 'update'] }
      ]
    }
  });
  
  if (requirements.success && requirements.data) {
    console.log('Node needs auth:', requirements.data.needsAuth);
    console.log('Additional properties needed:', requirements.data.needsProperties);
  }
  
  // Fix invalid configuration
  const fixedConfig = await configService.fixNodeConfig({
    node: { id: 'node_1', type: 'n8n-nodes-base.slack', purpose: 'Send message' },
    config: {
      resource: 'message',
      // Missing required 'operation' field
    },
    validationErrors: [
      'Missing required field: operation',
      'Invalid channel format'
    ],
    nodeContext: {
      essentials: {
        properties: [
          { name: 'operation', required: true, type: 'options', options: ['post'] }
        ]
      }
    }
  });
  
  if (fixedConfig.success) {
    console.log('Configuration fixed:', fixedConfig.data);
  }
}

// ==========================================
// Run Examples
// ==========================================

async function runExamples() {
  // Uncomment the examples you want to run
  
  // await example1_UnifiedFactory();
  // await example2_IndividualServices();
  // await example3_Clarifications();
  // await example4_CompleteWorkflow();
  // await example5_ErrorHandling();
  
  console.log('Examples completed');
}

// Export for testing
export {
  example1_UnifiedFactory,
  example2_IndividualServices,
  example3_Clarifications,
  example4_CompleteWorkflow,
  example5_ErrorHandling,
  runExamples
};