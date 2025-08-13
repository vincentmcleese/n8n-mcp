"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, Download } from "lucide-react";
import { ProgressChips } from "@/components/ProgressChips";
import { NodeGrid } from "@/components/NodeGrid";
import type { NodeCardProps } from "@/components/NodeCard";

/**
 * Workflow Status Page
 * Polls the state API and displays current phase
 */

const PHASE_NAMES = {
  discovery: "Discovery",
  configuration: "Configuration",
  validation: "Validation",
  building: "Building",
  documentation: "Documentation",
  complete: "Complete",
};

const PHASE_DESCRIPTIONS = {
  discovery: "Finding relevant nodes for your workflow...",
  configuration: "Configuring node parameters...",
  validation: "Validating workflow configuration...",
  building: "Building workflow connections...",
  documentation: "Adding documentation...",
  complete: "Workflow generation complete!",
};

export default function WorkflowStatusPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [phase, setPhase] = useState<string>("discovery");
  const [complete, setComplete] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingClarification, setPendingClarification] = useState<{
    questionId: string;
    question: string;
  } | null>(null);
  const [clarificationResponse, setClarificationResponse] = useState("");
  const [clarificationSubmitted, setClarificationSubmitted] = useState(false);
  const [submittingClarification, setSubmittingClarification] = useState(false);

  type SelectedNode = {
    id: string;
    nodeType: string;
    name: string;
  };

  const [selectedNodes, setSelectedNodes] = useState<SelectedNode[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      let url = `/api/workflow/${sessionId}/state`;
      if (typeof window !== "undefined" && window.location?.search) {
        // Pass through ?phase=...&clarify=1 from page URL to the API in mock mode
        url += window.location.search;
      }
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Session not found");
        } else {
          setError("Failed to fetch status");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();

      setPhase(data.phase);
      setComplete(data.complete);
      setPrompt(data.prompt || "");
      setPendingClarification(data.pendingClarification);
      setSelectedNodes(data.selectedNodes || []);
      setLoading(false);
      setError("");

      // Stop polling if complete
      if (data.complete) {
        console.log("Workflow complete!");
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
      setError("Failed to connect to server");
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchStatus();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      if (!complete) {
        fetchStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, complete, fetchStatus]);

  // Stage node reveal for discovery-like feel
  useEffect(() => {
    // Only stage reveal during discovery
    if (phase !== "discovery") {
      setVisibleCount(selectedNodes.length);
      return;
    }
    setVisibleCount((prev) => Math.min(prev, selectedNodes.length));
    if (selectedNodes.length === 0) return;
    const timer = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= selectedNodes.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [selectedNodes.length, phase]);

  // Phase mapping for chips
  const progressStep: "discovering" | "configuring" | "polishing" =
    phase === "discovery"
      ? "discovering"
      : phase === "configuration"
      ? "configuring"
      : "polishing";

  // Derive staged NodeGrid props from API
  const simplifyIconName = (nodeType: string) => {
    const base = nodeType.replace(/^n8n-nodes-base\./, "");
    return base.split(".")[0].toLowerCase();
  };

  const stagedNodes: NodeCardProps[] = selectedNodes
    .slice(0, Math.max(visibleCount, 1))
    .map(
      (n): NodeCardProps => ({
        id: n.id,
        iconName: simplifyIconName(n.nodeType),
        name: n.name,
        purpose: "", // not provided by state API
        state:
          phase === "discovery"
            ? "discovered"
            : phase === "configuration"
            ? "configuring"
            : phase === "validation"
            ? "validated"
            : "selected",
      })
    ) as NodeCardProps[];

  // Icons are rendered via NodeIcon in NodeCard

  const handleClarificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clarificationResponse.trim() || !pendingClarification) {
      return;
    }

    setSubmittingClarification(true);

    try {
      const response = await fetch(`/api/workflow/${sessionId}/clarify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionId: pendingClarification.questionId,
          response: clarificationResponse,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit clarification");
      }

      const data = await response.json();

      // Show thank you message
      setClarificationSubmitted(true);
      setClarificationResponse("");

      // Clear clarification state after a moment
      setTimeout(() => {
        setPendingClarification(data.pendingClarification || null);
        setClarificationSubmitted(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to submit clarification:", err);
      alert("Failed to submit clarification. Please try again.");
    } finally {
      setSubmittingClarification(false);
    }
  };

  const downloadWorkflow = async () => {
    try {
      const response = await fetch(`/api/workflow/${sessionId}/export`);

      if (!response.ok) {
        console.error("Failed to export workflow");
        return;
      }

      const workflowData = await response.json();

      // Create a blob from the JSON data
      const blob = new Blob([JSON.stringify(workflowData, null, 2)], {
        type: "application/json",
      });

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workflow-${sessionId}.json`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download workflow:", err);
    }
  };

  const getPhaseIcon = (currentPhase: string) => {
    if (complete) {
      return <CheckCircle className="w-8 h-8 text-green-500" />;
    }
    return <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-4">
            <XCircle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-center text-gray-900 mb-2">
            Error
          </h2>
          <p className="text-center text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start New Workflow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header is global; keep page top minimal and let progress chips lead */}

      <div className="py-4">
        <ProgressChips current={progressStep} />
      </div>

      <div className="max-w-screen-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
            <p className="text-neutral-600">Loading workflow status...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center mb-4">
              {getPhaseIcon(phase)}
              <h2 className="text-xl font-semibold text-neutral-900 ml-3">
                {PHASE_NAMES[phase as keyof typeof PHASE_NAMES] || phase}
              </h2>
            </div>
            <p className="text-center text-neutral-600 mb-6">
              {PHASE_DESCRIPTIONS[phase as keyof typeof PHASE_DESCRIPTIONS] ||
                "Processing..."}
            </p>

            {/* Discovery Node Grid */}
            {stagedNodes.length > 0 && (
              <div className="mb-6">
                <p className="text-center text-neutral-600 mb-3">
                  Workflow Preview
                </p>
                <NodeGrid nodes={stagedNodes} />
              </div>
            )}

            {/* Clarification Section */}
            {pendingClarification && !clarificationSubmitted && (
              <div className="mb-8">
                {/* Minimal sheet inline to avoid extra imports. Keep existing handler. */}
                <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-screen-sm rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-2xl">
                  <div className="text-base font-medium text-neutral-900 mb-1">
                    Quick question
                  </div>
                  <div className="text-sm text-neutral-600 mb-3">
                    {pendingClarification.question}
                  </div>
                  <form
                    onSubmit={handleClarificationSubmit}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={clarificationResponse}
                      onChange={(e) => setClarificationResponse(e.target.value)}
                      placeholder="Your answer…"
                      className="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={
                        submittingClarification || !clarificationResponse.trim()
                      }
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:bg-neutral-400"
                    >
                      {submittingClarification ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending
                        </>
                      ) : (
                        "Continue"
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Actions */}
            {complete && (
              <div className="mt-8 space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-center text-green-700 font-medium">
                    🎉 Your workflow is ready!
                  </p>
                </div>
                <button
                  onClick={downloadWorkflow}
                  className="w-full py-3 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Download Workflow JSON
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="w-full py-3 px-4 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  Create Another Workflow
                </button>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-neutral-200">
              <p className="text-xs text-neutral-500 text-center">
                Session ID: {sessionId}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
