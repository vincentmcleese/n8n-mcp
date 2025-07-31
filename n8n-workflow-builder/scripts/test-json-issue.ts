#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Test the malformed JSON issue
const malformedJson = `{"name":"Webhook to Slack Notification Workflow","nodes":[{"id":"node_1","name":"Webhook Trigger","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[250,300],"parameters":{"path":"webhook-trigger","httpMethod":"POST","responseMode":"onReceived","responseData":"firstEntryJson","alwaysOutputData":true},"onError":"stopWorkflow"},{"id":"node_2","name":"Send to Slack","type":"n8n-nodes-base.slack","typeVersion":1,"position":[550,300],"parameters":{"resource":"message","operation":"post","select":"channel","channelId":"general","messageText":"New webhook received! Data: {{JSON.stringify($json)}}"},"onError":"continueErrorOutput","retryOnFail":true,"maxTries":3,"waitBetweenTries":1000}],"connections":{"Webhook Trigger":{"main":[["Send to Slack","type":"main","index":0]]}},"settings":{"executionOrder":"v1","saveDataSuccessExecution":"all","saveDataErrorExecution":"all","saveManualExecutions":true},"reasoning":["Created webhook trigger to receive POST requests","Configured Slack to send messages to #general channel","Connected webhook to Slack for notifications","Added error handling with retry for Slack API failures","Positioned nodes left-to-right for clear visual flow","Used webhook data directly in Slack message via JSON.stringify expression"]}`;

console.log('Testing malformed JSON...');
console.log('Length:', malformedJson.length);

// Find the error position
const errorPos = 754;
console.log('\nContent around position', errorPos);
console.log('Before:', malformedJson.substring(errorPos - 50, errorPos));
console.log('AT ERROR:', malformedJson.substring(errorPos, errorPos + 50));

// Try to identify the issue
const connectionsStart = malformedJson.indexOf('"connections":');
console.log('\nConnections section starts at:', connectionsStart);
console.log('Connections content:', malformedJson.substring(connectionsStart, connectionsStart + 200));

// The issue is the array format - it should be an object
const badPart = `[["Send to Slack","type":"main","index":0]]`;
const goodPart = `[[{"node":"Send to Slack","type":"main","index":0}]]`;

console.log('\nThe issue:');
console.log('BAD (what Claude generated):', badPart);
console.log('GOOD (what it should be):', goodPart);

// Try to fix it with regex
const fixedJson = malformedJson.replace(
  /"main":\[\[([^,]+),("type":"main","index":\d+)\]\]/g,
  '"main":[[{"node":$1,$2}]]'
);

console.log('\nFixed connections:');
const fixedConnectionsStart = fixedJson.indexOf('"connections":');
console.log(fixedJson.substring(fixedConnectionsStart, fixedConnectionsStart + 200));

try {
  const parsed = JSON.parse(fixedJson);
  console.log('\n✅ Fixed JSON parses successfully!');
  console.log('Workflow name:', parsed.name);
  console.log('Nodes:', parsed.nodes.length);
  console.log('Connections:', JSON.stringify(parsed.connections, null, 2));
} catch (e) {
  console.log('\n❌ Still has errors:', e);
}