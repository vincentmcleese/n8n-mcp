import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indeterminate?: boolean;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, indeterminate = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-1 w-full overflow-hidden rounded bg-neutral-200",
          className
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={typeof value === "number" ? value : undefined}
        {...props}
      >
        {indeterminate ? (
          <div className="absolute inset-0 rounded progress-gradient" />
        ) : (
          <div
            className="h-full w-full rounded bg-emerald-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
          />
        )}
      </div>
    );
  }
);
Progress.displayName = "Progress";
