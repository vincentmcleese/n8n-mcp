import type { NextRequest } from "next/server";

export function isMockEnabled() {
  return process.env.NEXT_PUBLIC_MOCK_WORKFLOW === "1";
}

export function mockCreateResponse() {
  const sessionId = `wf_mock_${Date.now()}`;
  return {
    sessionId,
    message: "Workflow creation started",
    status: "processing",
  };
}

export function mockStateResponse(request: NextRequest | Request) {
  const url = new URL((request as any).url);
  const phase = (url.searchParams.get("phase") as any) || "discovery";
  const clarify = url.searchParams.get("clarify") === "1";

  return {
    sessionId: "wf_mock",
    phase,
    complete: phase === "complete",
    stats: { discovered: 9, selected: 7, configured: 3, validated: 1 },
    selectedNodes: [
      { id: "node1", nodeType: "github.trigger", name: "GitHub" },
      { id: "node2", nodeType: "slack.post", name: "Slack" },
      { id: "node3", nodeType: "notion.create", name: "Notion" },
      { id: "node4", nodeType: "webhook.listener", name: "Webhook" },
      { id: "node5", nodeType: "googlesheets.append", name: "Google Sheets" },
      { id: "node6", nodeType: "hubspot.create", name: "HubSpot" },
      { id: "node7", nodeType: "gmail.send", name: "Gmail" },
    ],
    prompt: "Notify Slack on new GitHub issues",
    pendingClarification: clarify
      ? { questionId: "q1", question: "Which repository should we watch?" }
      : null,
  };
}

export function mockClarifyResponse() {
  return {
    success: true,
    selectedNodes: 3,
    pendingClarification: null,
    message: "Thanks for the clarification! Processing your workflow...",
  };
}

export function mockExportWorkflow() {
  return {
    nodes: [],
    connections: {},
    settings: { name: "Mock Workflow" },
  };
}
