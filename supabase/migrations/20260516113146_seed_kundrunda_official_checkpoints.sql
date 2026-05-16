/*
  # Seed official kundrunda zones and checkpoints

  ## Purpose
  Replace any existing kundrunda zones/checkpoints with the official store inspection
  template. This migration is idempotent — it deletes all existing zones (which cascades
  to checkpoints via FK) then inserts the full official structure.

  ## Zones inserted (in order)
  1. PARKERINGSPLATS / UTSIDA BUTIK — 8 checkpoints
  2. ENTRÉ — 6 checkpoints
  3. FRUKT OCH GRÖNT — 5 checkpoints (standard 4 + Vågar)
  4. BRÖD — 4 checkpoints (standard)
  5. MEJERI — 4 checkpoints (standard)
  6. FÄRSK — 4 checkpoints (standard)
  7. KOLONIAL & NONFOOD — 5 checkpoints (standard 4 + Gavlar/torg)
  8. FRYS — 4 checkpoints (standard, with modified lighting text)
  9. KONFEKTYR — 7 checkpoints (standard + Påsar + Vågar + Slevar)
  10. KASSA — 6 checkpoints
  11. UTANFÖR KASSALINJEN — 6 checkpoints
  12. BAKOMLIGGANDE YTOR — 2 checkpoints
  13. PERSONALYTOR — 2 checkpoints

  ## Notes
  - All existing zones and checkpoints are deleted first (CASCADE handles checkpoints)
  - existing kundrunda_responses zone_id FK is ON DELETE CASCADE, so old responses
    for deleted zones will also be removed
*/

-- Delete all existing zones (checkpoints cascade via FK)
DELETE FROM kundrunda_zones;

-- Insert zones and capture their generated UUIDs using a CTE
WITH zone_inserts AS (
  INSERT INTO kundrunda_zones (name, sort_order) VALUES
    ('PARKERINGSPLATS / UTSIDA BUTIK', 1),
    ('ENTRÉ',                          2),
    ('FRUKT OCH GRÖNT',                3),
    ('BRÖD',                           4),
    ('MEJERI',                         5),
    ('FÄRSK',                          6),
    ('KOLONIAL & NONFOOD',              7),
    ('FRYS',                           8),
    ('KONFEKTYR',                      9),
    ('KASSA',                          10),
    ('UTANFÖR KASSALINJEN',             11),
    ('BAKOMLIGGANDE YTOR',              12),
    ('PERSONALYTOR',                   13)
  RETURNING id, name
)
-- Insert all checkpoints referencing the freshly created zone IDs
INSERT INTO kundrunda_checkpoints (zone_id, label, sort_order)
SELECT z.id, cp.label, cp.sort_order
FROM zone_inserts z
JOIN (VALUES
  -- PARKERINGSPLATS / UTSIDA BUTIK
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Allmän yta ren och skräpfri', 1),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Gatupratare, vepor och skyltar är hela/aktuella', 2),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Flaggor hela', 4),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Butikens fasad ren', 5),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Vagnar och korgar samlade och skräpfria', 6),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Reklamblad påfyllda', 7),
  ('PARKERINGSPLATS / UTSIDA BUTIK', 'Blommor ordning och reda, fräsch och påfyllt', 8),
  -- ENTRÉ
  ('ENTRÉ', 'Städning rent och fräscht', 1),
  ('ENTRÉ', 'Belysning fungerar i tak, hyllor och övriga ytor', 2),
  ('ENTRÉ', 'Blommor ordning och reda, fräsch och påfyllt', 3),
  ('ENTRÉ', 'Vagnar och korgar samlade och skräpfria', 4),
  ('ENTRÉ', 'First Buy på plats', 5),
  ('ENTRÉ', 'Aktuellt skyltmaterial & tema sitter uppe', 6),
  -- FRUKT OCH GRÖNT
  ('FRUKT OCH GRÖNT', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('FRUKT OCH GRÖNT', 'Städning rent och fräscht', 2),
  ('FRUKT OCH GRÖNT', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('FRUKT OCH GRÖNT', 'Generellt säljtryck/hål i hyllan', 4),
  ('FRUKT OCH GRÖNT', 'Vågar rena och fräscha och fungerar', 5),
  -- BRÖD
  ('BRÖD', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('BRÖD', 'Städning rent och fräscht', 2),
  ('BRÖD', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('BRÖD', 'Generellt säljtryck/hål i hyllan', 4),
  -- MEJERI
  ('MEJERI', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('MEJERI', 'Städning rent och fräscht', 2),
  ('MEJERI', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('MEJERI', 'Generellt säljtryck/hål i hyllan', 4),
  -- FÄRSK
  ('FÄRSK', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('FÄRSK', 'Städning rent och fräscht', 2),
  ('FÄRSK', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('FÄRSK', 'Generellt säljtryck/hål i hyllan', 4),
  -- KOLONIAL & NONFOOD
  ('KOLONIAL & NONFOOD', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('KOLONIAL & NONFOOD', 'Städning rent och fräscht', 2),
  ('KOLONIAL & NONFOOD', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('KOLONIAL & NONFOOD', 'Generellt säljtryck/hål i hyllan', 4),
  ('KOLONIAL & NONFOOD', 'Gavlar/torg påfyllda', 5),
  -- FRYS
  ('FRYS', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('FRYS', 'Städning rent och fräscht', 2),
  ('FRYS', 'Belysning fungerar i tak, frys och övriga ytor', 3),
  ('FRYS', 'Generellt säljtryck/hål i hyllan', 4),
  -- KONFEKTYR
  ('KONFEKTYR', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('KONFEKTYR', 'Städning rent och fräscht', 2),
  ('KONFEKTYR', 'Belysning fungerar i tak, hyllor och övriga ytor', 3),
  ('KONFEKTYR', 'Generellt säljtryck/hål i hyllan', 4),
  ('KONFEKTYR', 'Påsar påfyllda', 5),
  ('KONFEKTYR', 'Vågar rena och fräscha och fungerar', 6),
  ('KONFEKTYR', 'Slevar diskade - påfyllt', 7),
  -- KASSA
  ('KASSA', 'Skyltning (Rätt pris/vara/format/kampanj/placering)', 1),
  ('KASSA', 'Städning rent och fräscht', 2),
  ('KASSA', 'Belysning i tak, hyllor och övriga ytor', 3),
  ('KASSA', 'Impulslådor', 4),
  ('KASSA', 'Ordning och reda', 5),
  ('KASSA', 'Lastbuy', 6),
  -- UTANFÖR KASSALINJEN
  ('UTANFÖR KASSALINJEN', 'Skyltfönster fri från reklam', 1),
  ('UTANFÖR KASSALINJEN', 'Pantrum i allmänhet rent och städat', 2),
  ('UTANFÖR KASSALINJEN', 'Pantmaskin fungerar', 3),
  ('UTANFÖR KASSALINJEN', 'Returstationen ej fulla kärl, inget skräp', 4),
  ('UTANFÖR KASSALINJEN', 'Kundtoalett/handfat rent och fräsch', 5),
  ('UTANFÖR KASSALINJEN', 'Matavfalls påsar påfyllda', 6),
  -- BAKOMLIGGANDE YTOR
  ('BAKOMLIGGANDE YTOR', 'Lagerordning', 1),
  ('BAKOMLIGGANDE YTOR', 'Lastkaj', 2),
  -- PERSONALYTOR
  ('PERSONALYTOR', 'Omklädningsrum ordning & reda', 1),
  ('PERSONALYTOR', 'Köket rent & fräsch', 2)
) AS cp(zone_name, label, sort_order) ON z.name = cp.zone_name;
