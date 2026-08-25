/**
 * Planogram Upload Component
 * Drag-and-drop PDF upload with preview and import to StoreFlow
 */

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  Eye,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Download,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  parsePlanogramPdf,
  parsedToShelfPlanogram,
  matchProductsWithDatabase,
  type ParsedPlanogram,
  type ParsedProduct,
} from "@/lib/planogram-parser";
import { supabase, uploadAttachment, getPublicUrl } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface PlanogramUploadProps {
  storeId: string;
  onImportSuccess?: (planogramId: string) => void;
  className?: string;
}

interface ParsedPlanogramValidation {
  valid: boolean;
  errors: string[];
}

interface StoreFlowPlanogramInput {
  name: string;
  shelf_marker_id: string | null;
  expected_products: Array<{
    productId: string;
    ean: string;
    name: string;
    expectedPosition: { x: number; y: number; z: number };
    expectedFacings: number;
    expectedQuantity: number;
    metadata?: Record<string, unknown>;
  }>;
  version: number;
  is_active: boolean;
}

interface UploadedFile {
  file: File;
  parsed?: ParsedPlanogram;
  validation?: ParsedPlanogramValidation;
  storeFlowData?: StoreFlowPlanogramInput;
  status: "pending" | "parsing" | "parsed" | "validating" | "importing" | "completed" | "error";
  error?: string;
  pdfUrl?: string; // Supabase storage URL
}

export function PlanogramUpload({ storeId, onImportSuccess, className }: PlanogramUploadProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [showPreview, setShowPreview] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf",
    );

    if (droppedFiles.length === 0) {
      toast.error("Endast PDF-filer accepteras");
      return;
    }

    await processFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (f) => f.type === "application/pdf",
    );

    if (selectedFiles.length > 0) {
      await processFiles(selectedFiles);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const processFiles = async (newFiles: File[]) => {
    for (const file of newFiles) {
      const uploadedFile: UploadedFile = {
        file,
        status: "pending",
      };
      setFiles((prev) => [...prev, uploadedFile]);

      // Parse immediately
      await parseFile(uploadedFile);
    }
  };

  const parseFile = async (uploadedFile: UploadedFile) => {
    setFiles((prev) => prev.map((f) => (f === uploadedFile ? { ...f, status: "parsing" } : f)));

    try {
      const parsed = await parsePlanogramPdf(uploadedFile.file);

      // Validate - basic check
      const validation: ParsedPlanogramValidation = {
        valid: parsed.zones.length > 0 && parsed.zones.some((z) => z.shelves.length > 0),
        errors: parsed.zones.length === 0 ? ["Inga zoner hittades i PDF"] : [],
      };

      // Upload PDF to Supabase storage for reference
      const pdfPath = `planograms/${storeId}/${Date.now()}-${uploadedFile.file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(pdfPath, uploadedFile.file, {
          contentType: "application/pdf",
          upsert: false,
        });

      let pdfUrl: string | undefined;
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(pdfPath);
        pdfUrl = urlData.publicUrl;
      }

      setFiles((prev) =>
        prev.map((f) =>
          f === uploadedFile
            ? {
                ...f,
                parsed,
                validation,
                status: validation.valid ? "parsed" : "error",
                error: validation.valid ? undefined : validation.errors.join(", "),
                pdfUrl,
              }
            : f,
        ),
      );
    } catch (err) {
      console.error("Parse error:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f === uploadedFile ? { ...f, status: "error", error: "Kunde inte tolka PDF-filen" } : f,
        ),
      );
    }
  };

  const prepareImport = async (uploadedFile: UploadedFile) => {
    if (!uploadedFile.parsed || !user) return;

    setFiles((prev) => prev.map((f) => (f === uploadedFile ? { ...f, status: "validating" } : f)));

    try {
      // Fetch product catalog for this store to map EAN/SKU to product IDs
      const { data: products } = await supabase
        .from("products")
        .select("id, ean, article_number, name")
        .eq("store_id", storeId);

      // Transform to expected format for matching
      const storeProducts = (products ?? []).map((p) => ({
        id: p.id,
        ean: p.ean ?? "",
        sku: p.article_number ?? p.id,
        name: p.name,
      }));

      // Match parsed products with database
      const matched = await matchProductsWithDatabase(uploadedFile.parsed, storeProducts);

      // Convert to ShelfPlanogram format
      const shelfPlanogram = parsedToShelfPlanogram(matched);
      shelfPlanogram.store_id = storeId;

      // Transform ExpectedProduct[] to StoreFlowPlanogramInput format
      const expectedProducts = shelfPlanogram.expected_products.map((p) => ({
        productId: p.product_id,
        ean: p.ean,
        name: p.name,
        expectedPosition: {
          x: p.position.x_offset_inch * 0.0254, // inches to meters
          y: p.position.y_offset_inch * 0.0254,
          z: p.position.z_offset_inch * 0.0254,
        },
        expectedFacings: p.facings,
        expectedQuantity: p.total_quantity,
        metadata: {},
      }));

      // Prepare storeFlowData for import
      const storeFlowData: StoreFlowPlanogramInput = {
        name: uploadedFile.parsed.planogramName ?? `Planogram ${new Date().toLocaleDateString("sv-SE")}`,
        shelf_marker_id: null, // Will be set during marker mapping
        expected_products: expectedProducts,
        version: 1,
        is_active: true,
      };

      setFiles((prev) =>
        prev.map((f) =>
          f === uploadedFile
            ? {
                ...f,
                parsed: matched,
                storeFlowData,
                status: "parsed",
              }
            : f,
        ),
      );

      setShowPreview(uploadedFile);

      // Show info toast if using fallback
      if (!products || products.length === 0) {
        toast.info("Produktkatalog tom - använder EAN som produkt-ID (kan uppdateras senare)");
      }
    } catch (err) {
      console.error("Prepare import error:", err);
      toast.error("Kunde inte förbereda import");
    }
  };

  const importPlanogram = async (uploadedFile: UploadedFile) => {
    if (!uploadedFile.storeFlowData || !user) return;

    setFiles((prev) => prev.map((f) => (f === uploadedFile ? { ...f, status: "importing" } : f)));

    try {
      // Create planogram in database
      const { data: planogram, error: planogramError } = await supabase
        .from("shelf_planograms")
        .insert({
          store_id: storeId,
          name: uploadedFile.storeFlowData.name,
          shelf_marker_id: uploadedFile.storeFlowData.shelf_marker_id,
          expected_products: uploadedFile.storeFlowData.expected_products,
          version: uploadedFile.storeFlowData.version,
          is_active: uploadedFile.storeFlowData.is_active,
          pdf_storage_path: uploadedFile.pdfUrl
            ? uploadedFile.pdfUrl.split("/attachments/")[1]
            : null,
          created_by: user.id,
        })
        .select()
        .single();

      if (planogramError) throw planogramError;

      // Link PDF file if uploaded
      if (uploadedFile.pdfUrl) {
        await supabase.from("planogram_pdfs").insert({
          planogram_id: planogram.id,
          storage_path: uploadedFile.pdfUrl.split("/attachments/")[1],
          original_filename: uploadedFile.file.name,
          uploaded_by: user.id,
        });
      }

      setFiles((prev) => prev.map((f) => (f === uploadedFile ? { ...f, status: "completed" } : f)));

      toast.success(`Planogram "${uploadedFile.storeFlowData.name}" importerat!`);
      onImportSuccess?.(planogram.id);
      setShowPreview(null);
    } catch (err) {
      console.error("Import error:", err);
      setFiles((prev) =>
        prev.map((f) =>
          f === uploadedFile ? { ...f, status: "error", error: "Import misslyckades" } : f,
        ),
      );
      toast.error("Kunde inte importera planogram");
    }
  };

  const removeFile = (uploadedFile: UploadedFile) => {
    setFiles((prev) => prev.filter((f) => f !== uploadedFile));
  };

  const retryFile = async (uploadedFile: UploadedFile) => {
    setFiles((prev) =>
      prev.map((f) => (f === uploadedFile ? { ...f, status: "pending", error: undefined } : f)),
    );
    await parseFile(uploadedFile);
  };

  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "pending":
      case "parsing":
      case "validating":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "parsed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "importing":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusLabel = (status: UploadedFile["status"]) => {
    switch (status) {
      case "pending":
        return "Väntar";
      case "parsing":
        return "Tolkar...";
      case "validating":
        return "Validerar...";
      case "parsed":
        return "Klar för import";
      case "importing":
        return "Importerar...";
      case "completed":
        return "Importerat";
      case "error":
        return "Fel";
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          "border-gray-300 hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400",
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          id="planogram-upload"
        />
        <label htmlFor="planogram-upload" className="cursor-pointer">
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Dra och släpp planogram-PDF här
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            eller klicka för att välja filer
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Accepterar: PDF (max 10MB per fil)
          </p>
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Uppladdade filer ({files.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.map((uploadedFile, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  uploadedFile.status === "error" &&
                    "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20",
                  uploadedFile.status === "completed" &&
                    "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20",
                  "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
                )}
              >
                <div className="flex-shrink-0">{getStatusIcon(uploadedFile.status)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {uploadedFile.file.name}
                    </span>
                    <Badge
                      variant={
                        uploadedFile.status === "error"
                          ? "destructive"
                          : uploadedFile.status === "completed"
                            ? "default"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {getStatusLabel(uploadedFile.status)}
                    </Badge>
                  </div>

                  {uploadedFile.parsed && (
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <span>
                        Planogram:{" "}
                        <span className="font-medium">
                          {uploadedFile.parsed.planogramName ?? "Okänt"}
                        </span>
                      </span>
                      <span>
                        Zoner:{" "}
                        <span className="font-medium">{uploadedFile.parsed.zones.length}</span>
                      </span>
                      <span>
                        Hyllor:{" "}
                        <span className="font-medium">
                          {uploadedFile.parsed.zones.reduce((sum, z) => sum + z.shelves.length, 0)}
                        </span>
                      </span>
                      <span>
                        Produkter:{" "}
                        <span className="font-medium">
                          {uploadedFile.parsed.zones.reduce(
                            (sum, z) => sum + z.shelves.reduce((s, shelf) => s + shelf.products.length, 0),
                            0,
                          )}
                        </span>
                      </span>
                      {uploadedFile.validation && uploadedFile.validation.errors.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          ⚠ {uploadedFile.validation.errors.length} varningar
                        </span>
                      )}
                    </div>
                  )}

                  {uploadedFile.error && (
                    <div className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {uploadedFile.error}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {uploadedFile.status === "parsed" &&
                    uploadedFile.parsed &&
                    !uploadedFile.storeFlowData && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => prepareImport(uploadedFile)}
                      >
                        Förbered import
                      </Button>
                    )}

                  {uploadedFile.storeFlowData && uploadedFile.status === "parsed" && (
                    <Button size="sm" onClick={() => importPlanogram(uploadedFile)}>
                      Importera
                    </Button>
                  )}

                  {uploadedFile.status === "error" && (
                    <Button size="sm" variant="outline" onClick={() => retryFile(uploadedFile)}>
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Försök igen
                    </Button>
                  )}

                  {uploadedFile.pdfUrl && (
                    <a
                      href={uploadedFile.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Visa original PDF"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                  )}

                  {uploadedFile.status === "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => removeFile(uploadedFile)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}

                  {uploadedFile.status !== "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => removeFile(uploadedFile)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!showPreview} onOpenChange={(open) => !open && setShowPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Förhandsgranskning: {showPreview?.parsed?.planogramName ?? "Okänt planogram"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-0 overflow-auto max-h-[70vh]">
            {showPreview?.parsed && (
              <div className="p-4 space-y-4">
                {/* Header Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Planogram Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Namn</Label>
                      <p className="font-medium">{showPreview.parsed.planogramName ?? "Okänt"}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Butik</Label>
                      <p className="font-medium">{showPreview.parsed.storeName ?? "Okänd"}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Zoner</Label>
                      <p className="font-medium">{showPreview.parsed.zones.length}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Sidor</Label>
                      <p className="font-medium">{showPreview.parsed.metadata.pageCount}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Validation */}
                {showPreview.validation && (
                  <Card
                    className={cn(
                      showPreview.validation.valid ? "border-green-200" : "border-red-200",
                    )}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {showPreview.validation.valid ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        )}
                        Validering
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {showPreview.validation.errors.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-red-600 dark:text-red-400 font-medium">Fel:</Label>
                          <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                            {showPreview.validation.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {showPreview.validation.errors.length === 0 && (
                        <p className="text-green-600 dark:text-green-400">
                          Inga problem hittades
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Shelves Preview */}
                {showPreview.parsed?.zones.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Hyllayout ({showPreview.parsed.zones.reduce((sum, z) => sum + z.shelves.length, 0)} hyllor)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                        {showPreview.parsed.zones.map((zone) => (
                          <div key={zone.id} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{zone.name}</span>
                              <span className="text-xs text-gray-500">{zone.shelves.length} hyllor, {zone.shelves.reduce((s, sh) => s + sh.products.length, 0)} produkter</span>
                            </div>
                            <div className="space-y-2">
                              {zone.shelves.map((shelf) => (
                                <div key={shelf.id} className="border-t pt-2">
                                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-1">
                                    <span>Hylla: {shelf.name} (nivå {shelf.level})</span>
                                    <span>Produkter: {shelf.products.length}</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b text-left text-gray-500">
                                          <th className="pb-1 pr-3">POS</th>
                                          <th className="pb-1 pr-3">EAN</th>
                                          <th className="pb-1 pr-3">SKU</th>
                                          <th className="pb-1 pr-3">Artikel</th>
                                          <th className="pb-1 pr-3">Facings</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {shelf.products.map((product) => (
                                          <tr key={product.id} className="border-b">
                                            <td className="py-1 pr-3 font-mono">{product.position.index + 1}</td>
                                            <td className="py-1 pr-3 font-mono">{product.ean ?? "-"}</td>
                                            <td className="py-1 pr-3 font-mono">{product.sku}</td>
                                            <td className="py-1 pr-3">{product.name}</td>
                                            <td className="py-1 pr-3 text-center">{product.facings}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* StoreFlow Import Preview */}
                {showPreview.storeFlowData && (
                  <Card className="border-blue-200 dark:border-blue-900">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-blue-500" />
                        StoreFlow Import Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Butik</Label>
                          <p className="font-medium">{storeId}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Namn</Label>
                          <p className="font-medium">{showPreview.storeFlowData.name}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Produkter</Label>
                          <p className="font-medium">{showPreview.storeFlowData.expected_products.length}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Version</Label>
                          <p className="font-medium">{showPreview.storeFlowData.version}</p>
                        </div>
                      </div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400 mb-2">
                          Visa alla förväntade produkter ({showPreview.storeFlowData.expected_products.length})
                        </summary>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {showPreview.storeFlowData.expected_products.map((p, i) => (
                            <div key={i} className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                              {p.ean} - {p.name} (Facings: {p.expectedFacings})
                            </div>
                          ))}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}