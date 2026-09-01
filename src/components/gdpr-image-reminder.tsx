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
      className="flex items-start gap-2 rounded-lg border border-coop-orange-400/60 bg-coop-orange-400/15 px-3 py-2.5 text-xs font-medium text-coop-orange-800 dark:text-coop-orange-300"
    >
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Säkerställ enligt GDPR att inga kunder eller kollegor syns på bilden.</span>
    </div>
  );
}
