import React from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  /** Label shown in the fallback UI, e.g. "Kundrunda" */
  section?: string;
  /** Current active store id for telemetry context */
  storeId?: string | null;
  /** Tvinga visning av fullständig stack trace i UI:t (Standard: true i dev, valfritt i prod) */
  showStackTraceInUI?: boolean;
  /** Custom fallback component or render function */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
};

type State = {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorInfo: info });

    // 1. Logga ALLTID hela stack tracet och komponentstacken direkt i webbläsarkonsolen
    console.group(`🚨 ErrorBoundary caught an error [${this.props.section ?? "General"}]`);
    console.error("Error:", error);
    console.error("Component Stack:", info.componentStack);
    console.groupEnd();

    // 2. Fire-and-forget: Rapportera till Supabase (system_errors)
    const activeStoreId = this.props.storeId ?? null;

    supabase
      .from("system_errors")
      .insert({
        error_message: error.message?.slice(0, 2000) ?? "Unknown error",
        component_stack: info.componentStack?.slice(0, 4000) ?? null,
        store_id: activeStoreId,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        route: typeof window !== "undefined" ? window.location.pathname : null,
        extra: { section: this.props.section ?? "unknown" },
      })
      .then(
        ({ error: insertErr }) => {
          if (insertErr) {
            console.error("ErrorBoundary: Failed to log error to Supabase:", insertErr);
          }
        },
        (err) => {
          console.error("ErrorBoundary: Network error while logging to Supabase:", err);
        },
      );
  }

  componentDidUpdate(prevProps: Props) {
    // Återställ feltillståndet automatiskt om användaren navigerar om
    if (
      this.state.error &&
      (prevProps.section !== this.props.section || prevProps.storeId !== this.props.storeId)
    ) {
      this.resetError();
    }
  }

  resetError = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    const { error, errorInfo } = this.state;
    const { children, fallback, section, showStackTraceInUI } = this.props;

    if (!error) return children;

    // Om en anpassad fallback finns skickas kontrollen dit
    if (fallback) {
      if (typeof fallback === "function") {
        return fallback(error, this.resetError);
      }
      return fallback;
    }

    const isDev = process.env.NODE_ENV !== "production";
    const shouldShowFullTrace = showStackTraceInUI ?? isDev;

    // Kombinera felmeddelandet, JS-stacktrace och Reacts komponentstack för UI:t
    const fullTraceOutput = [
      error.stack || error.message || String(error),
      errorInfo?.componentStack ? `\nComponent Stack:${errorInfo.componentStack}` : "",
    ].join("\n");

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[320px] w-full flex-col items-center justify-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-coop-gray-900">
            {section ? `${section} kunde inte laddas` : "Något gick fel"}
          </p>
          <p className="text-xs text-coop-gray-900">
            Ett oväntat fel uppstod. Detaljer finns nedan och i webbläsarens konsol.
          </p>
        </div>

        <div className="w-full max-w-3xl rounded-md border border-border bg-muted/60 px-4 py-3 text-left shadow-inner">
          <p className="mb-1.5 text-xs font-semibold text-coop-gray-900 uppercase tracking-wider">
            Stack Trace & Komponentträd:
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-destructive">
            {shouldShowFullTrace ? fullTraceOutput : error.message || String(error)}
          </pre>
        </div>

        <button
          onClick={this.resetError}
          className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Försök igen
        </button>
      </div>
    );
  }
}
