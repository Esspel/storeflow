/**
 * Planogram Upload Route
 * Protected route - requires authentication to access confidential planogram data
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { PlanogramUpload } from "@/components/planogram-upload";

export const Route = createFileRoute("/planogram-upload")({
  // Protect the route - redirect to login if not authenticated
  beforeLoad: () => {
    // The actual auth check happens in the component via useAuth
  },
  component: PlanogramUploadPage,
});

function PlanogramUploadPage() {
  const { user, activeStore, loading: authLoading } = useAuth();

  // Show loading while auth is being verified
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Inloggning krävs</h2>
          <p className="text-muted-foreground">Du måste vara inloggad för att ladda upp planogram.</p>
        </div>
      </div>
    );
  }

  // Check if user has an active store
  if (!activeStore) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Ingen aktiv butik</h2>
          <p className="text-muted-foreground">Välj en butik för att ladda upp planogram.</p>
        </div>
      </div>
    );
  }

  return (
    <PlanogramUpload
      storeId={activeStore.id}
      className="h-full"
    />
  );
}