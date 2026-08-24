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
  parsePlanogramPDF,
  planogramToStoreFlow,
  validateParsedPlanogram,
  type ParsedPlanogram,
  type StoreFlowPlanogramInput,
  type ExpectedProduct,
} from "@/lib/pdf-planogram-parser";
import { supabase, uploadAttachment, getPublicUrl } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface PlanogramUploadProps {
  storeId: string;
  onImportSuccess?: (planogramId: string) => void;
  className?: string;
}

interface UploadedFile {
  file: File;
  parsed?: ParsedPlanogram;
  validation?: ReturnType<typeof validateParsedPlanogram>;
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
      const arrayBuffer = await uploadedFile.file.arrayBuffer();
      const parsed = await parsePlanogramPDF(new Uint8Array(arrayBuffer), uploadedFile.file.name);
      const validation = validateParsedPlanogram(parsed);

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
      // Fetch product catalog for this store to map EAN/BNR to product IDs
      let productCatalog = new Map<string, { id: string; sap_article_id: string }>();

      try {
        const { data: products, error: productsError } = await supabase
          .from("products")
          .select("id, sap_article_id, ean, article_number")
          .eq("store_id", storeId);

        if (!productsError && products) {
          products.forEach((p) => {
            if (p.ean)
              productCatalog.set(p.ean, {
                id: p.id,
                sap_article_id: p.sap_article_id || p.article_number || p.id,
              });
            if (p.article_number)
              productCatalog.set(p.article_number, {
                id: p.id,
                sap_article_id: p.sap_article_id || p.article_number,
              });
          });
        }
      } catch (catalogError) {
        // Products table might not exist yet - that's OK, we'll use fallback
        console.warn("Products table not accessible, using BNR fallback:", catalogError);
      }

      // If no products found, we'll use fallback mapping in planogramToStoreFlow
      const storeFlowData = planogramToStoreFlow(uploadedFile.parsed, productCatalog, storeId);

      setFiles((prev) =>
        prev.map((f) => (f === uploadedFile ? { ...f, storeFlowData, status: "parsed" } : f)),
      );

      setShowPreview(uploadedFile);

      // Show info toast if using fallback
      if (productCatalog.size === 0) {
        toast.info("Produktkatalog tom - använder BNR som produkt-ID (kan uppdateras senare)");
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
                          {uploadedFile.parsed.header.planogramName}
                        </span>
                      </span>
                      <span>
                        Hyllor:{" "}
                        <span className="font-medium">{uploadedFile.parsed.shelves.length}</span>
                      </span>
                      <span>
                        Produkter:{" "}
                        <span className="font-medium">
                          {uploadedFile.parsed.shelves.reduce(
                            (sum, s) => sum + s.products.length,
                            0,
                          )}
                        </span>
                      </span>
                      {uploadedFile.validation && uploadedFile.validation.warnings.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          ⚠ {uploadedFile.validation.warnings.length} varningar
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
              Förhandsgranskning: {showPreview?.parsed?.header.planogramName}
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
                      <p className="font-medium">{showPreview.parsed.header.planogramName}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Startdatum</Label>
                      <p className="font-medium">{showPreview.parsed.header.startDate}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Kategori</Label>
                      <p className="font-medium">{showPreview.parsed.header.spaceCategory}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 dark:text-gray-400">Kod</Label>
                      <p className="font-medium">{showPreview.parsed.header.spaceCategoryCode}</p>
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
                      {showPreview.validation.warnings.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-amber-600 dark:text-amber-400 font-medium">
                            Varningar:
                          </Label>
                          <ul className="list-disc list-inside text-sm text-amber-600 dark:text-amber-400">
                            {showPreview.validation.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {showPreview.validation.valid &&
                        showPreview.validation.warnings.length === 0 && (
                          <p className="text-green-600 dark:text-green-400">
                            Inga problem hittades
                          </p>
                        )}
                    </CardContent>
                  </Card>
                )}

                {/* Shelves Preview */}
                {showPreview.parsed?.shelves.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Hyllayout ({showPreview.parsed.shelves.length} hyllor)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                        {showPreview.parsed.shelves.map((shelf) => (
                          <div key={shelf.shelfNumber} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">Hylla {shelf.shelfNumber}</span>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Notch: {shelf.notch}</span>
                                <span>
                                  {shelf.widthInch}" x {shelf.heightInch}"
                                </span>
                                <span>Golv: {shelf.heightFromFloorInch}"</span>
                                <span>Lutning: {shelf.tiltDegrees}°</span>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left text-gray-500">
                                    <th className="pb-1 pr-3">POS</th>
                                    <th className="pb-1 pr-3">EAN</th>
                                    <th className="pb-1 pr-3">BNR</th>
                                    <th className="pb-1 pr-3">Artikel</th>
                                    <th className="pb-1 pr-3">Varumärke</th>
                                    <th className="pb-1 pr-3">Storlek</th>
                                    <th className="pb-1 pr-3">B-pack</th>
                                    <th className="pb-1 pr-3">Ans</th>
                                    <th className="pb-1 pr-3">Tot</th>
                                    <th className="pb-1 pr-3">Kp</th>
                                    <th className="pb-1">Åtgärd</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {shelf.products.map((product) => (
                                    <tr
                                      key={product.position}
                                      className={cn(
                                        "border-b",
                                        product.action === "Tillagd" &&
                                          "bg-green-50 dark:bg-green-900/20",
                                        product.action === "Borttagen" &&
                                          "bg-red-50 dark:bg-red-900/20 line-through",
                                      )}
                                    >
                                      <td className="py-1 pr-3 font-mono">{product.position}</td>
                                      <td className="py-1 pr-3 font-mono">{product.ean}</td>
                                      <td className="py-1 pr-3 font-mono">{product.bnr}</td>
                                      <td className="py-1 pr-3 truncate max-w-[200px]">
                                        {product.articleName}
                                      </td>
                                      <td className="py-1 pr-3">{product.brand}</td>
                                      <td className="py-1 pr-3 font-mono">{product.size}</td>
                                      <td className="py-1 pr-3 text-center">{product.bPack}</td>
                                      <td className="py-1 pr-3 text-center">{product.facings}</td>
                                      <td className="py-1 pr-3 text-center">{product.total}</td>
                                      <td className="py-1 pr-3 text-center">{product.kp}</td>
                                      <td className="py-1">
                                        {product.action && (
                                          <Badge
                                            variant={
                                              product.action === "Tillagd"
                                                ? "default"
                                                : "destructive"
                                            }
                                            className="text-xs"
                                          >
                                            {product.action}
                                          </Badge>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                          <Label className="text-gray-500 dark:text-gray-400">
                            Produkter att importera
                          </Label>
                          <p className="font-medium">
                            {showPreview.storeFlowData.expected_products.length}
                          </p>
                        </div>
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Version</Label>
                          <p className="font-medium">{showPreview.storeFlowData.version}</p>
                        </div>
                        <div>
                          <Label className="text-gray-500 dark:text-gray-400">Aktiv</Label>
                          <p className="font-medium">
                            {showPreview.storeFlowData.is_active ? "Ja" : "Nej"}
                          </p>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <Label className="text-gray-500 dark:text-gray-400 text-sm">
                          Produkter (första 10):
                        </Label>
                        <div className="overflow-x-auto mt-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-left text-gray-500">
                                <th className="pb-1 pr-3">Produkt ID</th>
                                <th className="pb-1 pr-3">EAN</th>
                                <th className="pb-1 pr-3">Namn</th>
                                <th className="pb-1 pr-3">Hylla</th>
                                <th className="pb-1 pr-3">POS</th>
                                <th className="pb-1 pr-3">Ans</th>
                                <th className="pb-1 pr-3">Tot</th>
                              </tr>
                            </thead>
                            <tbody>
                              {showPreview.storeFlowData.expected_products
                                .slice(0, 10)
                                .map((p, i) => (
                                  <tr key={i} className="border-b">
                                    <td className="py-1 pr-3 font-mono">{p.product_id}</td>
                                    <td className="py-1 pr-3 font-mono">{p.ean}</td>
                                    <td className="py-1 pr-3 truncate max-w-[150px]">{p.name}</td>
                                    <td className="py-1 pr-3 text-center">
                                      {p.position.shelf_number}
                                    </td>
                                    <td className="py-1 pr-3 text-center">
                                      {p.position.shelf_position}
                                    </td>
                                    <td className="py-1 pr-3 text-center">{p.facings}</td>
                                    <td className="py-1 pr-3 text-center">{p.total_quantity}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {showPreview.storeFlowData.expected_products.length > 10 && (
                          <p className="text-sm text-gray-500 mt-2">
                            ...och {showPreview.storeFlowData.expected_products.length - 10} fler
                            produkter
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            {showPreview?.status === "parsed" && showPreview.storeFlowData && (
              <Button onClick={() => importPlanogram(showPreview!)}>Importera planogram</Button>
            )}
            <Button variant="outline" onClick={() => setShowPreview(null)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
