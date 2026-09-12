import { useState, useRef } from "react";
import {
  FileUp,
  UserCheck,
  UserX,
  CircleAlert as AlertCircle,
  CircleCheck as CheckCircle2,
  Loader as Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type Store } from "@/lib/supabase";
import { usernameFromName, generatePassword } from "@/lib/text-utils";

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

type Forening = { id: string; name: string };
type Distrikt = { id: string; namn: string; forening_id: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  stores: Store[];
  existingUsernames: string[];
  onImported: () => void;
};

export function XmlImportModal({
  open,
  onOpenChange,
  storeId,
  stores,
  existingUsernames,
  onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedEmployee[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(
    null,
  );

  // Hierarchy assignment
  const [foreningar, setForeningar] = useState<Forening[]>([]);
  const [distriktList, setDistriktList] = useState<Distrikt[]>([]);
  const [selectedForeningId, setSelectedForeningId] = useState("");
  const [selectedDistriktId, setSelectedDistriktId] = useState("");

  // Load foreningar and distrikt when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o && foreningar.length === 0) {
      supabase
        .from("foreningar")
        .select("id, name")
        .order("name")
        .then(({ data }) => setForeningar((data ?? []) as Forening[]));
      supabase
        .from("distrikt")
        .select("id, namn, forening_id")
        .order("namn")
        .then(({ data }) => setDistriktList((data ?? []) as Distrikt[]));
    }
    if (!o) reset();
    onOpenChange(o);
  };

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
        let xmlText = ev.target?.result as string;
        if (xmlText.includes("\uFFFD")) {
          try {
            const buf = await file.arrayBuffer();
            xmlText = new TextDecoder("windows-1252").decode(buf);
          } catch {
            /* keep utf-8 result */
          }
        }
        const doc = new DOMParser().parseFromString(xmlText, "text/xml");
        const parseErr = doc.querySelector("parsererror");
        if (parseErr) {
          setParseError("Ogiltig XML-fil. Kontrollera filformatet.");
          return;
        }

        const recordTags = ["Employee", "Anstallda", "Person", "Staff", "Worker"];
        let records: Element[] = [];
        for (const tag of recordTags) {
          const found = Array.from(doc.querySelectorAll(tag));
          if (found.length > 0) {
            records = found;
            break;
          }
        }

        if (records.length === 0) {
          setParseError(
            "Hittade inga personposter i XML-filen. Kontrollera att taggnamnen matchar (Employee, Person, Anstallda).",
          );
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
            if (seen.has(username))
              username = `${username}.${employeeNumber || Math.floor(Math.random() * 999)}`;
            seen.add(username);
            const exists = existingUsernames.includes(username);
            return {
              name,
              employeeNumber,
              department,
              email,
              username,
              password: generatePassword(16),
              exists,
            };
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
    if (toCreate.length === 0 && toSkip.length === 0) return;
    setImporting(true);
    let created = 0;

    async function ensureAllGroup(): Promise<string | null> {
      if (!storeId) return null;
      let { data: g } = await supabase
        .from("user_groups")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", "Alla medarbetare")
        .maybeSingle();
      if (!g) {
        const { data: c } = await supabase
          .from("user_groups")
          .insert({ name: "Alla medarbetare", store_id: storeId })
          .select("id")
          .maybeSingle();
        g = c;
      }
      return g?.id ?? null;
    }

    const allGroupId = storeId ? await ensureAllGroup() : null;

    async function linkHierarchy(userId: string) {
      // Link to forening if selected
      if (selectedForeningId) {
        await supabase
          .from("user_foreningar")
          .upsert(
            { user_id: userId, forening_id: selectedForeningId, is_primary: true },
            { onConflict: "user_id,forening_id" },
          );
        // Also set forening_id on app_users as primary
        await supabase
          .from("app_users")
          .update({ forening_id: selectedForeningId })
          .eq("id", userId);
      }
      // Link to distrikt if selected
      if (selectedDistriktId) {
        await supabase
          .from("user_distrikt")
          .upsert(
            { user_id: userId, distrikt_id: selectedDistriktId, is_primary: true },
            { onConflict: "user_id,distrikt_id" },
          );
        await supabase
          .from("app_users")
          .update({ distrikt_id: selectedDistriktId })
          .eq("id", userId);
      }
    }

    async function linkToStore(userId: string) {
      if (!storeId) return;
      const { data: existing } = await supabase
        .from("user_stores")
        .select("id")
        .eq("user_id", userId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (!existing) {
        await supabase
          .from("user_stores")
          .insert({ user_id: userId, store_id: storeId, is_primary: false });
      }
      if (allGroupId) {
        const { data: member } = await supabase
          .from("user_group_members")
          .select("id")
          .eq("group_id", allGroupId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!member) {
          await supabase
            .from("user_group_members")
            .insert({ group_id: allGroupId, user_id: userId });
        }
      }
      await linkHierarchy(userId);
    }

    for (const emp of toCreate) {
      try {
        const { data: hash } = await supabase.rpc("hash_password", {
          plain_password: emp.password,
        });
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
            forening_id: selectedForeningId || null,
            distrikt_id: selectedDistriktId || null,
          })
          .select("id")
          .maybeSingle();

        if (newUser?.id && storeId) {
          await supabase
            .from("user_stores")
            .insert({ user_id: newUser.id, store_id: storeId, is_primary: true });
          if (allGroupId) {
            await supabase
              .from("user_group_members")
              .insert({ group_id: allGroupId, user_id: newUser.id });
          }
          await linkHierarchy(newUser.id);
        }
        created++;
      } catch {
        /* continue */
      }
    }

    for (const emp of toSkip) {
      try {
        const { data: existingUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("username", emp.username)
          .maybeSingle();
        if (existingUser?.id) await linkToStore(existingUser.id);
      } catch {
        /* continue */
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
  const filteredDistrikt = selectedForeningId
    ? distriktList.filter((d) => d.forening_id === selectedForeningId)
    : distriktList;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] w-full sm:max-w-3xl overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            Importera personal från SoftOne GO
          </DialogTitle>
          {storeName && <p className="text-sm text-coop-gray-900">Butik: {storeName}</p>}
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(92dvh - 130px)" }}>
          {importResult ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-success/10 p-5 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
                <p className="text-lg font-semibold">{importResult.created} konton skapades</p>
                {importResult.skipped > 0 && (
                  <p className="mt-1 text-sm text-coop-gray-900">
                    {importResult.skipped} befintliga användare kopplades till butiken
                  </p>
                )}
                {selectedForeningId && (
                  <p className="mt-1 text-sm text-coop-gray-900">
                    Kopplades till förening:{" "}
                    {foreningar.find((f) => f.id === selectedForeningId)?.name}
                  </p>
                )}
                {selectedDistriktId && (
                  <p className="mt-1 text-sm text-coop-gray-900">
                    Kopplades till distrikt:{" "}
                    {distriktList.find((d) => d.id === selectedDistriktId)?.namn}
                  </p>
                )}
              </div>
              <p className="text-sm text-coop-gray-900 text-center">
                Alla nya konton har ett slumpmässigt 16-teckens lösenord och kräver lösenordsbyte
                vid första inlogg.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* File picker */}
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30 px-6 py-10 transition hover:border-primary/40 hover:bg-muted/50"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="mb-3 h-8 w-8 text-coop-gray-900/60" />
                <p className="font-medium">{fileName || "Välj SoftOne GO XML-fil"}</p>
                <p className="mt-1 text-sm text-coop-gray-900">Klicka för att bläddra</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xml,text/xml"
                  aria-label="Välj SoftOne GO XML-fil"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Hierarchy assignment */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Koppla till hierarki (valfritt)</p>
                <p className="text-xs text-coop-gray-900">
                  Alla importerade användare kopplas till valda förening och/eller distrikt. De kan
                  tillhöra flera i efterhand via personalhanteringen.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="xml-forening">Förening</Label>
                    <Select
                      value={selectedForeningId || "__none"}
                      onValueChange={(v) => {
                        setSelectedForeningId(v === "__none" ? "" : v);
                        setSelectedDistriktId("");
                      }}
                    >
                      <SelectTrigger
                        id="xml-forening"
                        aria-label="Förening"
                        className="h-8 text-xs"
                      >
                        <SelectValue placeholder="Ingen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Ingen koppling</SelectItem>
                        {foreningar.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="xml-distrikt">Distrikt</Label>
                    <Select
                      value={selectedDistriktId || "__none"}
                      onValueChange={(v) => setSelectedDistriktId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger
                        id="xml-distrikt"
                        aria-label="Distrikt"
                        className="h-8 text-xs"
                      >
                        <SelectValue placeholder="Ingen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Ingen koppling</SelectItem>
                        {filteredDistrikt.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.namn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {parseError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {parseError}
                </div>
              )}

              {parsed.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full bg-success/15 text-success border-success/30">
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                      {toCreate.length} skapas
                    </Badge>
                    {toSkip.length > 0 && (
                      <Badge variant="outline" className="rounded-full text-coop-gray-900">
                        <UserX className="mr-1.5 h-3.5 w-3.5" />
                        {toSkip.length} hoppas över (finns redan)
                      </Badge>
                    )}
                  </div>

                  {toCreate.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-coop-gray-900">
                        Dessa konton skapas:
                      </p>
                      <div className="overflow-hidden rounded-xl border border-border/60">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/40">
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-coop-gray-900">
                                Namn
                              </th>
                              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-coop-gray-900 sm:table-cell">
                                Användarnamn
                              </th>
                              <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-coop-gray-900 md:table-cell">
                                Avdelning
                              </th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-coop-gray-900">
                                Anst.nr
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {toCreate.map((emp, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-4 py-2.5 font-medium">{emp.name}</td>
                                <td className="hidden px-4 py-2.5 font-mono text-xs text-coop-gray-900 sm:table-cell">
                                  {emp.username}
                                </td>
                                <td className="hidden px-4 py-2.5 text-coop-gray-900 md:table-cell">
                                  {emp.department || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-coop-gray-900">
                                  {emp.employeeNumber || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {toSkip.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-coop-gray-900">
                        Dessa finns redan och kopplas till butiken:
                      </p>
                      <div className="overflow-hidden rounded-xl border border-border/40 opacity-60">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-border/40">
                            {toSkip.map((emp, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 text-coop-gray-900">{emp.name}</td>
                                <td className="hidden px-4 py-2 font-mono text-xs text-coop-gray-900 sm:table-cell">
                                  {emp.username}
                                </td>
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
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {importResult ? "Stäng" : "Avbryt"}
          </Button>
          {!importResult && toCreate.length > 0 && (
            <Button onClick={runImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Importerar
                  <span className="sr-only" aria-busy="true">
                    Laddar…
                  </span>
                </>
              ) : (
                `Skapa ${toCreate.length} konton`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
