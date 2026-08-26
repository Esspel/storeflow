# Plan: Zip-fil organisation och Produktkatalog med reklamationshistorik

## Context
Utöka befintliga hållbarhetssystem med:
1. **Zip-filorganisation** - Gruppera ersättningsansökningar per leveransnummer och temperaturzon (fryst, torrt, färskt)
2. **Produktkatalog** - Visa reklamationshistorik (antal reklamationer och leveranser per produkt)

## 1. Database Schema Update

### Ny kolumner i `product_shelf_life`:
```sql
ALTER TABLE product_shelf_life ADD COLUMN IF NOT EXISTS delivery_number text;
ALTER TABLE product_shelf_life ADD COLUMN IF NOT EXISTS temperature_zone text CHECK (temperature_zone IN ('fryst', 'torr', 'färsk'));
```

### Nya tabeller:
```sql
-- Historik över reklamationer per produkt
CREATE TABLE product_reclamation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_article_id text NOT NULL,
  store_id text NOT NULL,
  delivery_number text,
  temperature_zone text,
  reclaimed_at timestamptz DEFAULT now(),
  reason text
);

-- Historik över leveranser per produkt
CREATE TABLE product_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_article_id text NOT NULL,
  store_id text NOT NULL,
  delivery_number text,
  temperature_zone text,
  delivered_at timestamptz DEFAULT now()
);
```

## 2. MCP-verktyg att lägga till

### `group_shelf_life_by_delivery`
Grupperar flaggade produkter för zip-generering:
- **Input**: `store_id`
- **Output**: Map<`{delivery_number}_{temperature_zone}`, Product[]> (JSON med grupperad data)

### `get_product_reclamation_stats`
Hämtar statistik för produktkatalog:
- **Input**: `store_id` (valfritt), `sap_article_id` (valfritt)
- **Output**: Lista med `{sap_article_id, name, ean, bnr, reclamation_count, delivery_count, last_reclamation, last_delivery}`

## 3. Zip-fil generering

Uppdatera `generateShelfLifeZipHandler`:
1. Hämta flaggade produkter
2. Gruppera efter `{delivery_number}_{temperature_zone}`
3. Skapa separata CSV-filer per grupp
4. Returnera ZIP med multipla filer

### CSV-filnamn:
- `LEVERANS_{nr}_{zon}.csv` t.ex. `LEVERANS_12345_fryst.csv`
- `LEVERANS_{nr}_torr.csv`
- `LEVERANS_{nr}_färsk.csv`

## 4. Frontend - Produktkatalog

Ny route `/produktkatalog` med:
- Tabell över alla produkter i butiken
- Kolumner: SAP-ID, Namn, EAN, BNR, Reklamationer, Leveranser, Senaste reklamation
- Möjlighet att filtrera/söka
- Knappar: "Kopiera SAP-ID", "Öppna i S4R"

## 5. Veckouppdrag-integration

Uppdatera ersättningskontroll (`ersattningcheck.tsx`):
- Visa veckouppdrag med 10 produkter som saknar hållbarhetsdagar
- Knapp "Kopiera SAP-ID" för varje produkt
- Länk till S4R (om butiksnummer är inställt)
- Inmatningsfält för "Antal dagar" (hållbarhetstid)

## Files to Modify

| Fil | Ändring |
|-----|---------|
| `supabase/migrations/...zip_organization.sql` | Database schema |
| `supabase/functions/_shared/storeflow-core.ts` | Nya handlers |
| `supabase/functions/mcp-server/index.ts` | Nya verktyg |
| `src/routes/produktkatalog.tsx` | Ny produktkatalog |
| `src/routes/ersattningcheck.tsx` | Uppdatera med veckouppdrag |

## Verification
1. Kör `npm run build` - inga TypeScript-fel
2. Testa zip-generering - separata filer per leverans/temperaturzon
3. Testa produktkatalog - visas reklamationer och leveranser korrekt
