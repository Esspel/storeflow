import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Link to={actionTo}>
        <Button className="rounded-full">{actionLabel}</Button>
      </Link>
    </div>
  );
}