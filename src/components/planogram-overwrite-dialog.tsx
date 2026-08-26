/**
 * Dialog shown when a new planogram upload would overwrite
 * differing existing product data. User must confirm before merge.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Conflict = { material_nr: string; fields: string[] };

type Props = {
  open: boolean;
  conflicts: Conflict[];
  onConfirm: () => void;
  onCancel: () => void;
};

export function PlanogramOverwriteDialog({ open, conflicts, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planogram krockar med befintlig data</DialogTitle>
          <DialogDescription>
            {conflicts.length} artikel/artiklar har avvikande fält. Vill du skriva över?
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 overflow-y-auto text-sm">
          {conflicts.map((c) => (
            <li key={c.material_nr} className="py-1">
              <strong className="font-mono">{c.material_nr}</strong> — {c.fields.join(", ")}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Avbryt</Button>
          <Button onClick={onConfirm}>Skriv över</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
