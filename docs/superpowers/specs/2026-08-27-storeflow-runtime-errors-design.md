# Plan för åtgärd av alla runtime-fel i StoreFlow

**Datum:** 2026-08-27
**Status:** Godkänd av användare (design + svar på frågor)
**Språk:** Svenska (kommentarer/variabler på engelska per CLAUDE.md)

---

## 1. Syfte och avgränsning

Avhjälpa alla sex felgrupper från webconsole utan att införa placeholders, mock-data eller fiktiva tillstånd:

1. **Store-setup** – saknad `store_sections`, REST-anrop trots `@supabase/supabase-js`-krav, tom markörknapp, produkter kopplas fel.
2. **Ersättningscheck** – `ON CONFLICT`-constraint saknas på `products`, `reclamations` 404, upsert-arkitektur fel.
3. **Shelf-analytics** – PDF-parsning ger `UnknownErrorException: API version 5.4.296 vs Worker 6.2.108`.
4. **Spatial-navigation** – `spatial_maps` REST 400 + Three.js `CLOCK` deprecated + `addScaledVector` saknas.
5. **Customer-nav** – React #418 (HTML i element), krash på initiering.
6. **Prevention** – säkerställa att dessa inte återkommer genom migrations, lint, test och arkitektur.

---

## 2. Arkitektur (dataflöde)

```
UI-komponent (React + TanStack Start)
  ↓
lib/supabase.ts  ← ENDAST @supabase/supabase-js (aldrig fetch/REST)
  ↓
Supabase PostgreSQL + RLS
  ↓
supabase/migrations/*.sql  (idempotenta, unika tidsstämplar)
```

**Regel:** Inga `https://...supabase.co/rest/v1/...` i klientkod. Om REST endpoints syns → ersätt med `supabase.from(...).select/insert/upsert`.

---

## 3. Design per delsystem

### 3.1 Store-setup / Digital Twin (store-setup, markörer, produktkoppling)

**Problem:** `PGRST205` (saknad `store_sections`), REST-anrop i wizard-komponent, tom markörknapp, produkter kopplas fel.

**Lösning:**

- **Migration:** `20260827_120000_add_store_sections_and_digital_twin_tables.sql` (idempotent, `CREATE TABLE IF NOT EXISTS`).
- **RLS:** `CREATE POLICY IF NOT EXISTS` på `store_sections`, `spatial_markers`, `store_product_deliveries`.
- **Kod:** `src/components/digital-twin/Step2Markers.tsx` – ersätt eventuell REST-curl med `supabase.from('spatial_markers').upsert(...)` per spec (`docs/superpowers/specs/2026-08-27-digital-twin-design.md`).
- **Produktkoppling:** Använd `sap_article_id` primärt (enligt `CLAUDE.md` artikel-matchning), `bnr` som fallback, aldrig SKU.
- **Tests:** React Testing Library + mockad `supabase`-klient (`vi.mock('@/lib/supabase')`).

### 3.2 Ersättningscheck (ersattningcheck)

**Problem:** `42P10` (`ON CONFLICT` saknar unik constraint på `products`); `reclamations` 404.

**Lösning:**

- **Migration:** Lägg till unik constraint på `products(ean)` (eller `products(sap_article_id)` om EAN kan vara null, men specen säger `ean` – kontrollera schema). Om `ean` inte är unik → lägg `UNIQUE(sap_article_id, store_id)` och använd rätt `onConflict` i koden.
- **Migration:** `20260827_120001_add_reclamations_and_constraints.sql` skapa `reclamations` med rätt RLS + index.
- **Kod:** `src/routes/ersattningcheck.tsx` rad 198: `upsert(newProducts, { onConflict: "ean", ignoreDuplicates: false })` → verifiera att `ean` har `UNIQUE`. Om inte → byt till rätt kolumn eller lägg constraint.
- **Kod:** `reclamations`-laddning (rad 218-240) använder redan `supabase.from('reclamations')` – bara den saknas i schema; migrationen fixar.

### 3.3 Shelf-analytics / PDF-hantering (shelf-analytics)

**Problem (enligt användarens förtydligande):** Inte posemesh API, utan PDF-parsning som ger versionsmismatch (`5.4.296` vs `6.2.108`).

**Lösning:**

- **PDF-handler:** Leta upp PDF-tolk i `src/lib/planogram-parser.ts` eller `src/components/planogram-upload.tsx`. Om den använder en extern library (t.ex. `pdf-parse` eller `pdfjs-dist`) med hårdkodad version – uppdatera till matchande version, eller byt till en lokal SVG/Canvas-generator (enligt digital-twin-spec steg 3).
- **Körning:** Verifiera att build/test använder rätt version av parsaren; lägg en `package-lock.json`-regel om nödvändigt.

### 3.4 Spatial-navigation (spatial-navigation)

**Problem:** `spatial_maps` REST 400; Three.js `CLOCK` deprecated; `addScaledVector` saknas.

**Lösning:**

- **Kod:** I `spatial-navigation.tsx` rad 78-89: `supabase.from('spatial_maps')...` används korrekt – 400 beror på att tabellen saknar rätt kolumner eller RLS; se migration.
- **Three.js:** Byt `THREE.Clock` mot `THREE.Timer` (`src/components/StoreMap3D.tsx` eller `ARNavigationView.tsx`). Fixa `Vector3`-anrop: säkerställ att `target.addScaledVector` anropas på korrekt instans (`new THREE.Vector3()` eller från objekt som har metoden). Lägg defensiv check `if (typeof target?.addScaledVector === 'function')` innan anrop.
- **Migration:** `20260827_120002_fix_spatial_maps_and_rls.sql` – säkerställ att `spatial_maps` har `store_id` (UUID, index), `markers` (jsonb), RLS (`authenticated`, `store_id = auth.uid()`).

### 3.5 Customer-nav (customer-nav)

**Problem:** React error #418 (`HTML`-element inuti annat), krash vid initiering, tomt resultat.

**Lösning:**

- **Ombyggnad:** Skriv om `src/routes/customer-nav.tsx`. Ersätt eventuella felaktiga HTML-innehåll (t.ex. `<div>` inuti `<p>`, `<button>` inuti `<a>`) med korrekt JSX-struktur. Säkerställ att `CustomerMapView` renderar `<svg>` korrekt utan hydrideringsfel.
- **UUID-validering:** Behåll `isValidUUID` (rad 59) som redan finns; se till att `storeId`-laddning (rad 65-79) hanterar `window` korrekt vid SSR (TanStack Start). Använd `useEffect` + `typeof window !== 'undefined'` om nödvändigt.
- **Data:** Lösning via `supabase.from('spatial_maps')` på rad 93 – redan korrekt, bara schema/migrations som behövs.

### 3.6 Preventions-struktur (så det inte händer igen)

- ** Migrationer ska alltid vara idempotenta:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` före `CREATE POLICY`.
- ** Inga REST-anrop:** Lägg till en enkel lint-regel eller kodgranskning: sök efter `.supabase.co/rest/v1/` i `src/`. Om hittas → avvisa i PR.
- ** UUID-validering:** Alla UUID-parametrar som passerar till Supabase måste valideras (`isValidUUID`) innan query; avvisa ogiltiga med tydlig error istället för att skicka dem till DB.
- ** RLS på alla tabeller:** Varje ny tabell får `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` och minst SELECT/INSERT/UPDATE/DELETE-policies.
- ** Tests:** Lägg `tests/store-setup.test.tsx`, `tests/ersattningcheck.test.tsx`, `tests/customer-nav.test.tsx` som verifierar att komponenterna renderar utan krash och att `supabase.from` används.
- ** Bygg:** Kör `npm run build` och `npm run test` innan varje push; om test misslyckas → blockerande.

---

## 4. Implementeringsplan (ordning)

| Steg | Fil/Åtgärd                                                                                                                                           | Syfte                                                              | Verifiering                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1    | `supabase/migrations/20260827_120000_add_store_sections...sql` + `20260827_120001_add_reclamations...sql` + `20260827_120002_fix_spatial_maps...sql` | Skapa saknade tabeller, constraints, RLS                           | `supabase db reset` eller `supabase migrate up` lokalt; kontrollera schema                            |
| 2    | `src/lib/supabase.ts` – verifiera att ingen REST-url finns                                                                                           | Förhindra REST-anrop                                               | `grep -rni "rest/v1" src/` ska vara tomt                                                              |
| 3    | `src/routes/store-setup.tsx` + komponenter                                                                                                           | Ersätt REST med `supabase.from`, fix markörknapp, koppla produkter | Rendera wizard; kontrollera att markörer sparas; kontrollera produkt-matchning på `sap_article_id`    |
| 4    | `src/routes/ersattningcheck.tsx` rad 198 + schema                                                                                                    | Rätta `onConflict`; säkerställ `reclamations`                      | Importera fil → matcha → verifisera att `products` upsert lyckas; kontrollera `reclamations`-laddning |
| 5    | `src/lib/planogram-parser.ts` / upload-komponent                                                                                                     | Uppdatera PDF-parser / generator                                   | Ladda upp PDF → kontrollera att ingen `UnknownErrorException` uppstår                                 |
| 6    | `src/components/StoreMap3D.tsx` + `ARNavigationView.tsx`                                                                                             | Byt `Clock` → `Timer`; fixa `addScaledVector`                      | Rendera 3D-vy; kontrollera console för deprecation + krasch                                           |
| 7    | `src/routes/spatial-navigation.tsx`                                                                                                                  | Verifiera `spatial_maps`-laddning                                  | Ladda sida; kontrollera att karta visas; ingen 400                                                    |
| 8    | `src/routes/customer-nav.tsx`                                                                                                                        | Ombyggnad från grunden                                             | Rendera; kontrollera att ingen React #418; kontrollera UUID-validering; kontrollera map-laddning      |
| 9    | `tests/` – nya testfiler                                                                                                                             | Förhindrande                                                       | `npm run test` passerar                                                                               |
| 10   | `npm run build` + `npm run lint`                                                                                                                     | Slutlig verifiering                                                | Inga byggfel, inga typer, inga lint-feel                                                              |

---

## 5. Säkerhets- och kvalitetssäkring

- ** Ingen service-role key i klient:** Verifiera `src/lib/supabase.ts` – endast `anon`-key; ingen `service_role`.
- ** UUID-validering:** Alla externa ID:n valideras innan DB-query (`isValidUUID` från `customer-nav` används som mall).
- ** RLS-granskning:** Efter varje migration, kontrollera `SELECT * FROM pg_policies WHERE tablename = '...';` att policys finns.
- ** Inga mockar:** Om en komponent inte fungerar fullt → fixa koden, inte ersätt med `"demo-store-1"` eller hardcoded data.

---

## 6. Framgångskriterier (definierat i design, verifierbara)

1. Ingen `PGRST205`, `42P10`, `404`, `400` eller `Parse error` i webconsole efter åtgärd.
2. `grep -rni "rest/v1" src/` returnerar ingenting.
3. `supabase.from(...)` används i alla databasinteraktioner.
4. Alla nya tabeller har RLS och unika migrationsnamn.
5. `npm run build` + `npm run test` godkänd.
6. Customer-nav renderar utan React #418; spatial-nav visar 3D-karta; store-setup visar markörer och kopplar produkter.

---

## 7. Nästa steg (enligt brainstorming -> planning)

Efter att denna design är godkänd (skriven till `docs/superpowers/specs/2026-08-27-storeflow-runtime-errors-design.md`) och användaren har granskat den:

1. Invokera `superpowers:writing-plans` för att skapa detaljplan (`plans/2026-08-27-fix-all-runtime-errors.md`).
2. Genomför steg 1-10 ovan i ordning.
3. Efter varje steg: verifiera (Phase 4 i debugging-processen) innan nästa påbörjas.

**Document committed:** `docs/superpowers/specs/2026-08-27-storeflow-runtime-errors-design.md`
