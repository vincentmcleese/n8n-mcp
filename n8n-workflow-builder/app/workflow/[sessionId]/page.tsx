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
import { resolveIconName } from "@/lib/icon-aliases";
import { createClient } from "@/lib/supabase-client";

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
  const humorMessagesRef = useRef<string[] | null>(null);
  const humorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialRevealDelayRef = useRef<NodeJS.Timeout | null>(null);
  const lastToastNodeIdRef = useRef<string | null>(null);
  const polishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const polishQueueRef = useRef<string[]>([]);
  const [polishedIds, setPolishedIds] = useState<Set<string>>(new Set());
  const seoSlugRef = useRef<string | null>(null);
  const revealLockedRef = useRef<boolean>(false);

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
          // Check if this is a pending workflow that needs to be created
          await handlePendingWorkflow();
          return;
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
  }, [sessionId, router]);

  // Handle pending workflow creation for authenticated users
  const handlePendingWorkflow = async () => {
    try {
      const supabase = createClient();

      // Check if user just authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Session not found");
        setLoading(false);
        return;
      }

      // Check for pending session in localStorage
      const pendingSessionToken = localStorage.getItem(
        "pending_workflow_session"
      );
      if (!pendingSessionToken) {
        setError("Session not found");
        setLoading(false);
        return;
      }

      // Retrieve the session data from Supabase
      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("temp_prompt_data")
        .eq("session_token", pendingSessionToken)
        .single();

      if (sessionError || !sessionData?.temp_prompt_data) {
        console.error("Failed to retrieve session:", sessionError);
        setError("Session not found");
        setLoading(false);
        return;
      }

      const tempData = sessionData.temp_prompt_data as {
        prompt: string;
        workflowSessionId: string;
      };

      // Verify this is the correct workflow session
      if (tempData.workflowSessionId !== sessionId) {
        setError("Session mismatch");
        setLoading(false);
        return;
      }

      // Now link the session to the authenticated user and clear temp data
      await supabase
        .from("sessions")
        .update({
          user_id: user.id,
          temp_prompt_data: null,
        })
        .eq("session_token", pendingSessionToken);

      // Create the workflow with the stored prompt
      const res = await fetch("/api/workflow/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: tempData.prompt,
          sessionId: sessionId, // Use the pre-generated session ID
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create workflow");
      }

      // Clear the pending session from localStorage
      localStorage.removeItem("pending_workflow_session");
      sessionStorage.removeItem("pending_workflow_session");

      // Start polling for status
      fetchStatus();
    } catch (err: any) {
      console.error("Error creating workflow from pending session:", err);
      setError(err.message || "Failed to create workflow");
      setLoading(false);
    }
  };

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

    const continueReveal =
      phase === "discovery" ||
      (phase === "configuration" && visibleCount < selectedNodes.length);

    if (!continueReveal) {
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
      }, 1400);
    };

    if (visibleCount === 0) {
      initialRevealDelayRef.current = setTimeout(() => {
        startInterval();
      }, 1200);
    } else {
      startInterval();
    }

    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      if (initialRevealDelayRef.current)
        clearTimeout(initialRevealDelayRef.current);
    };
  }, [selectedNodes.length, phase, visibleCount]);

  // Lock reveal once backend hit configuration/building and all nodes are visible
  useEffect(() => {
    if (
      !revealLockedRef.current &&
      (phase === "configuration" || phase === "building") &&
      selectedNodes.length > 0 &&
      visibleCount >= selectedNodes.length
    ) {
      revealLockedRef.current = true;
    }
  }, [phase, visibleCount, selectedNodes.length]);

  // Toast on new discovery reveal (also continue brief toasts if reveal spills into configuration)
  useEffect(() => {
    const continueReveal =
      phase === "discovery" ||
      (phase === "configuration" && visibleCount < selectedNodes.length);
    if (!continueReveal) return;
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
    const isPolishing =
      phase !== "discovery" &&
      phase !== "configuration" &&
      phase !== "building";

    // Always clear any pending timer on rerun to avoid overlaps
    if (polishTimeoutRef.current) {
      clearTimeout(polishTimeoutRef.current);
      polishTimeoutRef.current = null;
    }
    // Do not reset polishedIds when phase changes; keep state persistent
    if (!isPolishing) {
      polishQueueRef.current = [];
      return;
    }

    const currentIds = selectedNodes
      .map((n) => n.id)
      .filter(Boolean) as string[];
    if (currentIds.length === 0) return;

    // If all are already polished, do not restart the cycle
    const allPolished = currentIds.every((id) => polishedIds.has(id));
    if (allPolished) {
      polishQueueRef.current = [];
      return;
    }

    // Only schedule remaining ids
    const ids = currentIds.filter((id) => !polishedIds.has(id));
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
      const delay = 250 + Math.floor(Math.random() * 750); // 0.25–1.0s
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
      // Keep queue/polishedIds as-is
    };
  }, [phase, selectedNodes.map((n) => n.id).join("|"), polishedIds]);

  // Humor toasts during configuration and polishing
  useEffect(() => {
    const isEngagementPhase =
      phase === "configuration" ||
      phase === "validation" ||
      phase === "building" ||
      phase === "documentation";
    if (!isEngagementPhase) {
      if (humorTimerRef.current) clearTimeout(humorTimerRef.current);
      humorTimerRef.current = null;
      return;
    }

    const ensureMessagesLoaded = async () => {
      if (!humorMessagesRef.current) {
        try {
          const res = await fetch("/data/humor-messages.json", {
            cache: "no-store",
          });
          if (res.ok) {
            const arr = (await res.json()) as string[];
            humorMessagesRef.current = Array.isArray(arr) ? arr : [];
          } else {
            humorMessagesRef.current = [];
          }
        } catch {
          humorMessagesRef.current = [];
        }
      }
    };

    const scheduleNextHumor = () => {
      if (!humorMessagesRef.current || humorMessagesRef.current.length === 0)
        return;
      // random delay 4–9s for higher engagement
      const delay = 4000 + Math.floor(Math.random() * 5000);
      humorTimerRef.current = setTimeout(() => {
        const msgs = humorMessagesRef.current!;
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        setToastMessage(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastMessage(""), 2400);
        scheduleNextHumor();
      }, delay);
    };

    ensureMessagesLoaded().then(scheduleNextHumor);

    return () => {
      if (humorTimerRef.current) clearTimeout(humorTimerRef.current);
      humorTimerRef.current = null;
    };
  }, [phase]);

  // Phase mapping for chips
  const stillDiscoveringUI =
    !revealLockedRef.current &&
    (phase === "discovery" ||
      ((phase === "configuration" || phase === "building") &&
        visibleCount < selectedNodes.length));

  const allPolished =
    selectedNodes.length > 0 &&
    selectedNodes.every((n) => polishedIds.has(n.id));

  const progressStep: "discovering" | "configuring" | "building" | "polishing" =
    stillDiscoveringUI
      ? "discovering"
      : allPolished || phase === "validation" || phase === "documentation"
      ? "polishing"
      : phase === "configuration" || phase === "building"
      ? visibleCount >= selectedNodes.length
        ? "building"
        : "configuring"
      : "polishing";

  // Derive staged NodeGrid props from API
  const simplifyIconName = (nodeType: string) => {
    // Strip known prefixes and keep original casing to match icon names (e.g., openAi, httpRequest)
    const withoutPrefix = nodeType
      .replace(/^n8n-nodes-base\./, "")
      .replace(/^nodes-base\./, "");
    const base = withoutPrefix.split(".")[0];
    return resolveIconName(base);
  };

  const stagedNodes: NodeCardProps[] = selectedNodes
    .slice(
      0,
      phase === "discovery" ||
        (phase === "configuration" && visibleCount < selectedNodes.length)
        ? visibleCount
        : selectedNodes.length
    )
    .map((n, i): NodeCardProps => {
      const isPolishing =
        progressStep === "building" || progressStep === "polishing";
      let state: NodeCardProps["state"];
      if (phase === "discovery") state = "discovered";
      else if (progressStep === "configuring") state = "configuring";
      else if (progressStep === "building")
        state = polishedIds.has(n.id) ? "validated" : "configuring";
      else if (progressStep === "polishing")
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

    // Optimistic UX: close instantly and show toast immediately
    setPendingClarification(null);
    setToastMessage("Thanks!");
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 1600);
    setSubmittedClarifyIds((prev) => [...prev, questionId]);
    setClarifyResponseById((prev) => ({ ...prev, [questionId]: "" }));

    try {
      const response = await fetch(`/api/workflow/${sessionId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, response: responseText }),
      });
      if (!response.ok) throw new Error("Failed to submit clarification");
      // Record submitted clarification for context
      setClarifications((prev) => [...prev, responseText]);
    } catch (err) {
      console.error("Failed to submit clarification:", err);
      // Non-blocking error: inform user and allow retry by unmarking submitted
      setToastMessage("Submission failed. Please try again.");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastMessage(""), 2000);
      setSubmittedClarifyIds((prev) => prev.filter((id) => id !== questionId));
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
    <div className="min-h-[calc(100vh-60px)] bg-neutral-50">
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
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mt-0.5">
                    <Wand2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-neutral-800 whitespace-pre-line">
                      {prompt}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {clarifications.length > 0 && (
              <div className="mt-2 mb-6 space-y-1">
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

            {/* Discovery preloader */}
            {phase === "discovery" && visibleCount === 0 && (
              <div className="mb-6 flex min-h-[160px] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                  <span className="text-sm text-neutral-500">
                    Analyzing intent...
                  </span>
                </div>
              </div>
            )}

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

            {/* No complete actions; we immediately redirect on completion */}

            {/* Footer removed per request */}
          </>
        )}
      </div>
      <Toast message={toastMessage} />
    </div>
  );
}
