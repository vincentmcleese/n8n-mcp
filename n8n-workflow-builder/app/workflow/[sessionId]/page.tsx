"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, Download } from "lucide-react";

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
  }, [sessionId, complete]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/workflow/${sessionId}/state`);

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
  };

  const getNodeIconUrl = (nodeType: string) => {
    const iconName = nodeType.replace("n8n-nodes-base.", "");
    return `/node-icons/${iconName}.svg`;
  };

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Building Your Workflow
          </h1>
          {prompt && (
            <div className="max-w-2xl mx-auto">
              <p className="text-gray-600 mb-2">Your request:</p>
              <p className="text-lg text-gray-800 italic">
                &quot;{prompt}&quot;
              </p>
            </div>
          )}
        </div>

        {/* Status Card */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border p-8">
            {loading ? (
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading workflow status...</p>
              </div>
            ) : (
              <>
                {/* Current Phase */}
                <div className="flex items-center justify-center mb-6">
                  {getPhaseIcon(phase)}
                  <h2 className="text-2xl font-semibold text-gray-900 ml-3">
                    {PHASE_NAMES[phase as keyof typeof PHASE_NAMES] || phase}
                  </h2>
                </div>

                {/* Phase Description */}
                <p className="text-center text-gray-600 mb-8">
                  {PHASE_DESCRIPTIONS[
                    phase as keyof typeof PHASE_DESCRIPTIONS
                  ] || "Processing..."}
                </p>

                {/* Selected Nodes Preview */}
                {selectedNodes.length > 0 && (
                  <div className="mb-8">
                    <p className="text-center text-gray-600 mb-4">
                      Workflow Preview
                    </p>
                    <div className="flex items-center justify-center space-x-2 bg-gray-50 p-4 rounded-lg">
                      {selectedNodes.map((node, index) => (
                        <div key={node.id} className="flex items-center">
                          <img
                            src={getNodeIconUrl(node.nodeType)}
                            alt={node.name}
                            title={node.name}
                            className="w-8 h-8"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = "/node-icons/n8n.svg";
                            }}
                          />
                          {index < selectedNodes.length - 1 && (
                            <div className="w-4 h-px bg-gray-300 mx-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clarification Section */}
                {pendingClarification && !clarificationSubmitted && (
                  <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Clarification Needed
                    </h3>
                    <p className="text-gray-700 mb-4 whitespace-pre-line">
                      {pendingClarification.question}
                    </p>
                    <form
                      onSubmit={handleClarificationSubmit}
                      className="space-y-3"
                    >
                      <textarea
                        value={clarificationResponse}
                        onChange={(e) =>
                          setClarificationResponse(e.target.value)
                        }
                        placeholder="Type your response here..."
                        className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        disabled={submittingClarification}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={
                          submittingClarification ||
                          !clarificationResponse.trim()
                        }
                        className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                      >
                        {submittingClarification ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Response"
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Thank you message */}
                {clarificationSubmitted && (
                  <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-center text-green-700 font-medium">
                      ✅ Thanks for the clarification! Processing your
                      workflow...
                    </p>
                  </div>
                )}

                {/* Phase Progress Indicator */}
                <div className="space-y-3">
                  {Object.entries(PHASE_NAMES).map(([key, name]) => {
                    const phases = Object.keys(PHASE_NAMES);
                    const currentIndex = phases.indexOf(phase);
                    const itemIndex = phases.indexOf(key);
                    const isPast = itemIndex < currentIndex;
                    const isCurrent = key === phase;
                    const isComplete = key === "complete" && complete;

                    return (
                      <div
                        key={key}
                        className={`flex items-center p-3 rounded-lg transition-colors ${
                          isCurrent
                            ? "bg-blue-50 border border-blue-200"
                            : isPast || isComplete
                            ? "bg-green-50 border border-green-200"
                            : "bg-gray-50 border border-gray-200"
                        }`}
                      >
                        <div className="flex-shrink-0 mr-3">
                          {isPast || isComplete ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : isCurrent ? (
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                        <span
                          className={`font-medium ${
                            isCurrent
                              ? "text-blue-700"
                              : isPast || isComplete
                              ? "text-green-700"
                              : "text-gray-500"
                          }`}
                        >
                          {name}
                        </span>
                      </div>
                    );
                  })}
                </div>

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
                      className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download Workflow JSON
                    </button>
                    <button
                      onClick={() => router.push("/")}
                      className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create Another Workflow
                    </button>
                  </div>
                )}

                {/* Session Info */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Session ID: {sessionId}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
