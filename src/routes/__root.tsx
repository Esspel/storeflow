import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";

interface RouterContext {
  queryClient: QueryClient;
}

function RootContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Laddar...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Outlet />;
  }

  return <AppShell><Outlet /></AppShell>;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: function Root() {
    return (
      <AuthProvider>
        <QueryClientProvider client={new QueryClient()}>
          <RootContent />
          <Toaster position="top-right" richColors />
          <div id="offline-snackbar">
            <span className="bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
              Offline – ändringar sparas lokalt
            </span>
          </div>
        </QueryClientProvider>
      </AuthProvider>
    );
  },
});
