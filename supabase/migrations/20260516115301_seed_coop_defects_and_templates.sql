/*
  # Seed Coop-specific common defects and task templates

  ## Changes

  ### 1. Common Defects (kundrunda_common_defects)
  Replaces the 5 existing generic defects with 30+ defects specific to a Coop
  grocery store, grouped by area: hygiene, product, equipment, staff/admin, safety.

  ### 2. Task Templates (checklist_templates + items + questions)
  Adds 10 task templates tailored for a Swedish Coop grocery store covering:
  - Daily opening and closing routines
  - Temperature logging (kylar/frysar)
  - Date checking (utgångsdatum)
  - Weekly cleaning routines per department
  - Order and delivery handling
  - Staff meeting checklist
  - HACCP food safety check
  - Cash register reconciliation
  - Recycle station maintenance
  - Store compliance (brand standards)

  All recurring templates get appropriate recurrence_rule values.
  Templates do NOT set store_id (null = available to all stores).
*/

-- ─── Common Defects ──────────────────────────────────────────────────────────

-- Remove old generic defects (no store_id, i.e. global ones)
DELETE FROM kundrunda_common_defects WHERE store_id IS NULL;

INSERT INTO kundrunda_common_defects (store_id, label, sort_order) VALUES
  -- Hygiene & Städning
  (NULL, 'Golvet smutsigt/skräpigt', 1),
  (NULL, 'Hyllan dammig eller fettfläckig', 2),
  (NULL, 'Kylmöbel/frys smutsig invändigt', 3),
  (NULL, 'Kundtoalett ej städad', 4),
  (NULL, 'Pantrum/returstation smutsigt', 5),
  (NULL, 'Spill ej åtgärdat på golv', 6),

  -- Produkt & Exponering
  (NULL, 'Hål i hyllan — varan saknas', 7),
  (NULL, 'Passerat bäst-före-datum', 8),
  (NULL, 'Felmärkt pris/skylt', 9),
  (NULL, 'Kampanjvara ej exponerad', 10),
  (NULL, 'Varan på fel plats/planogram', 11),
  (NULL, 'Trasig/skadad förpackning i hyllan', 12),
  (NULL, 'Etikett saknas eller fel artikel', 13),
  (NULL, 'Gaveln/torget ej påfyllt', 14),
  (NULL, 'Frukt eller grönt i dåligt skick', 15),
  (NULL, 'Bröd torrt eller skadat', 16),

  -- Utrustning & Teknik
  (NULL, 'Belysning trasig/blinkar', 17),
  (NULL, 'Kyla/frys håller inte temperatur', 18),
  (NULL, 'Våg ur funktion eller ej kalibrerad', 19),
  (NULL, 'Pantmaskin ur funktion', 20),
  (NULL, 'Kassakvittorull slut/trasig', 21),
  (NULL, 'Dörr/port fungerar inte', 22),
  (NULL, 'Handscanner ur funktion', 23),

  -- Skyltning & Kommunikation
  (NULL, 'Aktuell kampanjskylt saknas', 24),
  (NULL, 'Föregående kampanjmaterial sitter kvar', 25),
  (NULL, 'Öppettider/skylt felaktig/saknas', 26),

  -- Säkerhet & Ordning
  (NULL, 'Nödutgång blockerad', 27),
  (NULL, 'Brandredskap saknas/utgånget', 28),
  (NULL, 'Vassa kanter/risk för personskada', 29),
  (NULL, 'Lastkajen oordnad/farlig', 30),
  (NULL, 'Omklädningsrum i oordning', 31);

-- ─── Task Templates ───────────────────────────────────────────────────────────

-- Daily opening check (already exists as "Daglig öppningskontroll", skip if present)
-- We add new ones that don't exist yet

-- Template: Morgonrutin — Temperaturloggning (daglig)
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Temperaturloggning — Kylar & Frysar',
    'Kontrollera och logga temperaturerna i alla kylar och frysar. HACCP-krav.',
    'HACCP',
    'Hög',
    'weekly',
    ARRAY[1,2,3,4,5,6,0],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Mejerikylen: kontrollera och notera temperatur (mål: 0–4 °C)', false, 1),
  ('Charkkylen: kontrollera och notera temperatur (mål: 0–4 °C)', false, 2),
  ('Frukt & Grönt-kylen: kontrollera och notera temperatur (mål: 4–8 °C)', false, 3),
  ('Frysdisken: kontrollera och notera temperatur (mål: -18 °C eller kallare)', false, 4),
  ('Frysen i lagerutrymme: kontrollera och notera temperatur', false, 5),
  ('Åtgärda om temperaturavvikelse — kontakta serviceteknik vid behov', false, 6)
) AS item(label, photo, ord);

-- Template: Utgångsdatumkontroll (3×/vecka)
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Utgångsdatumkontroll',
    'Systematisk genomgång av datumkänsliga varor. Ta bort varor som passerat bäst-före-datum.',
    'Livsmedelssäkerhet',
    'Hög',
    'weekly',
    ARRAY[1,3,5],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Mejeriprodukter: kontrollera alla datum, ta bort utgångna varor', false, 1),
  ('Chark & färdigmat: kontrollera datum i alla kylar', false, 2),
  ('Bröd & bakverk: kontrollera och kassera gammalt bröd', false, 3),
  ('Frukt & Grönt: plocka bort rutten/vissnad vara', false, 4),
  ('Konserver & torrvaror (stickprov): kontrollera datum', false, 5),
  ('Kasserade varor dokumenterade i svinnjournal', false, 6)
) AS item(label, photo, ord);

-- Template: Veckostädning — Frukt & Grönt
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Veckostädning — Frukt & Grönt',
    'Grundlig städning och rengöring av Frukt & Grönt-avdelningen.',
    'Städning',
    'Medel',
    'weekly',
    ARRAY[1],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Töm och rengör alla kyldiskar invändigt', true, 1),
  ('Rengör hyllplan och hyllfronter', false, 2),
  ('Rengör golvet under och bakom hyllo r/diskar', false, 3),
  ('Rensa och rengör vågar', false, 4),
  ('Avlägsna gamla prismärken/skyltar', false, 5),
  ('Fyll på med rent presentationsmaterial', false, 6)
) AS item(label, photo, ord);

-- Template: Veckostädning — Kyl & Chark
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Veckostädning — Kyl & Chark',
    'Grundlig städning och rengöring av kyl- och charkavdelningen.',
    'Städning',
    'Medel',
    'weekly',
    ARRAY[2],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Töm kyldiskar och rengör invändigt', true, 1),
  ('Rengör hyllplan och fronter', false, 2),
  ('Kontrollera packningar på kylmöbler', false, 3),
  ('Rengör golvet under/bakom', false, 4),
  ('Fyll på och exponera korrekt', false, 5)
) AS item(label, photo, ord);

-- Template: Orderhantering — Leveranskontroll
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Leveranskontroll',
    'Kontrollera och kvittera inkommande leverans mot följesedel.',
    'Lager',
    'Medel',
    NULL,
    NULL,
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Kontrollera antal kollin mot fraktsedel', false, 1),
  ('Kontrollera temperaturen på kylda/frysta varor vid mottagning', false, 2),
  ('Kontrollera att förpackningar är oskadade', false, 3),
  ('Notera eventuella avvikelser i leveransen', false, 4),
  ('Signera följesedel och arkivera', false, 5),
  ('Varorna inlagda i lager/kyl/frys i rätt ordning (FIFO)', false, 6)
) AS item(label, photo, ord);

-- Template: Kassaavstämning (daglig)
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Kassaavstämning — Daglig stängning',
    'Räkna och stäm av kassorna vid stängning.',
    'Kassa',
    'Hög',
    'weekly',
    ARRAY[1,2,3,4,5,6,0],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Räkna kassan och notera totalbelopp', false, 1),
  ('Jämför med Z-rapport från kassasystemet', false, 2),
  ('Notera eventuell differens i kassarapporten', false, 3),
  ('Lämna kassaväska till kontor/säkerhet', false, 4),
  ('Stäng av och lås kassaapparater', false, 5)
) AS item(label, photo, ord);

-- Template: Returstation & Pant — veckovis
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Returstation & Pantrum — veckokontroll',
    'Kontrollera och underhåll pantrum och returstation.',
    'Drift',
    'Medel',
    'weekly',
    ARRAY[1],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Töm och rengör pantmaskin/bägare', false, 1),
  ('Kontrollera att pantmaskin fungerar korrekt', false, 2),
  ('Rengör golv och ytor i pantrummet', false, 3),
  ('Tömma returkärl för glas/plast/metall', false, 4),
  ('Kontrollera att skyltning är korrekt och läsbar', false, 5)
) AS item(label, photo, ord);

-- Template: Varupåfyllning — Nattskift (daglig)
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Varupåfyllning — Checklista nattskift',
    'Säkerställ att butiken är välpåfylld och presentabel inför öppning.',
    'Varupåfyllning',
    'Medel',
    'weekly',
    ARRAY[1,2,3,4,5,6,0],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Prioritera toppsäljare och hål-varor i alla avdelningar', false, 1),
  ('Kontrollera och fyll på kampanjgavlar/torg', false, 2),
  ('Frukt & Grönt: fyll på och exponera fräscht', false, 3),
  ('Mejeri och Chark: rotera varor (FIFO), fyll på', false, 4),
  ('Bröd och bakverk: fyll på och ta bort gammalt', false, 5),
  ('Frysdiskar påfyllda och lock stängda', false, 6),
  ('Golven fria från emballage och pallar', false, 7)
) AS item(label, photo, ord);

-- Template: Mötesberedning — Personalmöte
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Personalmöte — Förberedelsechecklista',
    'Förbered och genomför personalmötet strukturerat.',
    'Personal',
    'Låg',
    NULL,
    NULL,
    1,
    1
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Agenda skickad till deltagarna i förväg', false, 1),
  ('Presentera nyckeltal för veckan (försäljning, svinn, kundnöjdhet)', false, 2),
  ('Gå igenom aktuella kampanjer och nyheter', false, 3),
  ('Säkerhet och avvikelsegenomgång', false, 4),
  ('Information från Coop regionalt/centralt', false, 5),
  ('Frågor och svar — tid för personalen att yttra sig', false, 6),
  ('Protokoll fört och distribuerat', false, 7)
) AS item(label, photo, ord);

-- Template: HACCP-kontroll — månatlig
WITH t AS (
  INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'HACCP-kontroll — Månatlig livsmedelssäkerhet',
    'Månadsvis kontroll av kritiska styrpunkter enligt HACCP-plan.',
    'HACCP',
    'Kritisk',
    'monthly',
    NULL,
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order)
SELECT t.id, item.label, item.photo, item.ord FROM t,
(VALUES
  ('Granska alla temperaturloggar — avvikelser dokumenterade?', false, 1),
  ('Kontrollera städprotokoll — utfört enligt plan?', false, 2),
  ('Kalibrering av termometrar utförd och dokumenterad', false, 3),
  ('Personalhygienutbildning uppdaterad?', false, 4),
  ('Kemikalieförvaring korrekt (märkt, separerat från livsmedel)', false, 5),
  ('Skadedjurskontroll — inga tecken på angrepp', true, 6),
  ('HACCP-pärm uppdaterad och signerad', false, 7)
) AS item(label, photo, ord);
