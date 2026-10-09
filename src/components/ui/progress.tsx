import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  label?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, label, ...props }, ref) => {
    const safeValue = Number(value);
    const safeMax = Number(max);
    const pct = Number.isFinite(safeMax) && safeMax > 0
      ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100))
      : 0;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={Number.isFinite(safeValue) ? safeValue : 0}
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(safeMax) ? safeMax : 100}
        aria-label={label ?? "Progress"}
        className={cn("w-full", className)}
        {...props}
      >
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {label && <span className="mt-1 text-xs text-coop-gray-900">{label}</span>}
      </div>
    );
  }
);
Progress.displayName = "Progress";
