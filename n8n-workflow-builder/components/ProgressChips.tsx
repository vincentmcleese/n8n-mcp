"use client";
import React from "react";
import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";

type Step = "discovering" | "configuring" | "building" | "polishing";

export function ProgressChips({
  current,
  done,
}: {
  current: Step;
  done?: boolean;
}) {
  const steps: { key: Step; label: string }[] = [
    { key: "discovering", label: "Discovering" },
    { key: "configuring", label: "Configuring" },
    { key: "building", label: "Building" },
    { key: "polishing", label: "Polishing" },
  ];

  // If done, treat all steps as completed
  const baseIndex = steps.findIndex((s) => s.key === current);
  const currentIndex = done ? steps.length : baseIndex;

  return (
    <div className="w-full max-w-screen-lg mx-auto px-4">
      <div className="flex items-center gap-2 overflow-x-auto py-3">
        {steps.map((s, idx) => {
          const active = !done && s.key === current;
          const completed = idx < currentIndex;

          const chipInner = (
            <div
              key={`${s.key}-inner`}
              aria-current={active ? "step" : undefined}
              className={
                "inline-flex items-center rounded-full px-3 py-1 text-xs sm:text-sm font-medium whitespace-nowrap transition-all " +
                (active
                  ? "bg-emerald-600 text-white shadow-[0_4px_12px_rgba(27,200,140,0.30)]"
                  : "bg-white/80 text-neutral-700 border border-neutral-200")
              }
            >
              {completed ? (
                <Check className={"mr-2 h-3.5 w-3.5 text-emerald-600"} />
              ) : (
                <span
                  className={
                    "mr-2 h-2 w-2 rounded-full " +
                    (active ? "bg-white" : "bg-emerald-500/60")
                  }
                />
              )}
              {s.label}
            </div>
          );

          // Polishing phase: gradient border (green → blue) when active
          if (active && s.key === "polishing") {
            return (
              <div
                key={s.key}
                className="rounded-full p-[1px] bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                <div className="rounded-full">{chipInner}</div>
              </div>
            );
          }

          return <div key={s.key}>{chipInner}</div>;
        })}
      </div>
      <Progress indeterminate className="mt-1" />
    </div>
  );
}
