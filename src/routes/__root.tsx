import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useNavigate,
  Outlet,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { FirstTimeSetup } from "@/components/first-time-setup";
import { BarcodeProvider } from "@/lib/barcode-context";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Sidan hittades inte</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sidan du letar efter finns inte eller har flyttats.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Till startsidan
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  const errorMessage = error?.stack || error?.message || String(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Sidan laddades inte
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Något gick fel. Prova att ladda om sidan.
        </p>

        <div className="mt-4 rounded-md border border-border bg-muted/50 px-4 py-3 text-left">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Feldetaljer:</p>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-all text-xs text-destructive font-mono">
            {errorMessage}
          </pre>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Försök igen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Till startsidan
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "StoreFlow — Retail Operations Platform" },
      {
        name: "description",
        content:
          "Modern retail operations management för butikskedjor: uppgifter, avvikelser och realtidsuppföljning.",
      },
      { name: "theme-color", content: "#3d8c5e" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "StoreFlow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppLayout() {
  const { user, loading, showFirstTimeSetup, dismissFirstTimeSetup } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const isLoginPage = pathname === "/login";
  const isPublicRoute =
    pathname === "/qr-kundonskemal" ||
    pathname === "/qr-kundonskemal-form" ||
    pathname === "/customer-nav";

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage && !isPublicRoute) {
      navigate({ to: "/login" });
    } else if (user && isLoginPage && !user.must_change_password) {
      navigate({ to: "/" });
    }
  }, [user, loading, isLoginPage, isPublicRoute, navigate]);

  if (loading && !isPublicRoute) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent motion-reduce:animate-none" />
        <span className="sr-only">Laddar…</span>
      </div>
    );
  }

  if (isLoginPage) {
    return <Outlet />;
  }

  if (isPublicRoute) {
    return <Outlet />;
  }

  if (!user) return null;

  if (showFirstTimeSetup) {
    return <FirstTimeSetup onComplete={dismissFirstTimeSetup} />;
  }

  return <AppShell />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BarcodeProvider>
          <AppLayout />
        </BarcodeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
