import React from "react";
import { cn } from "@/lib/utils";

interface VettedBadgeProps {
  className?: string;
}

export function VettedBadge({ className }: VettedBadgeProps = {}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5",
        "bg-gradient-to-r from-emerald-50 to-emerald-100",
        "border border-emerald-500 rounded-full",
        "shadow-sm hover:shadow-md transition-all",
        "hover:from-emerald-100 hover:to-emerald-200",
        className
      )}
    >
      <i className="fa-solid fa-shield-check text-emerald-600" />
      <span className="text-sm font-semibold text-emerald-700">
        Vetted Workflow
      </span>
    </div>
  );
}