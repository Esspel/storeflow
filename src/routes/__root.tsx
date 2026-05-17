import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { useState, useEffect } from "react";

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

function OfflineSnackbar() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <span className="bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
        Offline – ändringar sparas lokalt
      </span>
    </div>
  );
}

const rootQueryClient = new QueryClient();

export const Route = createRootRouteWithContext<RouterContext>()({
  component: function Root() {
    return (
      <AuthProvider>
        <QueryClientProvider client={rootQueryClient}>
          <RootContent />
          <Toaster position="top-right" richColors />
          <OfflineSnackbar />
        </QueryClientProvider>
      </AuthProvider>
    );
  },
});
