import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/veckouppdrag")({ component: WeeklyTasksPage });

function WeeklyTasksPage() {
  const [items, setItems] = useState<{ material_nr: string; produktnamn: string }[]>([]);
  const [days, setDays] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("products").select("material_nr, produktnamn").is("hallbarhetsdagar_tillverkning", null).limit(10);
      setItems(data ?? []);
    })();
  }, []);

  async function save(material_nr: string) {
    const value = days[material_nr];
    if (!value || value <= 0) { toast.error("Ange ett positivt värde"); return; }
    const { error } = await supabase.from("products").update({ hallbarhetsdagar_tillverkning: value }).eq("material_nr", material_nr);
    if (error) { toast.error(error.message); return; }
    toast.success("Sparat globalt");
    setItems((prev) => prev.filter((i) => i.material_nr !== material_nr));
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Veckouppdrag</h1>
      <p className="text-sm text-gray-600">Fyll i hållbarhetsdagar för artiklar som saknar uppgift. Sparas direkt i global products-tabell.</p>
      {items.map((i) => (
        <Card key={i.material_nr}>
          <CardHeader><CardTitle>{i.produktnamn}</CardTitle>
            <p className="text-xs text-gray-500">{i.material_nr}</p>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input type="number" min={1} placeholder="Hållbarhetsdagar" onChange={(e) => setDays({ ...days, [i.material_nr]: Number(e.target.value) })} />
            <Button onClick={() => save(i.material_nr)}>Spara</Button>
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && <p className="text-sm text-gray-500">Inga artiklar saknar hållbarhetsdagar.</p>}
    </div>
  );
}
