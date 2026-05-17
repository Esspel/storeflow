import { TriangleAlert } from "lucide-react";

/**
 * GDPR reminder shown next to any camera/upload button in the app.
 * Fulfils GDPR Article 5(1)(c) data minimisation obligations by reminding
 * staff that photos must not capture identifiable individuals.
 */
export function GdprImageReminder() {
  return (
    <div
      role="note"
      aria-label="GDPR-påminnelse för bilder"
      className="flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300"
    >
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Säkerställ enligt GDPR att inga kunder eller kollegor syns på bilden.
      </span>
    </div>
  );
}
