import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Keyboard, X } from "lucide-react";

const SHORTCUTS: { key: string; label: string; to: string }[] = [
  { key: "1", label: "Dashboard", to: "/" },
  { key: "2", label: "Uppgifter", to: "/uppgifter" },
  { key: "3", label: "Schema", to: "/schema" },
  { key: "4", label: "Avvikelser", to: "/avvikelser" },
  { key: "5", label: "Kundönskemål", to: "/kundonskemal" },
  { key: "6", label: "Möten", to: "/moten" },
  { key: "7", label: "Kundrunda", to: "/kundrunda" },
  { key: "8", label: "Rapporter", to: "/rapporter" },
  { key: "9", label: "Personal", to: "/personal" },
  { key: "0", label: "Inställningar", to: "/installningar" },
  { key: "b", label: "Belastning", to: "/belastning" },
  { key: "p", label: "Pulstavla", to: "/pulstavla" },
];

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Don't trigger while typing in inputs
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable) return;
      // Modifier keys used for browser shortcuts — skip
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }

      const shortcut = SHORTCUTS.find((s) => s.key === e.key);
      if (shortcut) {
        e.preventDefault();
        navigate({ to: shortcut.to });
        setShowHelp(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Tangentbordsgenvägar</span>
          </div>
          <button
            onClick={() => setShowHelp(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="divide-y divide-border/40">
          {SHORTCUTS.map((s) => (
            <button
              key={s.key}
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors"
              onClick={() => { navigate({ to: s.to }); setShowHelp(false); }}
            >
              <span className="text-foreground">{s.label}</span>
              <kbd className="rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {s.key}
              </kbd>
            </button>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Stäng hjälp</span>
            <kbd className="rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">Esc</kbd>
          </div>
        </div>
        <div className="border-t border-border/40 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Tryck <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd> för att öppna/stänga
          </p>
        </div>
      </div>
    </div>
  );
}
