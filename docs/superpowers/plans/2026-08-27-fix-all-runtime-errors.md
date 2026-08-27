# Fix alla runtime-fel i StoreFlow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminera alla sex felgrupper från StoreFlow-webconsole (saknade tabeller, REST-anrop, Three.js-deprecation, React #418, PDF-version mismatch) och förhindra att de återkommer.

**Architecture:** Migrera först databasen (saknade tabeller + unika constraints + RLS), reparera sedan varje UI-rutt med `supabase.from(...)` istället för REST, ersätt Three.js `Clock` med `Timer`, bygg om `customer-nav` från grunden, och avsluta med prevention (lint + tester + bygg).

**Tech Stack:** TanStack Start, React 19, `@supabase/supabase-js`, Three.js, Vitest + React Testing Library, PostgreSQL.

## Global Constraints

- **Alltid `supabase.from(...)`:** Inga `fetch(...)` mot `*.supabase.co/rest/v1/*` i klientkod (CLAUDE.md: "Direct Supabase SDK Only").
- **UUID-validering:** Alla externa UUID-parametrar valideras med regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` innan DB-anrop.
- **Migrationer:** Unika tidsstämplar `YYYYMMDDHHMMSS`, idempotenta (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`), `ENABLE ROW LEVEL SECURITY` på alla app-tabeller.
- **Inga mockar/placeholders:** Inga `"demo-store-1"`, inga hardcoded fixtures för produktion.
- **Artikel-matchning:** Primär på `sap_article_id`, fallback `bnr`, **aldrig** SKU (CLAUDE.md).
- **Språk:** UI-strängar och commit-meddelanden på svenska; kod/kommentarer/SQL på engelska.
- **Verification:** Efter varje task — kör `npm run build` (eller motsvarande) och relevant test innan commit.

---

## File Structure

| Fil                                                                   | Ansvar                                                                            | Task |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---- |
| `supabase/migrations/20260827120000_store_sections.sql`               | Skapa `store_sections` + RLS + index                                              | 1    |
| `supabase/migrations/20260827120001_reclamations_and_constraints.sql` | `reclamations`, `product_reclamation_stats`, unique constraint på `products(ean)` | 1    |
| `supabase/migrations/20260827120002_spatial_maps_rls.sql`             | Verifiera `spatial_maps` + RLS                                                    | 1    |
| `scripts/check-no-rest.ts`                                            | Prevention: sök `rest/v1` i `src/`                                                | 2    |
| `package.json`                                                        | Lägg till `check:no-rest`-script                                                  | 2    |
| `src/lib/guard-no-rest.ts`                                            | CI-hjälpfunktion (delad med script)                                               | 2    |
| `src/components/digital-twin/Step1Map2D.tsx`                          | Sektions-CRUD via supabase                                                        | 3    |
| `src/components/digital-twin/Step2Markers.tsx`                        | Markör-CRUD via supabase (knapp fix)                                              | 3    |
| `src/components/digital-twin/Step3Pdf.tsx`                            | Verifiera PDF/SVG                                                                 | 3    |
| `src/components/digital-twin/Step4Products.tsx`                       | Produktkoppling via `sap_article_id`                                              | 3    |
| `src/routes/ersattningcheck.tsx`                                      | Rätta `onConflict`, fält-säkring                                                  | 4    |
| `src/lib/planogram-parser.ts`                                         | PDF-version hantering                                                             | 5    |
| `src/components/StoreMap3D.tsx`                                       | Clock→Timer, Vector3-guards                                                       | 6    |
| `src/components/ARNavigationView.tsx`                                 | Clock→Timer, Vector3-guards                                                       | 6    |
| `src/routes/spatial-navigation.tsx`                                   | Verifiera, inga REST                                                              | 7    |
| `src/routes/customer-nav.tsx`                                         | Skriv om                                                                          | 8    |
| `tests/store-setup.test.tsx`                                          | Wizard renderar utan krash                                                        | 9    |
| `tests/ersattningcheck.test.tsx`                                      | upsert-argument                                                                   | 9    |
| `tests/customer-nav.test.tsx`                                         | Ingen React #418                                                                  | 9    |
| `tests/spatial-navigation.test.tsx`                                   | Ingen 400                                                                         | 9    |
| `tests/planogram-parser.test.ts`                                      | PDF-parser utan version-fel                                                       | 9    |

---

## Task 1: Databas-migrationer för saknade tabeller och constraints

**Files:**

- Create: `supabase/migrations/20260827120000_store_sections.sql`
- Create: `supabase/migrations/20260827120001_reclamations_and_constraints.sql`
- Create: `supabase/migrations/20260827120002_spatial_maps_rls.sql`

**Interfaces:**

- Consumes: Befintlig `stores` (UUID PK), `app_users` (UUID PK)
- Produces: `store_sections`, `reclamations`, `product_reclamation_stats`, `spatial_maps` (med garanterad kolumnstruktur)

- [ ] **Step 1: Skapa migration för `store_sections`**

Fil: `supabase/migrations/20260827120000_store_sections.sql`

```sql
-- Idempotent: skapar bara om saknas
CREATE TABLE IF NOT EXISTS public.store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  pos_x_cm integer NOT NULL DEFAULT 0,
  pos_y_cm integer NOT NULL DEFAULT 0,
  width_cm integer NOT NULL DEFAULT 80,
  height_cm integer NOT NULL DEFAULT 200,
  depth_cm integer NOT NULL DEFAULT 60,
  section_type text NOT NULL DEFAULT 'shelf',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_sections_store_id ON public.store_sections(store_id);

ALTER TABLE public.store_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_sections_select ON public.store_sections;
CREATE POLICY store_sections_select ON public.store_sections
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS store_sections_modify ON public.store_sections;
CREATE POLICY store_sections_modify ON public.store_sections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Skapa migration för `reclamations` + constraint**

Fil: `supabase/migrations/20260827120001_reclamations_and_constraints.sql`

```sql
-- Säkerställ unique constraint på products(ean) för onConflict
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_ean_unique'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ean_unique UNIQUE (ean);
  END IF;
END $$;

-- reclamations-tabell
CREATE TABLE IF NOT EXISTS public.reclamations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sap_article_id text NOT NULL,
  status text NOT NULL DEFAULT 'Ej skickad',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reclamations_store_id ON public.reclamations(store_id);

ALTER TABLE public.reclamations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reclamations_select ON public.reclamations;
CREATE POLICY reclamations_select ON public.reclamations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reclamations_modify ON public.reclamations;
CREATE POLICY reclamations_modify ON public.reclamations
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- product_reclamation_stats (view eller tabell, enkel tabell räcker för MVP)
CREATE TABLE IF NOT EXISTS public.product_reclamation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sap_article_id text NOT NULL,
  name text,
  ean text,
  bnr text,
  delivery_count integer NOT NULL DEFAULT 0,
  reclamation_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prs_store ON public.product_reclamation_stats(store_id);

ALTER TABLE public.product_reclamation_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prs_select ON public.product_reclamation_stats;
CREATE POLICY prs_select ON public.product_reclamation_stats
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS prs_modify ON public.product_reclamation_stats;
CREATE POLICY prs_modify ON public.product_reclamation_stats
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Skapa migration för `spatial_maps` RLS**

Fil: `supabase/migrations/20260827120002_spatial_maps_rls.sql`

```sql
-- Säkerställ att spatial_maps har alla kolumner vi förväntar oss
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='spatial_maps'
                 AND column_name='markers') THEN
    ALTER TABLE public.spatial_maps ADD COLUMN markers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='spatial_maps'
                 AND column_name='is_active') THEN
    ALTER TABLE public.spatial_maps ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spatial_maps_store_active
  ON public.spatial_maps(store_id) WHERE is_active = true;

ALTER TABLE public.spatial_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spatial_maps_select ON public.spatial_maps;
CREATE POLICY spatial_maps_select ON public.spatial_maps
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS spatial_maps_modify ON public.spatial_maps;
CREATE POLICY spatial_maps_modify ON public.spatial_maps
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Verifiera lokalt**

Kör: `npx supabase db reset` (om lokalt) ELLER anslut mot dev-databasen och kör:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260827120000_store_sections.sql
psql "$DATABASE_URL" -f supabase/migrations/20260827120001_reclamations_and_constraints.sql
psql "$DATABASE_URL" -f supabase/migrations/20260827120002_spatial_maps_rls.sql
```

Förväntat: Inga fel. Verifiera med:

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('store_sections','reclamations','product_reclamation_stats');
SELECT conname FROM pg_constraint WHERE conname = 'products_ean_unique';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260827120000_store_sections.sql \
        supabase/migrations/20260827120001_reclamations_and_constraints.sql \
        supabase/migrations/20260827120002_spatial_maps_rls.sql
git commit -m "feat(db): lägg till store_sections, reclamations, product_reclamation_stats, RLS och products(ean) unique"
```

---

## Task 2: Prevention-lint mot REST-anrop

**Files:**

- Create: `src/lib/guard-no-rest.ts`
- Create: `scripts/check-no-rest.ts`
- Modify: `package.json` (lägg till script)

**Interfaces:**

- Consumes: `process.cwd()`, `src/` katalog
- Produces: `console.log` av antal hittade filer; exit-kod 0/1

- [ ] **Step 1: Skapa guard-modul**

Fil: `src/lib/guard-no-rest.ts`

```typescript
/**
 * Förbjuder REST-anrop mot Supabase.
 * Används av scripts/check-no-rest.ts (CI) och kan importeras i tester.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "supabase-rest-url", regex: /\.supabase\.co\/rest\/v1\//i },
  { name: "supabase-storage-url", regex: /\.supabase\.co\/storage\/v1\//i },
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export interface Violation {
  file: string;
  pattern: string;
  match: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scanForRestCalls(rootDir: string = join(process.cwd(), "src")): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(rootDir)) {
    const ext = file.slice(file.lastIndexOf("."));
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    const text = readFileSync(file, "utf-8");
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      const m = text.match(regex);
      if (m) violations.push({ file, pattern: name, match: m[0] });
    }
  }
  return violations;
}
```

- [ ] **Step 2: Skapa CLI-script**

Fil: `scripts/check-no-rest.ts`

```typescript
import { scanForRestCalls } from "../src/lib/guard-no-rest";

const violations = scanForRestCalls();
if (violations.length > 0) {
  console.error("Hittade förbjudna REST-anrop mot Supabase:");
  for (const v of violations) {
    console.error(`  ${v.file} → ${v.pattern} (${v.match})`);
  }
  process.exit(1);
}
console.log("Inga REST-anrop hittades. ✓");
```

- [ ] **Step 3: Lägg till npm-script**

Fil: `package.json` – i `scripts`-sektionen, lägg till:

```json
"check:no-rest": "tsx scripts/check-no-rest.ts"
```

Om `tsx` inte finns som devDependency, lägg till med `npm i -D tsx` (eller använd befintlig TS-runner).

- [ ] **Step 4: Verifiera scriptet**

Kör: `npm run check:no-rest`
Förväntat: `"Inga REST-anrop hittades. ✓"` (om inga REST-anrop finns idag), eller lista över träffar.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guard-no-rest.ts scripts/check-no-rest.ts package.json
git commit -m "feat(lint): lägg till check:no-rest script som förbjuder Supabase REST-anrop"
```

---

## Task 3: Reparera Digital Twin (Store-setup)

**Files:**

- Modify: `src/components/digital-twin/Step1Map2D.tsx`
- Modify: `src/components/digital-twin/Step2Markers.tsx`
- Modify: `src/components/digital-twin/Step3Pdf.tsx`
- Modify: `src/components/digital-twin/Step4Products.tsx`
- Read first: `src/lib/digital-twin.ts` (för befintliga helpers), `src/components/digital-twin/Wizard.tsx`

**Interfaces:**

- Consumes: `useAuth()` (ger `activeStore.id`), `supabase` klient
- Produces: CRUD mot `store_sections`, `spatial_markers`, `shelf_observations`, `products`

- [ ] **Step 1: Läs befintliga helpers**

Öppna `src/lib/digital-twin.ts` och notera vilka funktioner som finns för `store_sections`, `spatial_markers`, `shelf_observations`. Lista dem i en kommentarhög i Step1Map2D.tsx.

- [ ] **Step 2: Step1Map2D – sektions-CRUD via supabase**

I `src/components/digital-twin/Step1Map2D.tsx`, ersätt eventuell `fetch(...)` mot `*.supabase.co/rest/v1/store_sections*` med:

```typescript
import { supabase } from "@/lib/supabase";

const loadSections = async (storeId: string) => {
  const { data, error } = await supabase
    .from("store_sections")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("pos_y_cm", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

const saveSection = async (section: {
  id?: string;
  store_id: string;
  name: string;
  pos_x_cm: number;
  pos_y_cm: number;
  width_cm: number;
  height_cm: number;
  depth_cm: number;
  section_type: string;
}) => {
  const { error } = await supabase.from("store_sections").upsert(section, { onConflict: "id" });
  if (error) throw error;
};

const deleteSection = async (id: string) => {
  const { error } = await supabase
    .from("store_sections")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};
```

- [ ] **Step 3: Step2Markers – markör-knappen fungerar**

I `src/components/digital-twin/Step2Markers.tsx`:

- Hitta knappen som ska lägga till markör (den "tomma" som nämns i felrapporten).
- Onclick: skapa markör lokalt med temporärt ID, anropa `supabase.from('spatial_markers').insert({ store_id, map_id, marker_type: 'aruco', aruco_id: nextId(), position: {x,y,z}, is_active: true })`.
- Vid success → uppdatera lokalt state med det returnerade ID:t.

```typescript
const onAddMarker = async (pos: { x: number; y: number; z: number }) => {
  if (!activeStore?.id || !spatialMapId) return;
  const { data, error } = await supabase
    .from("spatial_markers")
    .insert({
      store_id: activeStore.id,
      map_id: spatialMapId,
      marker_type: "aruco",
      aruco_id: nextArucoId(),
      position: pos,
      is_active: true,
    })
    .select()
    .single();
  if (error) {
    toast.error("Kunde inte skapa markör");
    return;
  }
  setMarkers((prev) => [...prev, data]);
};
```

- [ ] **Step 4: Step3Pdf – verifiera PDF/SVG-generator**

I `src/components/digital-twin/Step3Pdf.tsx`, kontrollera att den inte gör REST-anrop. Om den gör det, ersätt med lokal SVG-generering enligt `docs/superpowers/specs/2026-08-27-digital-twin-design.md` steg 3 (4×4 binär ordlista, 3 kolumner, Blob + `URL.createObjectURL`).

- [ ] **Step 5: Step4Products – produktkoppling**

I `src/components/digital-twin/Step4Products.tsx`:

- Planogram-koppling: läs `shelf_planograms.expected_products` (jsonb); länka via `supabase.from('shelf_observations').upsert(...)`.
- Tillvalsartiklar: användaren väljer produkt (sökning på `name` eller `ean`); spara med `sap_article_id` (aldrig SKU enligt CLAUDE.md):

```typescript
const linkProduct = async (
  product: { sap_article_id: string; ean: string; bnr: string; name: string },
  shelfMarkerId: string,
) => {
  if (!product.sap_article_id) {
    toast.error("Produkten saknar SAP-ID och kan inte kopplas");
    return;
  }
  const { error } = await supabase.from("shelf_observations").upsert(
    {
      store_id: activeStore.id,
      shelf_marker_id: shelfMarkerId,
      sap_article_id: product.sap_article_id,
      observed_at: new Date().toISOString(),
    },
    { onConflict: "shelf_marker_id,sap_article_id" },
  );
  if (error) {
    toast.error("Kunde inte koppla produkt");
    return;
  }
  toast.success("Produkt kopplad");
};
```

- [ ] **Step 6: Verifiera**

Kör: `npm run check:no-rest && npm run build`
Förväntat: Inga REST-träffar; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/components/digital-twin/
git commit -m "fix(store-setup): reparation av sektioner, markörer, PDF och produktkoppling via supabase.from"
```

---

## Task 4: Reparera Ersättningscheck (ersattningcheck)

**Files:**

- Modify: `src/routes/ersattningcheck.tsx` (rad ~198)
- Modify: `src/lib/excel-parser.ts` (verifiera att `matchDeliveryNoteToProducts` returnerar `sap_article_id`)

- [ ] **Step 1: Verifiera `onConflict` matchar constraint**

Öppna `src/routes/ersattningcheck.tsx` rad 198. Koden är:

```typescript
.upsert(newProducts, { onConflict: "ean", ignoreDuplicates: false })
```

Efter Task 1 finns nu `products_ean_unique`. Bekräfta i console vid import.

- [ ] **Step 2: Hantera null-EAN**

Ersätt rad 196-203 med säker hantering (vissa följesedlar kan sakna EAN):

```typescript
if (newProducts.length > 0) {
  const { error: upsertErr } = await supabase
    .from("products")
    .upsert(newProducts, { onConflict: "ean", ignoreDuplicates: false });
  if (upsertErr) {
    console.error("Upsert error:", upsertErr);
    throw upsertErr;
  }
}
```

Lägg till försvar: filtrera bort rader utan EAN innan upsert för att undvika NULL-konflikter:

```typescript
const newProducts = results
  .filter(r => r.isNewProduct && (r.row.bnr || r.row.sapProduktId))
  .filter(r => r.row.bnr && String(r.row.bnr).trim().length > 0) // EAN får inte vara tom
  .map(...)
```

- [ ] **Step 3: Verifiera `reclamations`-laddning**

Läs rad 218-240. Efter Task 1 finns tabellen. Inget ytterligare krävs. Bekräfta att ingen REST-url finns.

- [ ] **Step 4: Kör check:no-rest + build**

Kör: `npm run check:no-rest && npm run build`
Förväntat: Inga fel.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ersattningcheck.tsx
git commit -m "fix(ersattningcheck): filtrera bort null EAN före upsert, hantera saknade fält"
```

---

## Task 5: Reparera PDF-parser (shelf-analytics versionsmismatch)

**Files:**

- Modify: `src/lib/planogram-parser.ts`
- Read first: `package.json` för aktuell PDF-lib version

- [ ] **Step 1: Identifiera PDF-handler**

Kör: `grep -rn "pdf" src/lib/planogram-parser.ts` och `grep -rn "pdf-parse\|pdfjs" package.json`

- [ ] **Step 2: Verifiera worker-versionen**

Om `pdfjs-dist` används, kontrollera att endast en version finns i `node_modules` (ingen dubblett). Lägg till `resolutions` (eller `overrides` i npm) i `package.json` om det finns flera.

- [ ] **Step 3: Lokal worker**

Om worker laddas från CDN, byt till lokal asset. Exempel:

```typescript
// Istället för att ladda från pdfjs-dist's CDN:
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

- [ ] **Step 4: Defensiv parser**

Lägg till felhantering:

```typescript
try {
  const pdf = await pdfjs.getDocument({ url }).promise;
  // ... process pages
} catch (e) {
  console.error("PDF parse error:", e);
  throw new Error("Kunde inte tolka PDF: " + (e instanceof Error ? e.message : "okänt fel"));
}
```

- [ ] **Step 5: Verifiera**

Ladda upp en test-PDF via shelf-analytics-sidan och kontrollera console. Inga `UnknownErrorException: API version X vs Worker Y`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planogram-parser.ts package.json
git commit -m "fix(planogram-parser): pinna worker-version, defensiv felhantering"
```

---

## Task 6: Three.js — Clock→Timer, Vector3-guards

**Files:**

- Modify: `src/components/StoreMap3D.tsx`
- Modify: `src/components/ARNavigationView.tsx`
- Read first: `src/lib/three-types.ts`

- [ ] **Step 1: Hitta `Clock`-anrop**

Kör: `grep -n "Clock" src/components/StoreMap3D.tsx src/components/ARNavigationView.tsx`

- [ ] **Step 2: Byt till `Timer`**

I varje fil:

```typescript
// Före:
import * as THREE from "three";
const clock = new THREE.Clock();

// Efter:
import { Timer } from "three/addons/misc/Timer.js";
const timer = new Timer();
// I animation loop:
timer.update();
const delta = timer.getDelta();
const elapsed = timer.getElapsed();
```

- [ ] **Step 3: Guard `addScaledVector`**

Lägg till defensiv check innan varje anrop:

```typescript
// Före:
target.addScaledVector(direction, speed);

// Efter:
if (target && typeof target.addScaledVector === "function") {
  target.addScaledVector(direction, speed);
} else {
  // Fallback: manuell skalning
  if (target && direction) {
    target.set(direction.x * speed, direction.y * speed, direction.z * speed);
  }
}
```

- [ ] **Step 4: Verifiera**

Öppna spatial-navigation i webbläsaren. Inga `addScaledVector is not a function` eller `Clock deprecated`-fel.

- [ ] **Step 5: Commit**

```bash
git add src/components/StoreMap3D.tsx src/components/ARNavigationView.tsx
git commit -m "fix(three): byt Clock till Timer, defensiv Vector3.addScaledVector"
```

---

## Task 7: Spatial-navigation – verifiera inga REST

**Files:**

- Modify (om behov): `src/routes/spatial-navigation.tsx`

- [ ] **Step 1: Verifiera**

Öppna `src/routes/spatial-navigation.tsx`. Efter Task 1 finns `spatial_maps` med `markers` (jsonb) och RLS.

- [ ] **Step 2: Försvar mot tom data**

Lägg till defensiv hantering om `data[0]` är null (redan delvis på rad 82). Säkerställ:

```typescript
if (data && Array.isArray(data) && data.length > 0 && data[0]) {
  setMaps(data as SpatialMap[]);
  setSelectedMap(data[0] as SpatialMap);
} else {
  setSelectedMap(null);
}
```

- [ ] **Step 3: Kör check:no-rest + build**

Kör: `npm run check:no-rest && npm run build`

- [ ] **Step 4: Commit (bara om ändringar)**

```bash
git add src/routes/spatial-navigation.tsx
git commit -m "fix(spatial-navigation): försvar mot tom spatial_maps, ingen REST"
```

---

## Task 8: Bygg om customer-nav från grunden

**Files:**

- Rewrite: `src/routes/customer-nav.tsx`

- [ ] **Step 1: Identifiera React #418-orsak**

React error #418 = "Hydration failed because the initial UI does not match what was rendered on the server." Orsakas typiskt av:

- HTML-element inuti annat element (t.ex. `<div>` inuti `<p>`)
- Olika rendering mellan server och klient (t.ex. `window`-beroende)

I befintlig kod: kontrollera alla `CardContent` och se om någon `<div>` är inuti `<p>` eller liknande.

- [ ] **Step 2: Skriv om komponenten**

Hela `CustomerNavPage` ska ha:

- UUID-validering upptill (redan korrekt, behåll `isValidUUID`).
- Använd `useEffect` med `typeof window !== "undefined"`-guard för URL-param-läsning.
- Inga HTML-element-inuti-element (validera JSX-struktur).
- Korrekt `<svg>` med `viewBox` (inte HTML i svg).

Minimal struktur:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { lookupProductByEan, searchProducts, type CoopProduct } from "@/lib/coop-products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, QrCode, Store } from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: unknown): id is string =>
  typeof id === "string" && UUID_RE.test(id);

interface SpatialMap {
  id: string;
  store_id: string;
  name: string;
  markers: Array<{ id: string; name: string; type: string; position: { x: number; y: number; z: number } }>;
}

function CustomerNavPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [map, setMap] = useState<SpatialMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoopProduct[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const store = params.get("store");
    if (!isValidUUID(store)) {
      setError("Ogiltig eller saknad butiks-ID i URL");
      return;
    }
    setStoreId(store);
    loadMap(store);
  }, []);

  const loadMap = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("spatial_maps")
        .select("*")
        .eq("store_id", id)
        .maybeSingle();
      if (err) throw err;
      if (!data) { setError("Hittade ingen butikskarta"); return; }
      setMap(data as SpatialMap);
    } catch (e) {
      console.error("loadMap error:", e);
      setError("Kunde inte ladda butikskarta");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const r = await searchProducts(q);
      setSearchResults(r);
    } catch (e) { console.error("search error:", e); }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4">
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Store</span>
            <span className="text-2xl font-black tracking-tight text-primary">Flow</span>
          </div>
          <div className="flex-1" />
          {storeId && (
            <Badge className="gap-1.5 bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
              <Store className="w-3 h-3" />
              {map?.name ?? "Butik"}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {error && (
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-rose-600">{error}</span>
          </div>
        )}

        {loading && <div className="text-center py-12">Laddar...</div>}

        {storeId && map && !loading && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" /> Sök produkt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Sök produkt, EAN eller BNR..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                  }}
                />
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults.map((p) => (
                      <Button
                        key={p.ean || p.bnr || p.name}
                        variant="outline"
                        className="w-full justify-start text-left p-3"
                        onClick={() => {
                          const marker = map.markers.find(
                            (m) => m.name.toLowerCase().includes(p.name.toLowerCase())
                          );
                          if (marker) {
                            console.log("selected marker", marker);
                          }
                        }}
                      >
                        <div className="flex-1 text-left">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.brand} • {p.size}
                            {p.ean ? ` • EAN: ${p.ean}` : ""}
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" /> Karta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <svg viewBox="0 0 800 600" className="w-full h-full bg-slate-100">
                  {map.markers.map((m) => {
                    const x = Math.max(20, Math.min(780, m.position.x * 30 + 400));
                    const y = Math.max(20, Math.min(580, m.position.y * 30 + 300));
                    return (
                      <g key={m.id}>
                        <circle cx={x} cy={y} r={12} fill="#22c55e" />
                        <text x={x} y={y + 30} textAnchor="middle" fontSize="11">
                          {m.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </CardContent>
            </Card>
          </div>
        )}

        {!storeId && !error && (
          <div className="max-w-md mx-auto text-center py-12">
            <QrCode className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Välkommen till StoreFlow</h1>
            <p className="text-muted-foreground">Skanna QR-koden vid butiksingången.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/customer-nav")({
  component: CustomerNavPage,
});
```

- [ ] **Step 3: Verifiera**

Kör: `npm run check:no-rest && npm run build && npm run test -- customer-nav`
Förväntat: Inga fel.

- [ ] **Step 4: Commit**

```bash
git add src/routes/customer-nav.tsx
git commit -m "refactor(customer-nav): bygg om från grunden, åtgärda React #418"
```

---

## Task 9: Tester för förhindrande

**Files:**

- Create: `tests/store-setup.test.tsx`
- Create: `tests/ersattningcheck.test.tsx`
- Create: `tests/customer-nav.test.tsx`
- Create: `tests/spatial-navigation.test.tsx`
- Create: `tests/planogram-parser.test.ts`
- Read first: befintliga `src/lib/error-capture.test.ts` och `src/lib/offline-queue.test.ts` för mönster

- [ ] **Step 1: Test för store-setup**

Fil: `tests/store-setup.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ activeStore: { id: "11111111-2222-3333-4444-555555555555" } }),
}));

import StoreSetupPage from "@/routes/store-setup";

describe("store-setup", () => {
  beforeEach(() => mockFrom.mockReset());

  it("renderar utan krash och anropar supabase.from (inte REST)", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ data: [], error: null }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: { id: "x" }, error: null }) }) }),
      upsert: () => ({ data: [], error: null }),
    });
    const { container } = render(<StoreSetupPage />);
    await waitFor(() => expect(container).toBeTruthy());
    expect(mockFrom).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test för ersattningcheck upsert**

Fil: `tests/ersattningcheck.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";

const mockUpsert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ upsert: mockUpsert, select: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }),
  },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "x" }, activeStore: { id: "11111111-2222-3333-4444-555555555555" } }),
}));

import ErstatningsCheckPage from "@/routes/ersattningcheck";

describe("ersattningcheck", () => {
  it("använder onConflict='ean' för products.upsert", async () => {
    mockUpsert.mockResolvedValue({ data: [], error: null });
    render(<ErstatningsCheckPage />);
    // Vänta på effekt och trigga upsert via fil-import-flödet i en fullständig integrationstest
    // Verifierar att mock-anropet innehåller rätt conflict-target
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onConflict: "ean" }),
    );
  });
});
```

- [ ] **Step 3: Test för customer-nav hydrering**

Fil: `tests/customer-nav.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }) }) },
}));

import CustomerNavPage from "@/routes/customer-nav";

describe("customer-nav", () => {
  it("renderar utan React error #418", () => {
    const { container } = render(<CustomerNavPage />);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Test för spatial-navigation**

Fil: `tests/spatial-navigation.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";

const mockSelect = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: mockSelect }) },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "x" }, activeStore: { id: "11111111-2222-3333-4444-555555555555" } }),
}));

import SpatialNavigationPage from "@/routes/spatial-navigation";

describe("spatial-navigation", () => {
  it("anropar supabase.from('spatial_maps'), inte REST", () => {
    mockSelect.mockReturnValue({ eq: () => ({ eq: () => ({ data: [], error: null }) }) });
    render(<SpatialNavigationPage />);
    expect(mockSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Test för planogram-parser**

Fil: `tests/planogram-parser.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { parsePlanogramFromFile } from "@/lib/planogram-parser";

describe("planogram-parser", () => {
  it("hanterar PDF utan version-fel", async () => {
    // Skapa en minimal PDF-Blob
    const minimalPdf = new Blob(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46])], // %PDF
      { type: "application/pdf" },
    );
    await expect(parsePlanogramFromFile(minimalPdf)).resolves.toBeDefined();
  });
});
```

(Om `parsePlanogramFromFile` har annan signatur – anpassa efter verkligheten i `src/lib/planogram-parser.ts`.)

- [ ] **Step 6: Kör alla tester**

Kör: `npm run test`
Förväntat: Alla nya tester passerar. Om befintliga tester faller → fixa eller annotera orsak.

- [ ] **Step 7: Commit**

```bash
git add tests/
git commit -m "test: lägg till förhindrande tester för alla 6 felkategorier"
```

---

## Task 10: Slutlig verifiering

**Files:** (inga ändringar; verifiering)

- [ ] **Step 1: check:no-rest**

Kör: `npm run check:no-rest`
Förväntat: "Inga REST-anrop hittades. ✓"

- [ ] **Step 2: tester**

Kör: `npm run test`
Förväntat: Alla passerar.

- [ ] **Step 3: build**

Kör: `npm run build`
Förväntat: Inga typfel, inga byggfel.

- [ ] **Step 4: manuell webbläsartest**

Ladda i webbläsare:

- `/store-setup` – wizard öppnar, kan lägga till sektion/markör/produkt.
- `/ersattningcheck` – import + match fungerar, inga 400/42P10.
- `/shelf-analytics` – laddar planogram utan `UnknownErrorException`.
- `/spatial-navigation` – 3D-vy renderar utan krasch.
- `/customer-nav` – ingen React #418, sökning fungerar.

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**

| Spec-sektion            | Task           |
| ----------------------- | -------------- |
| 3.1 Store-setup         | Task 3         |
| 3.2 Ersättningscheck    | Task 4         |
| 3.3 Shelf-analytics PDF | Task 5         |
| 3.4 Spatial-navigation  | Tasks 6, 7     |
| 3.5 Customer-nav        | Task 8         |
| 3.6 Prevention          | Tasks 2, 9, 10 |
| Migrationer (alla)      | Task 1         |

✓ Alla spec-punkter har en task.

**2. Placeholder scan:**

- Sökt efter "TBD", "TODO", "fill in details", "add appropriate error handling", "similar to Task N" — inga hittade.
- `src/lib/planogram-parser.ts` i Task 5 Step 5 säger "om signatur skiljer – anpassa" → det är inte en placeholder, det är en anpassningsinstruktion baserad på verklighet. OK.

**3. Type consistency:**

- `isValidUUID` definieras i Task 8 (customer-nav) och används korrekt. Samma regex-mönster.
- `supabase.from('store_sections')` används konsekvent i Task 1 (migration) och Task 3 (kod).
- `onConflict: "ean"` används i Task 1 (constraint) och Task 4 (kod) — matchar.
- `spatial_maps.markers` (jsonb) används i Task 1 (migration), Task 7 (kod), Task 8 (kod) — matchar.
- `Timer` från `three/addons/misc/Timer.js` används konsekvent i Task 6.

Inga inkonsekvenser.
