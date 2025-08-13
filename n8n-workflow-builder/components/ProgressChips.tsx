"use client";
import React from "react";

type Step = "discovering" | "configuring" | "polishing";

export function ProgressChips({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "discovering", label: "Discovering" },
    { key: "configuring", label: "Configuring" },
    { key: "polishing", label: "Polishing" },
  ];

  const currentIndex = steps.findIndex((s) => s.key === current);
  const progressPercent = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div className="w-full max-w-screen-lg mx-auto px-4">
      <div className="flex items-center gap-2 overflow-x-auto py-3">
        {steps.map((s) => {
          const active = s.key === current;
          return (
            <div
              key={s.key}
              aria-current={active ? "step" : undefined}
              className={
                "inline-flex items-center rounded-full px-3 py-1 text-xs sm:text-sm font-medium whitespace-nowrap transition-all " +
                (active
                  ? "bg-emerald-600 text-white shadow-[0_4px_12px_rgba(27,200,140,0.30)]"
                  : "bg-white/80 text-neutral-700 border border-neutral-200")
              }
            >
              <span
                className={
                  "mr-2 h-2 w-2 rounded-full " +
                  (active ? "bg-white" : "bg-emerald-500/60")
                }
              />
              {s.label}
            </div>
          );
        })}
      </div>
      <div className="h-1 w-full bg-neutral-200 rounded overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
