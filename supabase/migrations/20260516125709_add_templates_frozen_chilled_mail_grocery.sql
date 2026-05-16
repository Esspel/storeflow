/*
  # Add templates and common defects for frozen goods, chilled goods, mail handling, and grocery routines

  ## Summary
  Adds 8 new checklist templates based on operational documents for:
  1. Frozen goods handling and freezer management (Frysta varor och frysar)
  2. Chilled goods handling and refrigerator management (Kylda varor och kylar)
  3. Mail/post handling in store (Hantering av post i butik)
  4. Grocery routine (Kolonialrutin)

  Also adds checkpoint-specific common defects for FRYS and KYL zones in kundrunda.

  ## New Templates
  1. Frys — daglig temperaturkontroll (HACCP, daily, critical)
  2. Frys — veckorengöring (weekly cleaning)
  3. Kyl — daglig temperaturkontroll (HACCP, daily, critical)
  4. Kyl — mottagningskontroll kylda varor (at delivery, high priority)
  5. Kyl — FIFO & hållbarhetskontroll (weekly)
  6. Post — hantering av inkommande post (as-needed)
  7. Kolonial — hyllkontroll & påfyllning (daily)
  8. Kolonial — kampanjbyte & prisskyltar (weekly)

  ## Security
  No new tables — inserts only into existing templates tables.
*/

-- ── 1. Frys — daglig temperaturkontroll ─────────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Frys — daglig temperaturkontroll',
    'Kontrollera och dokumentera temperaturer i alla frysdiskar och fryslager. HACCP-kritisk kontrollpunkt — avvikelse kräver omedelbar åtgärd.',
    'HACCP',
    'Kritisk',
    'FREQ=DAILY',
    NULL,
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Kontrollera temperatur i frysdisk 1 (ska vara max -18°C)', false, 1),
  ('Kontrollera temperatur i frysdisk 2 (ska vara max -18°C)', false, 2),
  ('Kontrollera temperatur i fryslager (ska vara max -18°C)', false, 3),
  ('Dokumentera alla temperaturer i egenkontrollsystemet', false, 4),
  ('Kontrollera att frysdiskarnas lock/dörrar stängs ordentligt', false, 5),
  ('Kontrollera att ingenting blockerar luftcirkulationen', false, 6),
  ('Vid avvikelse: fotografera termometer och kontakta ansvarig', true, 7),
  ('Vid avvikelse: bedöm produkternas skick och dokumentera åtgärd', true, 8)
) AS item(label, photo, ord);

-- ── 2. Frys — veckorengöring ─────────────────────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Frys — veckorengöring',
    'Rengör frysdiskar och fryslager. Kontrollera packning, belysning och kyleffekt.',
    'Rengöring',
    'Medel',
    'FREQ=WEEKLY',
    ARRAY[5],
    1,
    1
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Töm och flytta produkter till annan frys tillfälligt', false, 1),
  ('Avfrosta frysdisk om frost buildup finns (fotografera vid behov)', true, 2),
  ('Rengör insida, hyllor och dörrar/lock med godkänt rengöringsmedel', false, 3),
  ('Rengör utsida och glasluckor', false, 4),
  ('Kontrollera packningar — byt vid sprickor eller slitage', false, 5),
  ('Kontrollera belysning i disken — anmäl utbrända lampor', false, 6),
  ('Återfyll produkter i rätt FIFO-ordning (äldst fram)', false, 7),
  ('Dokumentera rengöring och eventuella fel i egenkontrollsystemet', false, 8)
) AS item(label, photo, ord);

-- ── 3. Kyl — daglig temperaturkontroll ──────────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kyl — daglig temperaturkontroll',
    'Kontrollera och dokumentera temperaturer i alla kylmöblar och kyllager. HACCP-kritisk kontrollpunkt. Kylda varor ska förvaras 0–8°C (känsliga produkter 0–4°C).',
    'HACCP',
    'Kritisk',
    'FREQ=DAILY',
    NULL,
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Kontrollera temp mejeriavdelning (ska vara 0–8°C)', false, 1),
  ('Kontrollera temp chark/delikatessdisk (ska vara 0–4°C)', false, 2),
  ('Kontrollera temp färsk fisk (ska vara 0–2°C)', false, 3),
  ('Kontrollera temp frukt & grönt kyl (ska vara 4–8°C)', false, 4),
  ('Kontrollera temp kyllager (ska vara 0–8°C)', false, 5),
  ('Dokumentera alla mätvärden i egenkontrollsystemet', false, 6),
  ('Kontrollera att kylskåp/diskar stängs ordentligt', false, 7),
  ('Vid avvikelse >8°C: fotografera och kontakta ansvarig omedelbart', true, 8)
) AS item(label, photo, ord);

-- ── 4. Kyl — mottagningskontroll kylda varor ─────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kyl — mottagningskontroll kylda varor',
    'Kontroll vid mottagning av kylda varor. Mät temperatur direkt vid uppackning på lastkajen — kylkedjan måste inte ha brutits.',
    'Livsmedelssäkerhet',
    'Hög',
    NULL,
    NULL,
    NULL,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Kontrollera leveranstemperatur direkt vid uppackning', true, 1),
  ('Mät med kalibrerad temperaturgivare (rengör sond mellan produkter)', false, 2),
  ('Kontrollera att antal kolli stämmer med fraktsedel', false, 3),
  ('Kontrollera förpackningarnas skick — notera skador', false, 4),
  ('Kontrollera bäst-före datum — tillräcklig marginal kvar?', false, 5),
  ('Kontrollera att KRAV/EKO-märkning stämmer med orderspecifikation', false, 6),
  ('Transportera genast till kyllager (max 15 min i rumstemperatur)', false, 7),
  ('Dokumentera mottagningskontrollen i egenkontrollsystemet', false, 8),
  ('Vid avvikelse (temp >8°C): fotografera och kontakta butiksstöd', true, 9)
) AS item(label, photo, ord);

-- ── 5. Kyl — FIFO & hållbarhetskontroll ──────────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kyl — FIFO & hållbarhetskontroll',
    'Kontrollera att kylhyllorna fylls i FIFO-ordning och att inga produkter med passerat eller nära datum säljs.',
    'Livsmedelssäkerhet',
    'Hög',
    'FREQ=WEEKLY',
    ARRAY[1],
    1,
    1
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Kontrollera mejeri: äldst fram, inga passerade datum', false, 1),
  ('Kontrollera chark: äldst fram, inga passerade datum', false, 2),
  ('Kontrollera färsk fisk och kött: äldst fram, inga passerade datum', false, 3),
  ('Kontrollera deli/färdigmat: äldst fram, inga passerade datum', false, 4),
  ('Ta bort och kassera produkter med passerat datum', false, 5),
  ('Märk ned produkter med datum som löper ut idag/imorgon', false, 6),
  ('Dokumentera kasserade varor i systemet (antal och värde)', false, 7)
) AS item(label, photo, ord);

-- ── 6. Post — hantering av inkommande post ────────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Post — hantering av inkommande post',
    'Rutin för att ta emot, sortera och vidarebefordra inkommande post till rätt mottagare i butiken.',
    'Administration',
    'Låg',
    'FREQ=WEEKLY',
    ARRAY[1,2,3,4,5],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Hämta post från brevlåda/postfack', false, 1),
  ('Sortera post: butikens post, personalens post, reklam/flyers', false, 2),
  ('Vidarebefordra butikspost till butikschef/ansvarig', false, 3),
  ('Lägg personalpost i respektive postfack/hög', false, 4),
  ('Hantera eventuella paket — registrera levererade paket', false, 5),
  ('Kassera/återvinn oönskad reklam enligt butikens rutiner', false, 6)
) AS item(label, photo, ord);

-- ── 7. Kolonial — hyllkontroll & påfyllning ──────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kolonial — hyllkontroll & påfyllning',
    'Daglig kontroll och påfyllning av kolonialvaror. Kontrollera prismärkning, hyllkanter och produktens placering enligt planogram.',
    'Butiksrutiner',
    'Medel',
    'FREQ=DAILY',
    NULL,
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Kontrollera att alla hyllor är påfyllda och fronter fräscha', false, 1),
  ('Kontrollera att hyllkanter och prismärkning stämmer', false, 2),
  ('Kontrollera att varor är placerade enligt planogram', false, 3),
  ('Kontrollera bäst-före datum — ta bort passerande produkter', false, 4),
  ('Kontrollera att inga produkter är sönderpackade eller skadade', false, 5),
  ('Fyll på från lager i FIFO-ordning (äldst fram)', false, 6),
  ('Städa och damma av hyllor vid behov', false, 7),
  ('Rapportera tomma hyllor/restnoterade varor till inköpsansvarig', false, 8)
) AS item(label, photo, ord);

-- ── 8. Kolonial — kampanjbyte & prisskyltar ───────────────────────────────────
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kolonial — kampanjbyte & prisskyltar',
    'Byt kampanjskyltar och kontrollera att kampanjpriser är korrekt inlagda. Utförs normalt på onsdagar inför torsdagens kampanjstart.',
    'Butiksrutiner',
    'Medel',
    'FREQ=WEEKLY',
    ARRAY[3],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t, (VALUES
  ('Ta bort gamla kampanjskyltar och extraprisskyltar', false, 1),
  ('Sätt upp nya kampanjskyltar per kampanjplan', false, 2),
  ('Kontrollera att kampanjprodukter är framme och tillgängliga', false, 3),
  ('Kontrollera att kassan/priset stämmer med skyltens pris', false, 4),
  ('Kontrollera att kampanjdisplayer är välsorterade och fylla på', false, 5),
  ('Fotografera ny kampanjuppställning för dokumentation', true, 6)
) AS item(label, photo, ord);

-- ── Kundrunda common defects: FRYS zone additional defects ───────────────────
-- Add additional checkpoint-specific defects for freezer zone checkpoints

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Temperaturavvikelse (varmare än -18°C)', 10
FROM kundrunda_checkpoints WHERE label ILIKE '%frys%temperatur%';

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Produkter med passerat eller nära datum', 11
FROM kundrunda_checkpoints WHERE label ILIKE '%frysdisk%' OR label ILIKE '%frysvaror%';

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Frost/isbildning i disken', 12
FROM kundrunda_checkpoints WHERE label ILIKE '%frys%';

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Lock/dörr stängs inte ordentligt', 13
FROM kundrunda_checkpoints WHERE label ILIKE '%frys%';

-- ── Kundrunda common defects: KYL zone additional defects ───────────────────

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Temperaturavvikelse (varmare än 8°C)', 10
FROM kundrunda_checkpoints WHERE label ILIKE '%kyl%temperatur%';

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'FIFO-ordning följs inte (gammalt bak)', 11
FROM kundrunda_checkpoints WHERE label ILIKE '%mejeri%' OR label ILIKE '%chark%' OR label ILIKE '%färsk%';

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Produkt med passerat datum på hyllan', 12
FROM kundrunda_checkpoints WHERE label ILIKE '%mejeri%' OR label ILIKE '%chark%' OR label ILIKE '%färsk%';
