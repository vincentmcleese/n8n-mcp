#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { WorkflowOrchestrator } from '../lib/workflow-orchestrator';

async function testDocumentation() {
  const orchestrator = new WorkflowOrchestrator();
  const sessionId = `doc-test-${Date.now()}`;
  
  // Create a simple validated workflow to test documentation
  const validatedWorkflow = {
    name: "Test Webhook to Slack",
    nodes: [
      {
        id: "node_1",
        name: "Webhook Trigger",
        type: "n8n-nodes-base.webhook",
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          path: "test-webhook",
          httpMethod: "POST"
        }
      },
      {
        id: "node_2",
        name: "Send to Slack",
        type: "n8n-nodes-base.slack",
        typeVersion: 1,
        position: [550, 300],
        parameters: {
          resource: "message",
          operation: "post",
          channelId: "#general",
          text: "Message received"
        }
      }
    ],
    connections: {
      "Webhook Trigger": {
        main: [[{ node: "Send to Slack", type: "main", index: 0 }]]
      }
    },
    settings: {
      executionOrder: "v1"
    },
    valid: true
  };
  
  console.log('Testing documentation phase...');
  console.log('Input workflow has', validatedWorkflow.nodes.length, 'nodes');
  
  try {
    const result = await orchestrator.runDocumentationPhase(sessionId, { 
      workflow: validatedWorkflow,
      success: true,
      phase: 'validation',
      validationReport: {}
    });
    
    console.log('\nDocumentation result:');
    console.log('Success:', result.success);
    console.log('Sticky notes added:', result.stickyNotesAdded);
    
    if (result.success) {
      const stickyNotes = result.workflow.nodes.filter(
        (n: any) => n.type === 'n8n-nodes-base.stickyNote'
      );
      console.log('Total nodes in workflow:', result.workflow.nodes.length);
      console.log('Sticky notes found:', stickyNotes.length);
      
      if (stickyNotes.length > 0) {
        console.log('\nSticky note details:');
        stickyNotes.forEach((note: any) => {
          console.log(`- ${note.name}: "${note.parameters.content}"`);
          console.log(`  Position: [${note.position[0]}, ${note.position[1]}]`);
        });
      }
    } else {
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testDocumentation().catch(console.error);