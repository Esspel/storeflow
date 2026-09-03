import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComingSoon({
  icon: Icon = Construction,
  title,
  description,
  features,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  features: string[];
}) {
  const [notified, setNotified] = useState(false);

  const handleNotify = (e: React.MouseEvent) => {
    e.preventDefault();
    setNotified(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-coop-gray-100 p-10 shadow-[var(--shadow-md)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-md)]">
          <Icon className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-coop-gray-900">{description}</p>

        <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {f}
            </div>
          ))}
        </div>

        <div className="mt-8">
          <div className="flex gap-2">
            <Button className="rounded-full" onClick={handleNotify}>
              Notifiera mig
            </Button>
            <Button variant="outline" className="rounded-full" onClick={handleNotify}>
              Begär tidig åtkomst
            </Button>
          </div>
          {notified && (
            <p role="status" className="mt-3 text-sm text-success">
              Tack! Vi kontaktar dig när funktionen är tillgänglig.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
