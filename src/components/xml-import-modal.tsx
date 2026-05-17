import { useState, useRef } from "react";
import { FileUp, UserCheck, UserX, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Loader as Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase, type Store } from "@/lib/supabase";
import { usernameFromName, generatePassword } from "@/lib/text-utils";

// SoftOne GO XML field mapping — adjust tag names here if the schema changes
const FIELD_MAP = {
  name: ["Name", "FullName", "Fullnamn", "EmployeeName"],
  employeeNumber: ["EmployeeNumber", "EmployeeNo", "AnstNr", "Anstallningsnummer"],
  department: ["Department", "Avdelning", "DeptName"],
  email: ["Email", "EmailAddress", "Epost"],
};

function getXmlField(el: Element, candidates: string[]): string {
  for (const tag of candidates) {
    const found = el.querySelector(tag);
    if (found?.textContent?.trim()) return found.textContent.trim();
  }
  return "";
}

type ParsedEmployee = {
  name: string;
  employeeNumber: string;
  department: string;
  email: string;
  username: string;
  password: string;
  exists: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  stores: Store[];
  existingUsernames: string[];
  onImported: () => void;
};

export function XmlImportModal({ open, onOpenChange, storeId, stores, existingUsernames, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedEmployee[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

  const toCreate = parsed.filter((e) => !e.exists);
  const toSkip = parsed.filter((e) => e.exists);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setParsed([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Try UTF-8; if replacement chars appear (mangled åäö), re-read as Windows-1252
        let xmlText = ev.target?.result as string;
        if (xmlText.includes("\uFFFD")) {
          try {
            const buf = await file.arrayBuffer();
            xmlText = new TextDecoder("windows-1252").decode(buf);
          } catch { /* keep utf-8 result */ }
        }
        const doc = new DOMParser().parseFromString(xmlText, "text/xml");

        const parseErr = doc.querySelector("parsererror");
        if (parseErr) { setParseError("Ogiltig XML-fil. Kontrollera filformatet."); return; }

        // Detect employee records — try common container tags
        const recordTags = ["Employee", "Anstallda", "Person", "Staff", "Worker"];
        let records: Element[] = [];
        for (const tag of recordTags) {
          const found = Array.from(doc.querySelectorAll(tag));
          if (found.length > 0) { records = found; break; }
        }

        if (records.length === 0) {
          setParseError("Hittade inga personposter i XML-filen. Kontrollera att taggnamnen matchar (Employee, Person, Anstallda).");
          return;
        }

        const seen = new Set<string>();
        const result: ParsedEmployee[] = records
          .map((el) => {
            const name = getXmlField(el, FIELD_MAP.name);
            if (!name) return null;
            const employeeNumber = getXmlField(el, FIELD_MAP.employeeNumber);
            const department = getXmlField(el, FIELD_MAP.department);
            const email = getXmlField(el, FIELD_MAP.email);
            let username = usernameFromName(name);
            // deduplicate within batch
            if (seen.has(username)) username = `${username}.${employeeNumber || Math.floor(Math.random() * 999)}`;
            seen.add(username);
            const exists = existingUsernames.includes(username);
            return { name, employeeNumber, department, email, username, password: generatePassword(16), exists };
          })
          .filter((e): e is ParsedEmployee => e !== null);

        setParsed(result);
      } catch {
        setParseError("Kunde inte läsa filen.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function runImport() {
    if (toCreate.length === 0) return;
    setImporting(true);
    let created = 0;

    for (const emp of toCreate) {
      try {
        const { data: hash } = await supabase.rpc("hash_password", { plain_password: emp.password });
        const { data: newUser } = await supabase
          .from("app_users")
          .insert({
            username: emp.username,
            display_name: emp.name,
            password_hash: hash,
            role: "employee",
            employee_group: emp.department || "Alla medarbetare",
            store_id: storeId || null,
            must_change_password: true,
          })
          .select("id")
          .maybeSingle();

        if (newUser?.id && storeId) {
          await supabase.from("user_stores").insert({ user_id: newUser.id, store_id: storeId, is_primary: true });

          // Ensure "Alla medarbetare" group exists for this store and add the user
          let { data: allGroup } = await supabase
            .from("user_groups")
            .select("id")
            .eq("store_id", storeId)
            .eq("name", "Alla medarbetare")
            .maybeSingle();

          if (!allGroup) {
            const { data: created } = await supabase
              .from("user_groups")
              .insert({ name: "Alla medarbetare", store_id: storeId })
              .select("id")
              .maybeSingle();
            allGroup = created;
          }

          if (allGroup?.id) {
            await supabase.from("user_group_members").insert({ group_id: allGroup.id, user_id: newUser.id });
          }
        }
        created++;
      } catch {
        // continue on individual failures
      }
    }

    setImportResult({ created, skipped: toSkip.length });
    setImporting(false);
    onImported();
  }

  function reset() {
    setParsed([]);
    setFileName("");
    setParseError("");
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[92dvh] w-full sm:max-w-3xl overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            Importera personal från SoftOne GO
          </DialogTitle>
          {storeName && <p className="text-sm text-muted-foreground">Butik: {storeName}</p>}
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(92dvh - 130px)" }}>
          {importResult ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-success/10 p-5 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
                <p className="text-lg font-semibold">{importResult.created} konton skapades</p>
                {importResult.skipped > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">{importResult.skipped} hoppades över (redan registrerade)</p>
                )}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Alla nya konton har ett slumpmässigt 16-teckens lösenord och kräver lösenordsbyte vid första inlogg.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* File picker */}
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30 px-6 py-10 transition hover:border-primary/40 hover:bg-muted/50"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="mb-3 h-8 w-8 text-muted-foreground/60" />
                <p className="font-medium">{fileName || "Välj SoftOne GO XML-fil"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Klicka för att bläddra</p>
                <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={handleFileChange} />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {parseError}
                </div>
              )}

              {parsed.length > 0 && (
                <div className="space-y-4">
                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full bg-success/15 text-success border-success/30">
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                      {toCreate.length} skapas
                    </Badge>
                    {toSkip.length > 0 && (
                      <Badge variant="outline" className="rounded-full text-muted-foreground">
                        <UserX className="mr-1.5 h-3.5 w-3.5" />
                        {toSkip.length} hoppas över (finns redan)
                      </Badge>
                    )}
                  </div>

                  {/* New users table */}
                  {toCreate.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-foreground">Dessa konton skapas:</p>
                      <div className="overflow-hidden rounded-xl border border-border/60">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/40">
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Namn</th>
                              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">Användarnamn</th>
                              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground md:table-cell">Avdelning</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Anst.nr</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {toCreate.map((emp, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-4 py-2.5 font-medium">{emp.name}</td>
                                <td className="hidden px-4 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">{emp.username}</td>
                                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{emp.department || "—"}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{emp.employeeNumber || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Skipped users */}
                  {toSkip.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">Dessa finns redan och hoppas över:</p>
                      <div className="overflow-hidden rounded-xl border border-border/40 opacity-60">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-border/40">
                            {toSkip.map((emp, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 line-through text-muted-foreground">{emp.name}</td>
                                <td className="hidden px-4 py-2 font-mono text-xs text-muted-foreground sm:table-cell">{emp.username}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            {importResult ? "Stäng" : "Avbryt"}
          </Button>
          {!importResult && toCreate.length > 0 && (
            <Button onClick={runImport} disabled={importing}>
              {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importerar...</> : `Skapa ${toCreate.length} konton`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
