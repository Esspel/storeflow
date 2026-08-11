import { useRef, useState } from "react";
import { Upload, X, FileText, ChevronDown, Loader as Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ImportOption = {
  key: string;
  label: string;
  description?: string;
  type: "checkbox" | "select" | "section-header";
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean;
  /** Only show this option when another key has a certain value */
  showWhen?: { key: string; value: string | boolean };
};

export type ImportDialogResult = {
  file: File;
  options: Record<string, string | boolean>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (result: ImportDialogResult) => void;
  title: string;
  description?: string;
  accept?: string;
  options?: ImportOption[];
  /** Label for the primary import button */
  importLabel?: string;
  loading?: boolean;
};

export function ImportDialog({
  open,
  onClose,
  onImport,
  title,
  description,
  accept = ".csv",
  options = [],
  importLabel = "Importera",
  loading = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [optionValues, setOptionValues] = useState<Record<string, string | boolean>>(() => {
    const defaults: Record<string, string | boolean> = {};
    for (const o of options) {
      if (o.type === "section-header") continue;
      defaults[o.key] =
        o.defaultValue ?? (o.type === "checkbox" ? false : (o.options?.[0]?.value ?? ""));
    }
    return defaults;
  });

  // Reset state when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setSelectedFile(null);
      setDragging(false);
      onClose();
    }
  };

  const handleFile = (file: File) => {
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = () => {
    if (!selectedFile || loading) return;
    onImport({ file: selectedFile, options: optionValues });
  };

  const setOption = (key: string, value: string | boolean) => {
    setOptionValues((p) => ({ ...p, [key]: value }));
  };

  const isOptionVisible = (opt: ImportOption): boolean => {
    if (!opt.showWhen) return true;
    return optionValues[opt.showWhen.key] === opt.showWhen.value;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="w-full sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
              selectedFile && "border-primary/50 bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              aria-label="Välj fil att importera"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {selectedFile ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground truncate max-w-[220px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="ml-2 rounded-full p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {dragging ? "Släpp filen här" : "Dra & släpp en fil hit"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  eller <span className="text-primary font-medium">klicka för att välja</span>
                </p>
                <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                  {accept.toUpperCase().replace(/\./g, "").replace(/,/g, ", ")} accepteras
                </p>
              </>
            )}
          </div>

          {/* Options */}
          {options.length > 0 && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              {options.map((opt) => {
                if (!isOptionVisible(opt)) return null;

                if (opt.type === "section-header") {
                  return (
                    <p
                      key={opt.key}
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1 first:pt-0"
                    >
                      {opt.label}
                    </p>
                  );
                }

                if (opt.type === "checkbox") {
                  return (
                    <label key={opt.key} className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        aria-label={opt.label}
                        checked={!!optionValues[opt.key]}
                        onCheckedChange={(v) => setOption(opt.key, !!v)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-none text-foreground">
                          {opt.label}
                        </p>
                        {opt.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
                        )}
                      </div>
                    </label>
                  );
                }

                if (opt.type === "select" && opt.options) {
                  return (
                    <div key={opt.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{opt.label}</p>
                          {opt.description && (
                            <p className="text-xs text-muted-foreground">{opt.description}</p>
                          )}
                        </div>
                        <Select
                          value={String(optionValues[opt.key] ?? opt.options[0]?.value ?? "")}
                          onValueChange={(v) => setOption(opt.key, v)}
                        >
                          <SelectTrigger
                            aria-label={opt.label}
                            className="h-8 w-44 shrink-0 text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {opt.options.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
              Avbryt
            </Button>
            <Button
              size="sm"
              className="rounded-full gap-2"
              disabled={!selectedFile || loading}
              onClick={handleImport}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  Importerar
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  {importLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small trigger button that opens an ImportDialog */
export function ImportButton({
  label = "Importera CSV",
  title,
  description,
  accept,
  options,
  onImport,
  loading,
  className,
  variant = "outline",
  size = "default",
}: {
  label?: string;
  title: string;
  description?: string;
  accept?: string;
  options?: ImportOption[];
  onImport: (result: ImportDialogResult) => void;
  loading?: boolean;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn("rounded-full gap-2", className)}
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        <Upload className="h-4 w-4" />
        {loading ? "Importerar..." : label}
      </Button>
      <ImportDialog
        open={open}
        onClose={() => setOpen(false)}
        onImport={(result) => {
          onImport(result);
          setOpen(false);
        }}
        title={title}
        description={description}
        accept={accept}
        options={options}
        loading={loading}
        importLabel={label}
      />
    </>
  );
}
