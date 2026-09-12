import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-coop-gray-100/50 p-8 text-center">
      {icon}
      <h3 className="font-semibold text-coop-gray-900 coop-font-heading-sm">{title}</h3>
      <p className="max-w-sm text-sm text-coop-gray-900 coop-font-body">{description}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo}>
          <Button className="rounded-full">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <Button className="rounded-full" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
