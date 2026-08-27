# Digital Twin-refaktorisering – Designspec

**Datum:** 2026-08-27
**Författare:** Claude (brainstorming + planering)
**Status:** Godkänd för implementation

## Syfte

Refaktorisera `src/routes/store-setup.tsx` för att bygga en **Digital Twin** av butiken i en tydlig 4-stegsguide, där allt tillstånd sparas och hämtas direkt via Supabase-klienten (inga REST API-anrop).

## Befintliga byggstenar att återanvända

- **`StoreMap2D`** (`src/components/store-map-2d.tsx`) – drag&drop-grid för sektioner (cm-baserat, GRID=20 cm)
- **`ArucoMarker`** (`src/components/aruco-marker.tsx`) – 4×4 binärordlista 50 markörer, format `MARKER_SKEPP_<NN>`
- **`ShelfScanner`** (`src/components/shelf-scanner.tsx`) – kamera/planogram-validering
- **`supabase` client** (`src/lib/supabase.ts`) – redan konfigurerad med session-token

## Datamodell (befintliga tabeller)

| Tabell | Roll i Digital Twin |
|--------|--------------------|
| `spatial_maps` | Övergripande karta (en aktiv per butik) |
| `spatial_markers` | ArUco-markörer med 3D-position |
| `spatial_walls` | Väggar/hyllor (vektorssegment) |
| `store_packaging` (tidigare `store_skepp`) | Fysiska hyllor/enheter med `marker_code` |
| `store_sections` (tidigare `store_sektioner`) | 2D-layout (pos_x_cm, pos_y_cm, width/height/depth) |
| `store_departments` (tidigare `store_avdelningar`) | Butiksavdelningar |
| `store_shelves` (tidigare `store_hyllor`) | Hyllor kopplade till planogram |
| `shelf_planograms` | Förväntade produkter per hylla (jsonb `expected_products`) |
| `products` | Produktkatalog |
| `shelf_observations` | Skanningsresultat |

## 4-stegsflödet

### Steg 1 – 2D-butikskarta
- Återanvänd `StoreMap2D`-komponenten
- Ladda `store_sections` för aktuell butik → rendera som dragbara sektioner
- Skapa/ta bort sektioner → spara direkt via `supabase.from('store_sections').upsert(...)`
- Snabbknapp för "Lägg till sektion" som infogar en default-sektion

### Steg 2 – Placera ArUco-markörer på kartan
- Visuell overlay ovanpå 2D-kartan
- Klicka på kartan → ny markör skapas med `marker_type='aruco'`
- Dra befintliga markörer → uppdatera `position.x/y`
- Varje markör får ett unikt `marker_id` (`MARKER_SKEPP_<NN>`) via ArucoMarker-komponenten
- Spara direkt till `spatial_markers` med `map_id = state.spatialMapId`

### Steg 3 – Generera Aruco PDF
- Implementera en **lättviktig frontend-baserad SVG/Canvas-generator** (inga externa API-beroenden)
- 4×4 binär ordlista (50 markörer) som `MARKER_SKEPP_01` till `MARKER_SKEPP_50`
- Layout: 3 kolumner × N rader på A4
- Nedladdning via `Blob` + `URL.createObjectURL` (ingen jsPDF, håller det lättviktigt)

### Steg 4 – Koppla produkter och hyllor
- Två underlägen beroende på planogram-status:
  - **Planogram-slagna artiklar**: hämta `expected_products` från `shelf_planograms.expected_products` (jsonb), länka direkt via `shelf_observations`
  - **Tillvalsartiklar (option)**: användaren väljer hylla via dropdown + klickbar position på kartan
- Spara observationer till `shelf_observations` med `shelf_marker_id`

## Arkitektur

```
src/routes/store-setup.tsx           ← wizard-route (entry)
src/components/digital-twin/
  ├── Wizard.tsx                     ← 4-stegs guide + progress
  ├── Step1Map2D.tsx                 ← StoreMap2D + sektionshantering
  ├── Step2Markers.tsx               ← klickbar markörplacering
  ├── Step3Pdf.tsx                   ← frontend PDF/SVG-generator
  ├── Step4Products.tsx              ← planogram + tillvalsprodukter
  └── aruco-dictionary.ts            ← 50 markörer (4×4 binärt)
src/lib/digital-twin.ts              ← Supabase CRUD-funktioner
src/types/digital-twin.ts            ← lokala typer
```

## Dataflöde (Supabase direkt)

Allt går genom `supabase.from(...)` – **inga `fetch` mot REST-endpoints**.

| Åtgärd | Supabase-anrop |
|--------|----------------|
| Ladda state vid mount | `select` på `spatial_maps`, `store_sections`, `spatial_markers` |
| Spara sektion | `upsert` på `store_sections` |
| Spara markör | `upsert` på `spatial_markers` |
| Ladda planogram | `select` på `shelf_planograms` |
| Spara observation | `insert` på `shelf_observations` |
| Realtid | `supabase.channel('digital_twin_'+storeId).on('postgres_changes', ...)` för att lyssna på ändringar |

## Felhantering

- Varje steg har en lokal `error`-state som visar toast
- `try/catch` runt alla Supabase-anrop
- Idempotens: `upsert` istället för `insert` där det är möjligt
- Om Supabase returnerar fel → visa felmeddelande, behåll lokalt state

## Tester

- Komponenttester med React Testing Library för varje steg
- Snapshot-test för Aruco-ordlistan (deterministisk)
- Mocka Supabase-klienten med `vi.mock('@/lib/supabase', ...)`

## Säkerhet (RLS)

Alla tabeller har redan RLS aktiverat. Inga nya policies behövs.
`active_store_id` används för multi-tenant-isolering enligt befintliga policies.

## Komponentuppdatering: `StoreMap2D`

- Befintlig komponent fungerar för sektioner
- **Ny prop:** `onAddSection` för "lägg till ny"
- **Ny prop:** `onDeleteSection` för "ta bort"
- **Ny prop:** `selectedId` för markering (Steg 2 väljer sektion)
- **Ny prop:** `readonly` (Steg 1 redigerar, Steg 2 är read-only)

## Komponentuppdatering: `ArucoMarker`

- **Ny prop:** `onMarkerReady(markerId)` callback istället för egen DB-write
- Logiken flyttas till wizard-state

## Utanför scope (YAGNI)

- 3D-positionering (finns i StoreMap3D men inte i wizard)
- Realtids-positionering av personal
- Avancerad kollisionsdetektering
- Mobil-först responsivitet (desktop-only)
- Auktorisering/granskning

## Success Criteria

1. Användaren kan slutföra hela wizarden utan att ladda om sidan
2. Allt state persisteras mellan sessioner via Supabase
3. PDF kan laddas ner och skrivas ut med giltiga ArUco-markörer
4. Produkter från planogram kopplas automatiskt
5. Tillvalsartiklar kan kopplas manuellt
