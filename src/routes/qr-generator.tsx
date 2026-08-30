/**
 * QR Code Generator for Store Entrance
 *
 * Generates QR codes for store entrance markers that link to the customer navigation route.
 * Staff can print and place these at store entrances for customers to scan.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { QRCode as QRCodeIcon, Home, Printer, Download, Copy, ArrowLeft, QrCode as QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRGenerator } from "@/components/qr-generator";

const Route = createFileRoute("/qr-generator")({
  component: QRGeneratorRoute,
});

function QRGeneratorRoute() {
  const { user, activeStore } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState<string | null>(activeStore?.id ?? null);
  const [storeName, setStoreName] = useState<string | null>(activeStore?.name ?? null);

  // If no active store, redirect to login
  if (!user && !activeStore) {
    navigate({ to: "/login" });
    return null;
  }

  // Use the existing QRGenerator component with store context
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Generera QR-kod</h1>
            <p className="text-muted-foreground">
              Skapa QR-kod för butikens ingång som kunder kan skanna för att komma till kundnavigeringssidan
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            <Home className="h-4 w-4 mr-2" />
            Tillbaka
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <QRGenerator
              storeId={storeId ?? undefined}
              storeName={storeName ?? undefined}
              onPortalsGenerated={(portals) => {
                // Portals generated successfully
                toast.success("QR-kod skapad");
              }}
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Instruktioner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Välj butik (från inställningar eller ange manuellt)</li>
                  <li>Generera QR-koden</li>
                  <li>Skriv ut QR-koden (A4, storlek 8x8 cm)</li>
                  <li>Placera QR-koden vid butikens ingång</li>
                  <li>Kunder skannar QR-koden för att komma till navigeringssidan</li>
                </ol>

                <div className="mt-4 p-3 bg-primary/10 dark:bg-primary/20 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    QR-koden länkar till: <code className="text-primary">{window.location.origin}/customer-nav?storeId={storeId}</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Route };