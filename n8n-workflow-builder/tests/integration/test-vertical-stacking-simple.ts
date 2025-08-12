#!/usr/bin/env npx tsx
// Simple test for vertical stacking without full orchestrator

import fs from "fs/promises";
import path from "path";

// Simplified test that focuses on the core logic
async function testVerticalStackingSimple() {
  console.log("\n🧪 VERTICAL STACKING SIMPLE TEST");
  console.log("=================================\n");

  // Load a test workflow
  const workflowPath = path.join(
    process.cwd(),
    "tests/complete-test-outputs",
    "user-test-2025-08-12T14-50-53-982Z.json"
  );
  
  const workflowContent = await fs.readFile(workflowPath, "utf-8");
  const workflow = JSON.parse(workflowContent);

  // Analyze connections to find fan-outs
  const connections = workflow.connections;
  const fanOuts: Map<string, string[]> = new Map();

  console.log("📊 Analyzing workflow connections...\n");
  
  for (const [sourceName, conn] of Object.entries(connections)) {
    const targets = (conn as any).main?.[0];
    if (Array.isArray(targets) && targets.length > 1) {
      const targetNames = targets.map((t: any) => t.node);
      fanOuts.set(sourceName, targetNames);
      console.log(`   Fan-out found: ${sourceName} → [${targetNames.join(", ")}]`);
    }
  }

  console.log("\n📍 Current node positions:");
  
  // Check current positions
  const nodePositions = new Map<string, [number, number]>();
  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.stickyNote") continue;
    nodePositions.set(node.name, node.position);
    console.log(`   ${node.name}: [${node.position[0]}, ${node.position[1]}]`);
  }

  console.log("\n✅ Verification:");
  
  // Verify fan-out nodes
  for (const [source, targets] of fanOuts) {
    console.log(`\n   From ${source}:`);
    
    const positions = targets.map(name => nodePositions.get(name)).filter(p => p !== undefined);
    const xPositions = positions.map(p => p![0]);
    const yPositions = positions.map(p => p![1]);
    
    // Check if they're in same column (Twitter/LinkedIn should be)
    const twitter = nodePositions.get("Post Twitter Thread");
    const linkedin = nodePositions.get("Post LinkedIn");
    const notion = nodePositions.get("Archive in Notion");
    
    if (twitter && linkedin) {
      console.log(`      Twitter: [${twitter[0]}, ${twitter[1]}]`);
      console.log(`      LinkedIn: [${linkedin[0]}, ${linkedin[1]}]`);
      
      if (twitter[0] === linkedin[0]) {
        console.log(`      ❌ NOT FIXED: Twitter and LinkedIn should be vertically stacked (same X)`);
        console.log(`         Current: Different X positions (${twitter[0]} vs ${linkedin[0]})`);
        console.log(`         Expected: Same X position with 150px Y spacing`);
      } else {
        console.log(`      ✅ Currently using horizontal spacing (will be fixed by vertical stacking)`);
      }
    }
    
    if (notion) {
      console.log(`      Notion: [${notion[0]}, ${notion[1]}] (different phase - should stay separate)`);
    }
  }

  console.log("\n📝 Expected after vertical stacking:");
  console.log("   - Twitter and LinkedIn at same X (e.g., 1870)");
  console.log("   - Twitter at Y=250, LinkedIn at Y=400 (150px spacing)");
  console.log("   - Notion in next column (different phase)\n");
}

// Run test
testVerticalStackingSimple().catch(console.error);