"use client";
import React from "react";

type Step = "discovering" | "configuring" | "polishing";

export function ProgressChips({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "discovering", label: "Discovering" },
    { key: "configuring", label: "Configuring" },
    { key: "polishing", label: "Polishing" },
  ];

  return (
    <div className="w-full max-w-screen-lg mx-auto px-4">
      <div className="flex items-center gap-2 overflow-x-auto py-3">
        {steps.map((s, idx) => {
          const active = s.key === current;
          return (
            <div
              key={s.key}
              aria-current={active ? "step" : undefined}
              className={
                "inline-flex items-center rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors " +
                (active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600")
              }
            >
              <span
                className={
                  "mr-2 h-2 w-2 rounded-full " +
                  (active ? "bg-white" : "bg-neutral-300")
                }
              />
              {s.label}
              {idx < steps.length - 1 && (
                <span className="mx-2 text-neutral-300">/</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="h-0.5 w-full bg-neutral-100 overflow-hidden rounded">
        <div className="h-full w-1/3 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500 animate-[progress_1.8s_linear_infinite]" />
      </div>
      <style jsx>{`
        @keyframes progress {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(300%);
          }
        }
      `}</style>
    </div>
  );
}
