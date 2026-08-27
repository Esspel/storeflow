/**
 * Store Setup Wizard - Digital Twin
 * Guided flow for new stores: 2D map → Aruco markers → PDF generation → Product registration
 * Uses Digital Twin Wizard component with 4 clear steps
 * All state saved via Supabase client directly (no REST API calls)
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { DigitalTwinWizard } from "@/components/digital-twin/Wizard";

export const Route = createFileRoute("/store-setup")({
  component: StoreSetupPage,
});

function StoreSetupPage() {
  const { activeStore } = useAuth();
  const navigate = useNavigate();

  if (!activeStore?.id) {
    // Redirect to login if no active store
    navigate({ to: "/login", replace: true });
    return null; // Prevent render while redirecting
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <DigitalTwinWizard
          onComplete={() => {
            // Navigate to dashboard or wherever appropriate after completion
            navigate({ to: "/shelf-analytics" });
          }}
        />
      </div>
    </div>
  );
}
// QR-generator för customer-nav
export function generateStoreQR(storeId: string) {
  return `${window.location.origin}/customer-nav?storeId=${storeId}`;
}
