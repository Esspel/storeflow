/**
 * Planogram Upload Route
 * Protected route - requires authentication to upload confidential planogram data
 */

import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { PlanogramUpload } from "@/components/planogram-upload";

function PlanogramUploadPage() {
  const { user, activeStore, loading: authLoading } = useAuth();

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Kontrollerar autentisering...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center p-8">
          <svg className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Autentisering krävs
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
            Planogramuppladdning är konfidentiell och kräver inloggning. Logga in för att ladda upp planogram.
          </p>
        </div>
      </div>
    );
  }

  // Check if user has a store
  if (!activeStore?.id) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center p-8">
          <svg className="w-16 h-16 text-amber-300 dark:text-amber-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Ingen butik vald
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
            Du måste välja en butik för att ladda upp planogram. Välj butik i inställningarna.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Ladda upp planogram
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Ladda upp PDF-planogram för {activeStore.name} för att skapa hyllplaner och aktivera efterlevnadskontroller
          </p>
        </div>

        <PlanogramUpload
          storeId={activeStore.id}
          onImportSuccess={(planogramId) => {
            // Navigation handled by component
            console.log("Planogram imported:", planogramId);
          }}
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/planogram-upload")({
  component: PlanogramUploadPage,
});