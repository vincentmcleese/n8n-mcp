// tests/integration/test-vertical-stacking.ts

import fs from "fs/promises";
import path from "path";

// Test configuration
const TEST_SESSION_ID = `test-vertical-${Date.now()}`;

/**
 * Test vertical stacking of parallel branches in documentation phase
 */
async function testVerticalStacking() {
  console.log("\n🧪 VERTICAL STACKING TEST SUITE");
  console.log("================================\n");

  // Dynamic import to avoid module resolution issues
  const { WorkflowOrchestrator } = await import("../../lib/workflow-orchestrator");
  const orchestrator = new WorkflowOrchestrator();

  // Test scenarios
  const scenarios = [
    {
      name: "Simple Fan-out (Webinar Workflow)",
      file: "user-test-2025-08-12T14-29-26-438Z.json",
      expectedStacks: [
        {
          phase: "transforms",
          nodes: ["Generate Calendar Link", "Add to Mailchimp Segment"],
          shouldStack: true,
          description: "Both nodes receive from Webhook in same phase",
        },
      ],
    },
    {
      name: "Multi-phase Fan-out (Podcast Workflow)",
      file: "user-test-2025-08-12T14-50-53-982Z.json",
      expectedStacks: [
        {
          phase: "integration",
          nodes: ["Post Twitter Thread", "Post LinkedIn"],
          shouldStack: true,
          description: "Twitter and LinkedIn in same phase",
        },
        {
          phase: "storage",
          nodes: ["Archive in Notion"],
          shouldStack: false,
          description: "Notion in different phase, should not stack",
        },
      ],
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario: ${scenario.name}`);
    console.log(`   File: ${scenario.file}`);
    console.log("   ----------------------------");

    try {
      // Load test workflow
      const workflowPath = path.join(
        process.cwd(),
        "tests/complete-test-outputs",
        scenario.file
      );
      const workflowContent = await fs.readFile(workflowPath, "utf-8");
      const workflow = JSON.parse(workflowContent);

      // Remove existing sticky notes for clean test
      const originalNodes = workflow.nodes.filter(
        (n: any) => n.type !== "n8n-nodes-base.stickyNote"
      );
      workflow.nodes = originalNodes;

      // Create test session and set up state
      const sessionId = `${TEST_SESSION_ID}-${scenario.name.replace(/\s+/g, "-")}`;
      await orchestrator.sessionRepo.initialize(sessionId, "test prompt");
      
      // Set up workflow state with build phases
      const buildPhases = extractBuildPhases(workflow);
      await orchestrator.sessionRepo.updateState(sessionId, {
        phase: "validation",
        workflow,
        buildPhases,
      });

      // Run documentation phase
      const documentationRunner = orchestrator.runners.documentation;
      const result = await documentationRunner.run({
        sessionId,
        validationResult: {
          success: true,
          phase: "validation",
          workflow,
          operations: [],
        },
      });

      if (!result.success) {
        console.log(`   ❌ Documentation failed: ${result.error?.message}`);
        continue;
      }

      // Verify vertical stacking
      console.log("\n   📊 Verification Results:");
      
      for (const expected of scenario.expectedStacks) {
        const nodesInPhase = result.workflow.nodes.filter((n: any) => {
          return expected.nodes.includes(n.name);
        });

        if (nodesInPhase.length === 0) {
          console.log(`   ⚠️  Nodes not found: ${expected.nodes.join(", ")}`);
          continue;
        }

        // Check X positions
        const xPositions = nodesInPhase.map((n: any) => n.position[0]);
        const uniqueX = [...new Set(xPositions)];

        if (expected.shouldStack) {
          if (uniqueX.length === 1) {
            console.log(`   ✅ ${expected.phase}: Nodes correctly stacked at X=${uniqueX[0]}`);
            
            // Verify Y spacing
            const yPositions = nodesInPhase
              .map((n: any) => n.position[1])
              .sort((a, b) => a - b);
            
            if (yPositions.length > 1) {
              const spacing = yPositions[1] - yPositions[0];
              if (Math.abs(spacing - 150) < 5) {
                console.log(`      ✅ Vertical spacing correct: ${spacing}px`);
              } else {
                console.log(`      ⚠️  Unexpected spacing: ${spacing}px (expected 150px)`);
              }
            }
          } else {
            console.log(`   ❌ ${expected.phase}: Nodes NOT stacked - X positions: ${uniqueX.join(", ")}`);
          }
        } else {
          if (uniqueX.length > 1) {
            console.log(`   ✅ ${expected.phase}: Nodes correctly in different columns`);
          } else {
            console.log(`   ❌ ${expected.phase}: Nodes incorrectly stacked at X=${uniqueX[0]}`);
          }
        }

        // Show node positions
        for (const node of nodesInPhase) {
          console.log(`      - ${node.name}: [${node.position[0]}, ${node.position[1]}]`);
        }
      }

      // Verify sticky notes cover all nodes
      const stickyNotes = result.workflow.nodes.filter(
        (n: any) => n.type === "n8n-nodes-base.stickyNote"
      );
      
      console.log(`\n   📝 Sticky Notes: ${stickyNotes.length} created`);
      
      // Check uniform height
      const stickyHeights = stickyNotes.map((s: any) => s.parameters.height);
      const uniqueHeights = [...new Set(stickyHeights)];
      
      if (uniqueHeights.length === 1) {
        console.log(`   ✅ All sticky notes have uniform height: ${uniqueHeights[0]}px`);
      } else {
        console.log(`   ❌ Sticky heights not uniform: ${uniqueHeights.join(", ")}px`);
      }

      // Save result for manual inspection
      const outputPath = path.join(
        process.cwd(),
        "tests/complete-test-outputs",
        `vertical-stacking-${scenario.file}`
      );
      await fs.writeFile(
        outputPath,
        JSON.stringify(result.workflow, null, 2),
        "utf-8"
      );
      console.log(`\n   💾 Saved output to: ${path.basename(outputPath)}`);

    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  }

  console.log("\n✅ Vertical Stacking Test Suite Complete!\n");
}

/**
 * Extract build phases from workflow for testing
 */
function extractBuildPhases(workflow: any): any[] {
  // Simple phase extraction based on node types
  const phases: any[] = [];
  const nodesByType = new Map<string, string[]>();

  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.stickyNote") continue;
    
    let phaseType = "transforms"; // default
    
    if (node.type.includes("trigger") || node.type.includes("webhook")) {
      phaseType = "trigger";
    } else if (node.type.includes("http")) {
      phaseType = "data_collection";
    } else if (node.type.includes("openAi") || node.type.includes("code")) {
      phaseType = "data_processing";
    } else if (node.type.includes("email") || node.type.includes("slack") || 
               node.type.includes("twitter") || node.type.includes("linkedIn")) {
      phaseType = "integration";
    } else if (node.type.includes("notion") || node.type.includes("hubspot")) {
      phaseType = "storage";
    }

    if (!nodesByType.has(phaseType)) {
      nodesByType.set(phaseType, []);
    }
    nodesByType.get(phaseType)!.push(node.id);
  }

  for (const [type, nodeIds] of nodesByType) {
    phases.push({
      type,
      description: `${type} phase`,
      nodeIds,
      row: 1, // All in row 1 for these test cases
    });
  }

  return phases;
}

// Run the test
if (require.main === module) {
  testVerticalStacking().catch(console.error);
}