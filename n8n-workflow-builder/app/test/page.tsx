"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ProgressChips } from "@/components/ProgressChips";
import { NodeGrid } from "@/components/NodeGrid";
import type { NodeCardProps } from "@/components/NodeCard";
import { ClarificationSheet } from "@/components/ClarificationSheet";
import { Toast } from "@/components/Toast";

type Step = "discovering" | "configuring" | "polishing";

const icon = (name: string) => `/demo-icons/${name}.svg`;

export default function TestPage() {
  const [step, setStep] = useState<Step>("discovering");
  const [showClarify, setShowClarify] = useState(false);
  const [toast, setToast] = useState("");

  const [nodes, setNodes] = useState<NodeCardProps[]>(
    Array.from({ length: 6 }).map(() => ({ state: "placeholder" }))
  );

  useEffect(() => {
    const timers: number[] = [];
    // Reveal discovered nodes progressively
    timers.push(
      window.setTimeout(() => {
        setNodes((prev) => [
          {
            id: "slack",
            name: "Slack",
            purpose: "Send a message",
            logoUrl: icon("Slack"),
            state: "discovered",
          },
          {
            id: "okta",
            name: "Okta",
            purpose: "Lookup user",
            logoUrl: icon("Okta"),
            state: "discovered",
          },
          {
            id: "onfleet",
            name: "Onfleet",
            purpose: "Create task",
            logoUrl: icon("Onfleet"),
            state: "discovered",
          },
          {
            id: "mailer",
            name: "MailerLite",
            purpose: "Send email",
            logoUrl: icon("MailerLite"),
            state: "discovered",
          },
          { state: "placeholder" },
          { state: "placeholder" },
        ]);
      }, 600)
    );
    timers.push(
      window.setTimeout(() => {
        // Select 2 nodes
        setNodes((prev) =>
          prev.map((n) =>
            n.id === "slack" || n.id === "okta"
              ? { ...n, state: "selected" }
              : n
          )
        );
      }, 1600)
    );
    timers.push(
      window.setTimeout(() => {
        setShowClarify(true);
      }, 2200)
    );
    timers.push(window.setTimeout(() => setStep("configuring"), 2800));
    timers.push(
      window.setTimeout(() => {
        // Simulate configuring states
        setNodes((prev) =>
          prev.map((n) =>
            n.state === "selected" ? { ...n, state: "configuring" } : n
          )
        );
      }, 3200)
    );
    timers.push(
      window.setTimeout(() => {
        // Done configuring -> validated
        setNodes((prev) =>
          prev.map((n) =>
            n.state === "configuring" ? { ...n, state: "validated" } : n
          )
        );
      }, 5200)
    );
    timers.push(window.setTimeout(() => setStep("polishing"), 5600));
    timers.push(
      window.setTimeout(() => setToast("Workflow looks good!"), 6200)
    );
    timers.push(window.setTimeout(() => setToast(""), 8200));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const onClarify = (value: string) => {
    setShowClarify(false);
    setToast("Thanks! Clarifying…");
    window.setTimeout(() => setToast(""), 1800);
  };

  return (
    <div className="min-h-screen bg-emerald-gradient">
      <div className="sticky top-0 z-10 bg-card backdrop-blur border-b border-neutral-200">
        <div className="max-w-screen-lg mx-auto px-4 py-3">
          <div className="text-lg font-semibold tracking-tight text-neutral-900">
            n8n Workflow Builder
          </div>
        </div>
      </div>
      <div className="py-4">
        <ProgressChips current={step} />
      </div>
      <div className="py-2">
        <NodeGrid nodes={nodes} />
      </div>

      <ClarificationSheet
        open={showClarify}
        question="Quick question: Which Slack channel should we post to?"
        onSubmit={onClarify}
      />
      <Toast message={toast} />
    </div>
  );
}
