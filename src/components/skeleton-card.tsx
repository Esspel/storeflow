import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4" aria-hidden="true">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}