"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  HelpCircle,
  Wand2,
} from "lucide-react";
import { ProgressChips } from "@/components/ProgressChips";
import { NodeGrid } from "@/components/NodeGrid";
import type { NodeCardProps } from "@/components/NodeCard";
import { Toast } from "@/components/Toast";

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
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [clarifyResponseById, setClarifyResponseById] = useState<
    Record<string, string>
  >({});
  const [submittedClarifyIds, setSubmittedClarifyIds] = useState<string[]>([]);
  const [submittingClarifyIds, setSubmittingClarifyIds] = useState<string[]>(
    []
  );

  type SelectedNode = {
    id: string;
    nodeType: string;
    name: string;
  };

  const [selectedNodes, setSelectedNodes] = useState<SelectedNode[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialRevealDelayRef = useRef<NodeJS.Timeout | null>(null);
  const lastToastNodeIdRef = useRef<string | null>(null);
  const polishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const polishQueueRef = useRef<string[]>([]);
  const [polishedIds, setPolishedIds] = useState<Set<string>>(new Set());
  const seoSlugRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      let url = `/api/workflow/${sessionId}/state`;
      if (typeof window !== "undefined") {
        const incoming = new URLSearchParams(window.location.search);
        const normalized = new URLSearchParams();
        const rawPhase = incoming.get("phase");
        if (rawPhase) {
          // In case of malformed URLs like ?phase=discovery?clarify=1
          normalized.set("phase", rawPhase.split("?")[0]);
        }
        const clarifyParam =
          incoming.get("clarify") ?? incoming.get("clarification");
        if (clarifyParam === "1" || clarifyParam === "true") {
          normalized.set("clarify", "1");
        }
        const qs = normalized.toString();
        if (qs) url += `?${qs}`;
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
      if (data.seoSlug) seoSlugRef.current = data.seoSlug as string;
      setError("");

      // Stop polling if complete
      if (data.complete && seoSlugRef.current) {
        router.push(`/w/${seoSlugRef.current}`);
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

  // Stage node reveal for discovery-like feel (with initial delay)
  useEffect(() => {
    // Cleanup any existing timers on effect re-run
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (initialRevealDelayRef.current) {
      clearTimeout(initialRevealDelayRef.current);
      initialRevealDelayRef.current = null;
    }

    if (phase !== "discovery") {
      setVisibleCount(selectedNodes.length);
      return;
    }

    setVisibleCount((prev) => Math.min(prev, selectedNodes.length));
    if (selectedNodes.length === 0) return;

    const startInterval = () => {
      revealTimerRef.current = setInterval(() => {
        setVisibleCount((prev) => {
          if (prev >= selectedNodes.length) {
            if (revealTimerRef.current) clearInterval(revealTimerRef.current);
            revealTimerRef.current = null;
            return prev;
          }
          return prev + 1;
        });
      }, 700);
    };

    if (visibleCount === 0) {
      initialRevealDelayRef.current = setTimeout(() => {
        startInterval();
      }, 3000);
    } else {
      startInterval();
    }

    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      if (initialRevealDelayRef.current)
        clearTimeout(initialRevealDelayRef.current);
    };
  }, [selectedNodes.length, phase, visibleCount]);

  // Toast on new discovery reveal
  useEffect(() => {
    if (phase !== "discovery") return;
    if (visibleCount <= 0) return;
    const idx = Math.min(visibleCount - 1, selectedNodes.length - 1);
    const node = selectedNodes[idx];
    if (!node) return;
    if (lastToastNodeIdRef.current === node.id) return;
    lastToastNodeIdRef.current = node.id;
    setToastMessage(`Discovered ${node.name}`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 1800);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [visibleCount, phase, selectedNodes]);

  // Polishing animation: random order with random delay (1–5s) between validations
  useEffect(() => {
    const isPolishing = phase !== "discovery" && phase !== "configuration";

    // Cleanup any existing timeout and reset state when switching modes or IDs
    if (polishTimeoutRef.current) {
      clearTimeout(polishTimeoutRef.current);
      polishTimeoutRef.current = null;
    }
    polishQueueRef.current = [];
    setPolishedIds(new Set());

    if (!isPolishing) return;

    const ids = selectedNodes.map((n) => n.id).filter(Boolean) as string[];
    if (ids.length === 0) return;

    // Shuffle IDs (Fisher–Yates)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    polishQueueRef.current = ids;

    const scheduleNext = () => {
      if (polishQueueRef.current.length === 0) {
        polishTimeoutRef.current = null;
        return;
      }
      const delay = 1000 + Math.floor(Math.random() * 4000); // 1–5s
      polishTimeoutRef.current = setTimeout(() => {
        const nextId = polishQueueRef.current.shift();
        if (nextId) {
          setPolishedIds((prev) => {
            const next = new Set(prev);
            next.add(nextId);
            return next;
          });
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (polishTimeoutRef.current) clearTimeout(polishTimeoutRef.current);
      polishTimeoutRef.current = null;
      polishQueueRef.current = [];
    };
  }, [phase, selectedNodes.map((n) => n.id).join("|")]);

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
    .slice(0, phase === "discovery" ? visibleCount : selectedNodes.length)
    .map((n, i): NodeCardProps => {
      const isPolishing = phase !== "discovery" && phase !== "configuration";
      let state: NodeCardProps["state"];
      if (phase === "discovery") state = "discovered";
      else if (phase === "configuration") state = "configuring";
      else if (isPolishing)
        state = polishedIds.has(n.id) ? "validated" : "configuring";
      else state = "selected";
      return {
        id: n.id,
        iconName: simplifyIconName(n.nodeType),
        name: n.name,
        purpose: "", // not provided by state API
        state,
        polishing: isPolishing,
      };
    }) as NodeCardProps[];

  // Icons are rendered via NodeIcon in NodeCard

  const handleClarificationSubmit = async (questionId: string) => {
    const responseText = clarifyResponseById[questionId]?.trim();
    if (!responseText) return;
    setSubmittingClarifyIds((prev) => [...prev, questionId]);
    try {
      const response = await fetch(`/api/workflow/${sessionId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, response: responseText }),
      });
      if (!response.ok) throw new Error("Failed to submit clarification");
      await response.json();
      setSubmittedClarifyIds((prev) => [...prev, questionId]);
      setClarifyResponseById((prev) => ({ ...prev, [questionId]: "" }));
      setClarifications((prev) => [...prev, responseText]);
      // Hide the sheet quickly and show a toast
      setPendingClarification(null);
      setToastMessage("Thanks!");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastMessage(""), 1600);
    } catch (err) {
      console.error("Failed to submit clarification:", err);
      alert("Failed to submit clarification. Please try again.");
    } finally {
      setSubmittingClarifyIds((prev) => prev.filter((id) => id !== questionId));
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
        <ProgressChips current={progressStep} done={complete} />
      </div>

      <div className="max-w-screen-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="py-6" />
        ) : (
          <>
            <div className="mb-6">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mt-0.5">
                    <Wand2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-neutral-800 whitespace-pre-line">
                      {prompt}
                    </div>
                    {clarifications.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {clarifications.map((c, i) => (
                          <div key={i} className="text-sm text-neutral-800">
                            <span className="text-emerald-700 font-medium">
                              Clarification:
                            </span>{" "}
                            {c}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Discovery Node Grid */}
            {stagedNodes.length > 0 && (
              <div className="mb-6">
                <NodeGrid nodes={stagedNodes} />
              </div>
            )}

            {/* Clarification Section */}
            {(() => {
              const baseItems = Array.isArray(pendingClarification)
                ? pendingClarification
                : pendingClarification
                ? [pendingClarification]
                : [];
              const items = baseItems.filter(
                (pc) => !submittedClarifyIds.includes(pc.questionId)
              );
              if (items.length === 0) return null;
              return (
                <div className="mb-8">
                  <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-screen-sm rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-2xl animate-slide-up">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <HelpCircle className="h-4 w-4" />
                      </div>
                      <div className="text-base font-semibold text-neutral-900">
                        Quick clarification
                      </div>
                    </div>

                    <div className="space-y-3">
                      {items.map((pc) => {
                        const submitting = submittingClarifyIds.includes(
                          pc.questionId
                        );
                        const val = clarifyResponseById[pc.questionId] ?? "";
                        return (
                          <div
                            key={pc.questionId}
                            className="rounded-lg border border-neutral-200 p-3"
                          >
                            <div className="text-sm text-neutral-700 mb-2">
                              {pc.question}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                value={val}
                                onChange={(e) =>
                                  setClarifyResponseById((prev) => ({
                                    ...prev,
                                    [pc.questionId]: e.target.value,
                                  }))
                                }
                                placeholder="Your answer…"
                                className="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                onClick={() =>
                                  handleClarificationSubmit(pc.questionId)
                                }
                                disabled={submitting || !val.trim()}
                                className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:bg-neutral-400"
                              >
                                {submitting ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending
                                  </>
                                ) : (
                                  "Send"
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

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

            {/* Footer removed per request */}
          </>
        )}
      </div>
      <Toast message={toastMessage} />
    </div>
  );
}
