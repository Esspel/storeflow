import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ensureSpatialMap, loadSnapshot } from "@/lib/digital-twin";
import type { Section2D } from "@/components/store-map-2d";
import type { PlacedMarker, ProductLink, WizardStep } from "@/types/digital-twin";
import { Step1Map2D } from "./Step1Map2D";
import { Step2Markers } from "./Step2Markers";
import { Step3Pdf } from "./Step3Pdf";
import { Step4Products } from "./Step4Products";
import { Step5Qr } from "./Step5Qr";
import { toast } from "sonner";

const STEPS: { id: WizardStep; title: string; description: string }[] = [
  { id: "portals", title: "2D-karta", description: "Rita butikens layout" },
  { id: "mapping", title: "Markörer", description: "Placera Aruco-markörer" },
  { id: "products", title: "PDF", description: "Generera utskrivbart ark" },
  { id: "complete", title: "Produkter", description: "Koppla planogram + tillval" },
  { id: "qr", title: "QR", description: "Skriv ut butikens QR-kod" },
];

export function DigitalTwinWizard({ onComplete }: { onComplete?: () => void }) {
  const { activeStore } = useAuth();
  const storeId = activeStore?.id ?? "";
  const [step, setStep] = useState<WizardStep>("portals");
  const [loading, setLoading] = useState(true);
  const [mapId, setMapId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section2D[]>([]);
  const [markers, setMarkers] = useState<PlacedMarker[]>([]);
  const [links, setLinks] = useState<ProductLink[]>([]);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      try {
        setLoading(true);
        const id = await ensureSpatialMap(storeId);
        setMapId(id);
        const snap = await loadSnapshot(storeId);
        setSections(snap.sections);
        setMarkers(snap.markers);
      } catch (e) {
        console.error(e);
        toast.error("Kunde inte ladda Digital Twin");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  if (!storeId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-coop-gray-600">
          Välj en aktiv butik först.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="mx-auto animate-spin" /> Laddar Digital Twin…
        </CardContent>
      </Card>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Digital Twin — Butiksinstallation</h1>
        <Progress value={((currentIdx + 1) / STEPS.length) * 100} />
        <ol className="grid grid-cols-4 gap-2 mt-3">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`rounded border p-2 text-xs ${
                i === currentIdx
                  ? "border-coop-blue-500 bg-coop-blue-100"
                  : i < currentIdx
                    ? "border-coop-gron-300 bg-coop-gron-100"
                    : "border-coop-gray-200"
              }`}
            >
              <div className="font-medium">
                {i + 1}. {s.title}
              </div>
              <div className="text-coop-gray-600">{s.description}</div>
            </li>
          ))}
        </ol>
      </header>

      <main>
        {step === "portals" && (
          <Step1Map2D
            storeId={storeId}
            sections={sections}
            onChange={setSections}
            onValid={() => setStep("mapping")}
          />
        )}
        {step === "mapping" && mapId && (
          <Step2Markers
            storeId={storeId}
            mapId={mapId}
            sections={sections}
            markers={markers}
            onMarkersChange={setMarkers}
            onValid={() => setStep("products")}
          />
        )}
        {step === "products" && (
          <>
            <Step3Pdf />
            <div className="flex justify-end mt-4">
              <Button onClick={() => setStep("complete")}>
                Nästa: koppla produkter <ChevronRight className="ml-1" />
              </Button>
            </div>
          </>
        )}
        {step === "complete" && (
          <Step4Products
            storeId={storeId}
            markers={markers as any}
            links={links}
            onLinksChange={setLinks}
            onValid={(ok: boolean) => {
              if (ok) setStep("qr");
            }}
          />
        )}
        {step === "qr" && (
          <Step5Qr storeId={storeId} storeName={activeStore?.name ?? ""} />
        )}
      </main>

      <footer className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(STEPS[Math.max(0, currentIdx - 1)].id)}
          disabled={currentIdx === 0}
        >
          <ChevronLeft className="mr-1" /> Tillbaka
        </Button>
        {step === "qr" ? (
          <Button onClick={onComplete}>
            <Check className="mr-1" /> Klar
          </Button>
        ) : step === "complete" ? (
          <Button onClick={() => setStep("qr")}>
            Nästa: QR-kod <ChevronRight className="ml-1" />
          </Button>
        ) : (
          <Button
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, currentIdx + 1)].id)}
            disabled={currentIdx === STEPS.length - 1}
          >
            Hoppa över <ChevronRight className="ml-1" />
          </Button>
        )}
      </footer>
    </div>
  );
}
