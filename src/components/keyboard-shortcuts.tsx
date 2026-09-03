import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Keyboard, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type Shortcut = {
  key: string;
  label: string;
  to: string;
  /** Minimum role required: "all" = everyone, "manager" = chef+admin, "hk" = hk/admin */
  access?: "all" | "manager" | "hk";
};

// Order matches sidebar exactly:
// Drift: Dashboard, Uppgifter, Schema, Avvikelser, Kundönskemål
// then Möten, Kundrunda (accessible to all store users)
// Operations: Rapporter
// Admin: Personal, Inställningar
// Special: Belastning (manager), Pulstavla
const ALL_SHORTCUTS: Shortcut[] = [
  { key: "1", label: "Dashboard", to: "/", access: "all" },
  { key: "2", label: "Uppgifter", to: "/uppgifter", access: "all" },
  { key: "3", label: "Schema", to: "/schema", access: "all" },
  { key: "4", label: "Avvikelser", to: "/avvikelser", access: "all" },
  { key: "5", label: "Kundönskemål", to: "/kundonskemal", access: "all" },
  { key: "6", label: "Kundrunda", to: "/kundrunda", access: "all" },
  { key: "7", label: "Rapporter", to: "/rapporter", access: "all" },
  { key: "8", label: "Personal", to: "/personal", access: "manager" },
  { key: "9", label: "Inställningar", to: "/installningar", access: "all" },
  { key: "b", label: "Medarbetarbelastning", to: "/belastning", access: "manager" },
];

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showHelp, setShowHelp] = useState(false);

  const isManager = user?.role === "manager" || user?.role === "admin";
  const isHK = user?.hierarchy_level === "hk" || user?.role === "admin";

  const visibleShortcuts = ALL_SHORTCUTS.filter((s) => {
    if (s.access === "manager") return isManager;
    if (s.access === "hk") return isHK;
    return true;
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Flytta fokus in i dialogen när den öppnas och återställ när den stängs
  useEffect(() => {
    if (!showHelp) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [showHelp]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
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

      const shortcut = visibleShortcuts.find((s) => s.key === e.key);
      if (shortcut) {
        e.preventDefault();
        navigate({ to: shortcut.to });
        setShowHelp(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, visibleShortcuts]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-coop-svart/50 backdrop-blur-sm"
      onClick={() => setShowHelp(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kortkommandon"
        tabIndex={-1}
        ref={dialogRef}
        className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-border/60 bg-coop-gray-100 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-coop-gray-900" />
            <span className="text-sm font-semibold text-coop-gray-900">Tangentbordsgenvägar</span>
          </div>
          <button
            type="button"
            aria-label="Stäng"
            onClick={() => setShowHelp(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-coop-gray-900 hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="divide-y divide-border/40 max-h-[70vh] overflow-y-auto">
          {visibleShortcuts.map((s) => (
            <button
              key={s.key}
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors"
              onClick={() => {
                navigate({ to: s.to });
                setShowHelp(false);
              }}
            >
              <span className="text-coop-gray-900">{s.label}</span>
              <kbd className="rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs text-coop-gray-900">
                {s.key}
              </kbd>
            </button>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-coop-gray-900">Stäng</span>
            <kbd className="rounded-md border border-border/60 bg-muted px-2 py-0.5 font-mono text-xs text-coop-gray-900">
              Esc
            </kbd>
          </div>
        </div>
        <div className="border-t border-border/40 px-4 py-2.5">
          <p className="text-xs text-coop-gray-900">
            Tryck{" "}
            <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
              ?
            </kbd>{" "}
            för att öppna/stänga
          </p>
        </div>
      </div>
    </div>
  );
}
