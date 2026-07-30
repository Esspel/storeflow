import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase, type CommonDefect } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type CheckpointOption = { id: string; label: string; zoneName?: string };

interface ManageCommonDefectsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The active store's id. Null means global (HK) defects. */
  storeId: string | null;
  isAdmin: boolean;
  /** Optional list of kundrunda checkpoints for linking */
  checkpoints?: CheckpointOption[];
  onDefectsChanged?: () => void;
}

export function ManageCommonDefects({
  open,
  onOpenChange,
  storeId,
  isAdmin,
  checkpoints = [],
  onDefectsChanged,
}: ManageCommonDefectsProps) {
  const [defects, setDefects] = useState<CommonDefect[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newCheckpointIds, setNewCheckpointIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommonDefect | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDefects = async () => {
    let q = supabase.from("common_defects").select("*").order("sort_order");
    if (storeId) {
      q = q.eq("store_id", storeId);
    } else {
      q = q.is("store_id", null);
    }
    const { data, error } = await q;
    if (error) {
      console.error("Fel vid hämtning av avvikelser:", error.message);
      return;
    }
    if (data) setDefects(data as CommonDefect[]);
  };

  useEffect(() => {
    if (open) fetchDefects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeId]);

  const addDefect = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    const maxOrder = defects.length > 0 ? Math.max(...defects.map((d) => d.sort_order)) : -1;
    
    const { data, error } = await supabase
      .from("common_defects")
      .insert({ store_id: storeId, label, sort_order: maxOrder + 1, checkpoint_ids: newCheckpointIds })
      .select()
      .maybeSingle();

    if (error) {
      console.error("Fel vid tillägg av avvikelse:", error.message);
    } else if (data) {
      setDefects((prev) => [...prev, data as CommonDefect]);
      onDefectsChanged?.();
      setNewLabel("");
      setNewCheckpointIds([]);
    }
    setSaving(false);
  };

  const updateCheckpoints = async (defect: CommonDefect, checkpointIds: string[]) => {
    const { error } = await supabase
      .from("common_defects")
      .update({ checkpoint_ids: checkpointIds })
      .eq("id", defect.id);

    if (error) {
      console.error("Fel vid uppdatering av kontrollpunkter:", error.message);
      return;
    }

    setDefects((prev) => prev.map((d) => d.id === defect.id ? { ...d, checkpoint_ids: checkpointIds } : d));
    onDefectsChanged?.();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("common_defects").delete().eq("id", deleteTarget.id);
    
    if (error) {
      console.error("Fel vid radering:", error.message);
      return;
    }

    setDefects((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    setDeleteTarget(null);
    onDefectsChanged?.();
  };

  // Drag-and-drop reorder
  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...defects];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setDefects(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    const updates = defects.map((d, i) => ({ ...d, sort_order: i }));
    
    // Använd upsert för mer effektiv massuppdatering
    const { error } = await supabase.from("common_defects").upsert(updates);
    if (error) {
      console.error("Fel vid omstrukturering av ordning:", error.message);
      fetchDefects(); // Återställ ordning vid fel
    } else {
      onDefectsChanged?.();
    }
  };

  // CSV template download
  const handleDownloadTemplate = () => {
    const hasCheckpoints = checkpoints.length > 0;
    const header = hasCheckpoints
      ? "label;checkpoint_ids (kommaseparerade checkpoint-id, valfritt)"
      : "label";
    const exampleRows = hasCheckpoints
      ? [
          `"Utgånget datum";"${checkpoints[0]?.id ?? "checkpoint-id-1"},${checkpoints[1]?.id ?? "checkpoint-id-2"}"`,
          '"Trasig förpackning";""',
          '"Felaktig prismärkning";""',
        ]
      : ['"Utgånget datum"', '"Trasig förpackning"', '"Felaktig prismärkning"'];

    const rows = [
      "# INSTRUKTIONER: En rad per avvikelse. Rader som börjar med # ignoreras.",
      "# Kolumn 1: Benämning på avvikelsen (obligatorisk)",
      hasCheckpoints
        ? "# Kolumn 2: Kommaseparerade checkpoint-ID:n att koppla avvikelsen till (valfritt)"
        : null,
      "#",
      header,
      ...exampleRows,
    ]
      .filter((r): r is string => r !== null)
      .join("\n");

    const blob = new Blob(["\ufeff" + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vanliga_avvikelser_mall.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV export (current data)
  const handleExport = () => {
    const hasCheckpoints = checkpoints.length > 0;
    const header = hasCheckpoints ? "label;checkpoint_ids" : "label";
    const rows = [
      header,
      ...defects.map((d) => {
        const label = `"${d.label.replace(/"/g, '""')}"`;
        return hasCheckpoints
          ? `${label};"${(d.checkpoint_ids ?? []).join(",")}"`
          : label;
      }),
    ].join("\n");

    const blob = new Blob(["\ufeff" + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vanliga_avvikelser.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Säkrare CSV-rad-parser för semikolon-separerade filer
  const parseCsvLine = (text: string): string[] => {
    const result: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ";" && !inQuotes) {
        result.push(field.trim());
        field = "";
      } else {
        field += char;
      }
    }
    result.push(field.trim());
    return result;
  };

  // CSV import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const firstLine = lines[0]?.toLowerCase() ?? "";
    const dataLines = firstLine.startsWith("label") ? lines.slice(1) : lines;
    if (dataLines.length === 0) return;

    setSaving(true);
    const maxOrder = defects.length > 0 ? Math.max(...defects.map((d) => d.sort_order)) : -1;
    
    const inserts = dataLines
      .map((line, i) => {
        const cols = parseCsvLine(line);
        const label = cols[0]?.trim();
        if (!label) return null;
        const checkpointIdsRaw = cols[1] ?? "";
        const cpIds = checkpointIdsRaw
          ? checkpointIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        return { store_id: storeId, label, sort_order: maxOrder + 1 + i, checkpoint_ids: cpIds };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (inserts.length > 0) {
      const { data, error } = await supabase.from("common_defects").insert(inserts).select();
      if (error) {
        console.error("Fel vid import av CSV:", error.message);
      } else if (data) {
        setDefects((prev) => [...prev, ...(data as CommonDefect[])]);
        onDefectsChanged?.();
      }
    }
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasCheckpoints = checkpoints.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <div className="px-5 py-4 border-b border-border/60 flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Vanliga avvikelser</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAdmin
                  ? "Globala förslag — visas i alla butiker om alla saknar egna."
                  : "Butikens egna förslag på vanliga avvikelser."}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs rounded-full"
                onClick={handleDownloadTemplate}
                title="Ladda ner CSV-mall"
              >
                <Download className="h-3 w-3" />
                Mall
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs rounded-full"
                onClick={handleExport}
                disabled={defects.length === 0}
                title="Exportera till CSV"
              >
                <Download className="h-3 w-3" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                title="Importera från CSV"
              >
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
            {defects.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Inga vanliga avvikelser ännu. Lägg till nedan eller importera CSV.
              </p>
            )}
            {defects.map((d, idx) => {
              const linkedCps = hasCheckpoints
                ? checkpoints.filter((cp) => (d.checkpoint_ids ?? []).includes(cp.id))
                : [];
              const isExpanded = expandedId === d.id;
              return (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "rounded-xl border border-border/60 bg-card transition-colors",
                    dragIdx === idx && "opacity-50 bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 group">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
                    <span className="flex-1 text-sm">{d.label}</span>
                    {hasCheckpoints && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : d.id)}
                        aria-label="Visa kopplade kontrollpunkter"
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        {linkedCps.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary font-medium">
                            {linkedCps.length}
                          </span>
                        )}
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(d)}
                      aria-label={`Ta bort ${d.label}`}
                      className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {hasCheckpoints && isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
                      {linkedCps.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {linkedCps.map((cp) => (
                            <span
                              key={cp.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                            >
                              {cp.zoneName ? `${cp.zoneName} › ${cp.label}` : cp.label}
                              <button
                                type="button"
                                aria-label={`Ta bort koppling till ${cp.label}`}
                                onClick={() => updateCheckpoints(d, (d.checkpoint_ids ?? []).filter((id) => id !== cp.id))}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {checkpoints
                          .filter((cp) => !(d.checkpoint_ids ?? []).includes(cp.id))
                          .slice(0, 12)
                          .map((cp) => (
                            <button
                              key={cp.id}
                              type="button"
                              className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                              onClick={() => updateCheckpoints(d, [...(d.checkpoint_ids ?? []), cp.id])}
                            >
                              + {cp.zoneName ? `${cp.zoneName} › ${cp.label}` : cp.label}
                            </button>
                          ))}
                      </div>
                      {linkedCps.length === 0 && (
                        <p className="text-[11px] text-muted-foreground/60 italic">
                          Inte kopplad — visas vid alla kontrollpunkter.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/60 px-5 py-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Ny vanlig avvikelse..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLabel.trim()) addDefect();
                }}
                className="text-sm"
                disabled={saving}
              />
              <Button
                size="sm"
                className="rounded-full shrink-0"
                disabled={!newLabel.trim() || saving}
                onClick={addDefect}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {hasCheckpoints && newLabel.trim() && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Koppla till kontrollpunkter (valfritt):
                </p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {checkpoints.map((cp) => (
                    <button
                      key={cp.id}
                      type="button"
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        newCheckpointIds.includes(cp.id)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                      )}
                      onClick={() =>
                        setNewCheckpointIds((prev) =>
                          prev.includes(cp.id) ? prev.filter((id) => id !== cp.id) : [...prev, cp.id]
                        )
                      }
                    >
                      {newCheckpointIds.includes(cp.id) ? "✓ " : ""}
                      {cp.zoneName ? `${cp.zoneName} › ${cp.label}` : cp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort avvikelse?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.label}" tas bort permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
