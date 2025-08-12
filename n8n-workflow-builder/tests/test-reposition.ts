#!/usr/bin/env npx tsx
// Quick test of repositioning logic

async function testReposition() {
  const { DocumentationRunner } = await import("../lib/orchestrator/runners/documentation.runner");
  
  // Create a mock runner to access private methods
  const runner = new DocumentationRunner({
    sessionRepo: {} as any,
    loggers: { orchestrator: console, claude: console, mcp: console }
  });
  
  // Test workflow structure
  const workflow = {
    nodes: [
      { id: "gen", name: "Generate", position: [1000, 300] },
      { id: "tw", name: "Twitter", position: [1400, 200] },
      { id: "li", name: "LinkedIn", position: [1600, 300] },
      { id: "no", name: "Notion", position: [2000, 400] }
    ],
    connections: {
      "Generate": {
        main: [[
          { node: "Twitter", type: "main", index: 0 },
          { node: "LinkedIn", type: "main", index: 0 },
          { node: "Notion", type: "main", index: 0 }
        ]]
      }
    }
  };
  
  // Phase groups - Twitter and LinkedIn in integration, Notion in storage
  const phaseGroups = {
    triggers: [],
    inputs: [],
    transforms: ["gen"],
    decision: [],
    aggregation: [],
    storage: ["no"],
    integration: ["tw", "li"],
    outputs: [],
    finalization: [],
    error: []
  };
  
  const nodeRowMap = new Map([
    ["gen", 1], ["tw", 1], ["li", 1], ["no", 1]
  ]);
  
  console.log("🧪 Testing repositioning logic\n");
  console.log("Before:");
  workflow.nodes.forEach(n => console.log(`  ${n.name}: [${n.position[0]}, ${n.position[1]}]`));
  
  // Call the private method via prototype
  const repositioned = (runner as any).repositionNodesByPhase(
    phaseGroups,
    workflow.nodes,
    ["transforms", "integration", "storage"],
    nodeRowMap,
    workflow
  );
  
  console.log("\nAfter:");
  repositioned.forEach((n: any) => console.log(`  ${n.name}: [${n.position[0]}, ${n.position[1]}]`));
  
  // Check if Twitter and LinkedIn are vertically stacked
  const twitter = repositioned.find((n: any) => n.name === "Twitter");
  const linkedin = repositioned.find((n: any) => n.name === "LinkedIn");
  
  if (twitter && linkedin) {
    if (twitter.position[0] === linkedin.position[0]) {
      console.log("\n✅ Twitter and LinkedIn are vertically stacked!");
      console.log(`   Both at X=${twitter.position[0]}`);
      console.log(`   Y spacing: ${Math.abs(twitter.position[1] - linkedin.position[1])}px`);
    } else {
      console.log("\n❌ Twitter and LinkedIn NOT vertically stacked");
      console.log(`   Twitter X=${twitter.position[0]}, LinkedIn X=${linkedin.position[0]}`);
    }
  }
}

testReposition().catch(console.error);