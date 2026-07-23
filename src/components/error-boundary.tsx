import React from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  /** Label shown in the fallback UI, e.g. "Kundrunda" */
  section?: string;
  /** Current active store id for telemetry context */
  storeId?: string | null;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Fire-and-forget: report to system_errors table
    const activeStoreId = this.props.storeId ?? null;
    supabase.from("system_errors").insert({
      error_message: error.message.slice(0, 2000),
      component_stack: info.componentStack?.slice(0, 4000) ?? null,
      store_id: activeStoreId,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      extra: { section: this.props.section ?? "unknown" },
    }).then(() => {});
  }

  render() {
    if (!this.state.error) return this.props.children;

    const errorMessage = this.state.error?.stack || this.state.error?.message || String(this.state.error);

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {this.props.section ? `${this.props.section} kunde inte laddas` : "Något gick fel"}
          </p>
          <p className="text-xs text-muted-foreground">
            Ett oväntat fel uppstod. Resten av appen fungerar normalt.
          </p>
        </div>

        <div className="w-full max-w-xl rounded-md border border-border bg-muted/50 px-4 py-3 text-left">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Feldetaljer:
          </p>
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-xs text-destructive font-mono">
            {errorMessage}
          </pre>
        </div>

        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-75"
        >
          Försök igen
        </button>
      </div>
    );
  }
}