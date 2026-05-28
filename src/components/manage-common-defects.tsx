import { useEffect, useRef, useState } from "react";
import { Download, GripVertical, Plus, Trash2, Upload } from "lucide-react";
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

interface ManageCommonDefectsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The active store's id. Null means we operate on global (HK) defects. */
  storeId: string | null;
  isAdmin: boolean;
  onDefectsChanged?: () => void;
}

export function ManageCommonDefects({
  open,
  onOpenChange,
  storeId,
  isAdmin,
  onDefectsChanged,
}: ManageCommonDefectsProps) {
  const [defects, setDefects] = useState<CommonDefect[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommonDefect | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDefects = async () => {
    let q = supabase.from("common_defects").select("*").order("sort_order");
    if (storeId) {
      q = q.eq("store_id", storeId);
    } else {
      q = q.is("store_id", null);
    }
    const { data } = await q;
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
    const { data } = await supabase
      .from("common_defects")
      .insert({ store_id: storeId, label, sort_order: maxOrder + 1 })
      .select()
      .maybeSingle();
    if (data) {
      setDefects((prev) => [...prev, data as CommonDefect]);
      onDefectsChanged?.();
    }
    setNewLabel("");
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("common_defects").delete().eq("id", deleteTarget.id);
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
    await Promise.all(
      defects.map((d, i) =>
        supabase.from("common_defects").update({ sort_order: i }).eq("id", d.id)
      )
    );
    onDefectsChanged?.();
  };

  // CSV export
  const handleExport = () => {
    const rows = ["label", ...defects.map((d) => `"${d.label.replace(/"/g, '""')}"`)]
      .join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vanliga_avvikelser.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim().replace(/^"|"$/g, "").replace(/""/g, '"'))
      .filter(Boolean);
    // Skip header row if it looks like a header
    const dataLines = lines[0]?.toLowerCase() === "label" ? lines.slice(1) : lines;
    if (dataLines.length === 0) return;

    setSaving(true);
    const maxOrder = defects.length > 0 ? Math.max(...defects.map((d) => d.sort_order)) : -1;
    const inserts = dataLines.map((label, i) => ({
      store_id: storeId,
      label,
      sort_order: maxOrder + 1 + i,
    }));
    const { data } = await supabase
      .from("common_defects")
      .insert(inserts)
      .select();
    if (data) {
      setDefects((prev) => [...prev, ...(data as CommonDefect[])]);
      onDefectsChanged?.();
    }
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <div className="px-5 py-4 border-b border-border/60 flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Vanliga avvikelser</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAdmin
                  ? "Globala förslag — visas i alla butiker om butiken inte har egna."
                  : "Butikens egna förslag på vanliga avvikelser."}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs rounded-full"
                onClick={handleExport}
                disabled={defects.length === 0}
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
              >
                <Upload className="h-3 w-3" />
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
            {defects.map((d, idx) => (
              <div
                key={d.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 group transition-colors",
                  dragIdx === idx && "opacity-50 bg-muted"
                )}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
                <span className="flex-1 text-sm">{d.label}</span>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(d)}
                  className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border/60 px-5 py-4">
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
