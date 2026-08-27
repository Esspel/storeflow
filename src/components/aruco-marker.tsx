/**
 * Generates an Aruco marker with auto-assigned unique ID per skepp.
 * Format: MARKER_SKEPP_<NN>. Marker ID is stored on store_skepp row.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function ArucoMarker({ storeId, skeppId }: { storeId: string; skeppId: string }) {
  const [markerId, setMarkerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const { data: existing } = await supabase
          .from("store_skepp")
          .select("marker_id")
          .eq("id", skeppId)
          .maybeSingle();
        if (cancelled) return;
        if (existing?.marker_id) {
          setMarkerId(existing.marker_id);
          return;
        }
        const { count } = await supabase
          .from("store_skepp")
          .select("*", { count: "exact", head: true })
          .eq("store_id", storeId);
        const next = `MARKER_SKEPP_${String((count ?? 0) + 1).padStart(2, "0")}`;
        const { error: upErr } = await supabase
          .from("store_skepp")
          .update({ marker_id: next })
          .eq("id", skeppId);
        if (upErr) {
          setError(upErr.message);
          return;
        }
        setMarkerId(next);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Kunde inte generera markör");
      }
    }
    void generate();
    return () => {
      cancelled = true;
    };
  }, [storeId, skeppId]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!markerId) return <p className="text-sm text-gray-500">Genererar markör…</p>;
  return (
    <div className="rounded border p-3 text-sm">
      <p>
        <strong>{markerId}</strong>
      </p>
      <p className="text-xs text-gray-500">Skriv ut och placera vid skeppets bas.</p>
    </div>
  );
}
