"use client";
import React from "react";

type NodeState =
  | "placeholder"
  | "discovered"
  | "selected"
  | "configuring"
  | "validated";

export interface NodeCardProps {
  id?: string;
  logoUrl?: string; // path to local SVG asset
  name?: string;
  purpose?: string;
  state: NodeState;
}

export function NodeCard({ logoUrl, name, purpose, state }: NodeCardProps) {
  const isPlaceholder = state === "placeholder";
  const isSelected = state === "selected";
  const isConfiguring = state === "configuring";
  const isValidated = state === "validated";

  return (
    <div
      className={
        "group relative rounded-xl border bg-white/70 backdrop-blur-sm p-4 transition-colors " +
        (isSelected
          ? "border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
          : "border-neutral-200 hover:border-neutral-300")
      }
      role="button"
      aria-pressed={isSelected}
    >
      {/* Badge (top-right) */}
      <div className="absolute right-3 top-3">
        {isConfiguring && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Configuring
          </span>
        )}
        {isValidated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">
            <CheckIcon className="h-3 w-3" /> Ready
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-lg bg-neutral-100 overflow-hidden flex items-center justify-center">
          {isPlaceholder ? (
            <div className="h-6 w-6 rounded-full bg-neutral-200 animate-pulse" />
          ) : logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8" loading="lazy" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-neutral-200" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-900 truncate">
            {isPlaceholder ? (
              <div className="h-4 w-2/3 bg-neutral-200 rounded animate-pulse" />
            ) : (
              name || "Node"
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500 truncate">
            {isPlaceholder ? (
              <div className="h-3 w-5/6 bg-neutral-100 rounded animate-pulse" />
            ) : (
              purpose || ""
            )}
          </div>
          {!isPlaceholder && (
            <div className="mt-2 text-xs text-neutral-400">
              {isValidated
                ? "Ready"
                : isConfiguring
                ? "Configuring…"
                : isSelected
                ? "Selected"
                : "Found"}
            </div>
          )}
        </div>
        {isSelected && (
          <div className="shrink-0 self-center">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
              <CheckIcon className="h-4 w-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
