import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StoreMap2D, type Section2D } from "@/components/store-map-2d";
// Helpers from src/lib/digital-twin.ts (Task 3 comment):
// loadSnapshot, saveSection, deleteSection, ensureSpatialMap
import { saveSection, deleteSection } from "@/lib/digital-twin";
import { toast } from "sonner";

export function Step1Map2D({
  storeId,
  sections,
  onChange,
  onValid,
}: {
  storeId: string;
  sections: Section2D[];
  onChange: (next: Section2D[]) => void;
  onValid: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(next: Section2D[]) {
    onChange(next);
    try {
      setBusy(true);
      for (const s of next) await saveSection(storeId, s);
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte spara sektioner");
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    const id = crypto.randomUUID();
    const next: Section2D = {
      id,
      name: `Sektion ${sections.length + 1}`,
      pos_x_cm: 0,
      pos_y_cm: 0,
      width_cm: 80,
      height_cm: 200,
    };
    handleChange([...sections, next]);
    setSelectedId(id);
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await deleteSection(selectedId);
      onChange(sections.filter((s) => s.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      console.error(e);
      toast.error("Kunde inte ta bort sektion");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 1 — Rita 2D-karta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lägg till sektioner och dra dem i rutnätet (20 cm). Allt sparas
          automatiskt.
        </p>
        <StoreMap2D
          initial={sections}
          onChange={handleChange}
          onAddSection={handleAdd}
          onDeleteSection={selectedId ? handleDelete : undefined}
          selectedId={selectedId}
        />
        <div className="flex justify-end">
          <Button onClick={onValid} disabled={busy || sections.length === 0}>
            Nästa: placera markörer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}