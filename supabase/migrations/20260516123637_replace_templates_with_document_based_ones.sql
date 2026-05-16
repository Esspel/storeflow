/*
  # Replace checklist templates with document-based ones

  ## Summary
  Removes all templates that have no connection to the four attached Coop documents
  and replaces them with accurate, detailed templates derived directly from:
  1. Arc Safety Quick Guide (Picadeli salladsbar)
  2. Varumottagning v.12 (Goods receiving)
  3. Rengöring pantstation v.1 (Bottle station cleaning)
  4. Rengöring ordning och reda (General store cleaning/order)

  ## Templates removed
  All templates not traceable to the four source documents.

  ## Templates added
  - Picadeli salladsbar — daglig öppningskontroll (ArcSafety)
  - Picadeli salladsbar — daglig stängningskontroll (ArcSafety)
  - Picadeli salladsbar — veckorengöring (ArcSafety)
  - Picadeli salladsbar — varannan vecka & månadsrengöring (ArcSafety)
  - Picadeli salladsbar — varumottagning (ArcSafety)
  - Varumottagning — inkommande leveranskontroll (Varumottagning v.12)
  - Varumottagning — temperaturkontroll kyl & frys (Varumottagning v.12)
  - Varumottagning — KRAV/EKO/MSC-kontroll (Varumottagning v.12)
  - Pantstation — daglig rengöring (Rengöring pantstation v.1)
  - Butik — rengöringsutrustning & kemikalier (Rengöring ordning och reda)
  - Butik — diskmaskinkontroll (Rengöring ordning och reda)
*/

-- ============================================================
-- STEP 1: Delete all template steps/questions for old templates
-- ============================================================

DELETE FROM checklist_template_items
WHERE template_id IN (
  SELECT id FROM checklist_templates
  WHERE id NOT IN (
    -- Keep only the ones we want to repurpose (none — full clean slate)
    SELECT id FROM checklist_templates WHERE false
  )
);

DELETE FROM checklist_template_questions
WHERE template_id IN (
  SELECT id FROM checklist_templates
  WHERE id NOT IN (
    SELECT id FROM checklist_templates WHERE false
  )
);

-- ============================================================
-- STEP 2: Remove all old templates
-- ============================================================

DELETE FROM checklist_templates;

-- ============================================================
-- STEP 3: Insert new document-based templates
-- ============================================================

-- Template 1: Picadeli salladsbar — daglig öppningskontroll
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Picadeli salladsbar — daglig öppningskontroll',
    'Livsmedelssäkerhet',
    'Daglig kontroll av Picadeli salladsbar innan öppning. Baserad på ArcSafety Quick Guide. Utförs varje dag.',
    'Hög',
    'FREQ=DAILY',
    ARRAY[1,2,3,4,5,6,7],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Kontrollera handenheten — finns det larm?', false, 1),
  ((SELECT id FROM t), 'Kontrollera temperaturen i salladsbaren — max +8°C', false, 2),
  ((SELECT id FROM t), 'Rengör alla ytor i salladsbaren', false, 3),
  ((SELECT id FROM t), 'Ta bort locken från produkterna i salladsbaren', false, 4),
  ((SELECT id FROM t), 'Sätt fast besticken', false, 5),
  ((SELECT id FROM t), 'Kassera produkter som inte är fräscha', false, 6),
  ((SELECT id FROM t), 'Töm kondensvattenbehållaren vid behov', false, 7),
  ((SELECT id FROM t), 'Kontrollera att huvar och dörrar stängs korrekt', false, 8);

-- Template 2: Picadeli salladsbar — daglig stängningskontroll
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Picadeli salladsbar — daglig stängningskontroll',
    'Livsmedelssäkerhet',
    'Daglig avstängningsrutin för Picadeli salladsbar. Baserad på ArcSafety Quick Guide.',
    'Hög',
    'FREQ=DAILY',
    ARRAY[1,2,3,4,5,6,7],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Rengör besticken', false, 1),
  ((SELECT id FROM t), 'Sätt på rena lock på kantinerna', false, 2),
  ((SELECT id FROM t), 'Starta produkter på upptining (frysta produkter för morgondagen)', false, 3),
  ((SELECT id FROM t), 'Sätt handenheten på laddning över natten', false, 4),
  ((SELECT id FROM t), 'Stäng huvar och dörrar', false, 5);

-- Template 3: Picadeli salladsbar — veckorengöring
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Picadeli salladsbar — veckorengöring',
    'Rengöring',
    'Veckovis grundrengöring av Picadeli salladsbar. Dokumenteras i handenheten. Baserad på ArcSafety Quick Guide.',
    'Hög',
    'FREQ=WEEKLY',
    ARRAY[1],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Sätt på rena lock på alla kantiner', false, 1),
  ((SELECT id FROM t), 'Ta bort alla produkter ur salladsbaren', false, 2),
  ((SELECT id FROM t), 'Förvara produkterna kallt under rengöringen', false, 3),
  ((SELECT id FROM t), 'Rengör alla delar i salladsbaren', true, 4),
  ((SELECT id FROM t), 'Rengör själva salladsbaren invändigt', true, 5),
  ((SELECT id FROM t), 'Skölj eller dammsug filtret', false, 6),
  ((SELECT id FROM t), 'Rengör under salladsbaren', true, 7),
  ((SELECT id FROM t), 'Dokumentera rengöringen i handenheten', false, 8);

-- Template 4: Picadeli salladsbar — varannan vecka & månadsrengöring
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Picadeli salladsbar — toppingdispenser & kylutrymme',
    'Rengöring',
    'Varannan vecka: rengör toppingdispensrar. Månadsvis: rengör kylutrymme och dörrar, dammsug startenheten. Dokumenteras i handenheten.',
    'Medel',
    'FREQ=WEEKLY',
    ARRAY[1],
    2,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), '[Varannan vecka] Rengör toppingdispensrarna', true, 1),
  ((SELECT id FROM t), '[Varannan vecka] Rengör toppingdispenser om den är tom', false, 2),
  ((SELECT id FROM t), '[Månadsvis] Rengör kylutrymmet inklusive dörrarna i salladsbaren', true, 3),
  ((SELECT id FROM t), '[Månadsvis] Dammsug startenheten', false, 4),
  ((SELECT id FROM t), 'Dokumentera rengöringen i handenheten', false, 5);

-- Template 5: Picadeli salladsbar — varumottagning & påfyllning
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Picadeli salladsbar — varumottagning & påfyllning',
    'Livsmedelssäkerhet',
    'Kontroll vid mottagning och påfyllning av Picadeli-produkter. Baserad på ArcSafety Quick Guide.',
    'Hög',
    NULL,
    NULL,
    NULL,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Kontrollera att du har fått rätt antal av varje artikel', false, 1),
  ((SELECT id FROM t), 'Mät temperaturen: kylda varor max +8°C, frysta under -15°C', false, 2),
  ((SELECT id FROM t), 'Kontrollera att förpackningar är hela och rena', false, 3),
  ((SELECT id FROM t), 'Förvara frysta produkter vid -18°C, kylda vid max +8°C', false, 4),
  ((SELECT id FROM t), 'Scanna QR-koden på varje kantin innan den placeras i salladsbaren', false, 5),
  ((SELECT id FROM t), 'Kylda kantiner: ta bort plastförsegling och placera i salladsbaren', false, 6),
  ((SELECT id FROM t), 'Frysta kantiner: använd upptiningsappen, tina i kyl max +8°C', false, 7),
  ((SELECT id FROM t), 'Plaspåse/pouch: öppna med ren sax, häll i ren engångskantin', false, 8),
  ((SELECT id FROM t), 'Dressingflaska: scanna QR-kod och placera i dressingflaskhållaren', false, 9),
  ((SELECT id FROM t), 'Topping: scanna QR-kod, öppna med ren sax, häll i kantin/dispenser', false, 10);

-- Template 6: Varumottagning — inkommande leveranskontroll
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Varumottagning — inkommande leveranskontroll',
    'Lager',
    'Kontroll av inkommande leverans enligt rutin 12. Varumottagning v.12. Dokumenteras i Coops egenkontrollsystem minst 2 ggr/vecka.',
    'Hög',
    NULL,
    NULL,
    NULL,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Antal pallar/kolli stämmer mot fraktsedeln', false, 1),
  ((SELECT id FROM t), 'Inga synliga skador på produkterna', false, 2),
  ((SELECT id FROM t), 'Temperaturkontroll utförd (kylda max +8°C, frysta max -15°C)', false, 3),
  ((SELECT id FROM t), 'Förpackningar hela och rena, inga öppna eller otäta förpackningar', false, 4),
  ((SELECT id FROM t), 'Inga tecken på skadedjur', false, 5),
  ((SELECT id FROM t), 'Inspekterat mellan frukt- och grönsakskartonger (riskzon)', false, 6),
  ((SELECT id FROM t), 'Färskvaror kontrollerade: skick och fräschhet', false, 7),
  ((SELECT id FROM t), 'Märkning kontrollerad: kontaktuppgifter, allergener, svenska, bäst-före', false, 8),
  ((SELECT id FROM t), 'Fraktsedel signerad av Coop-personal och chaufför', false, 9),
  ((SELECT id FROM t), 'Avvikelser dokumenterade på fraktsedeln', false, 10),
  ((SELECT id FROM t), 'Varor transporterade direkt till rätt plats efter mottagning', false, 11);

-- Template 7: Varumottagning — temperaturkontroll vid misstänkt avvikelse
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Varumottagning — temperaturavvikelse kyl & frys',
    'HACCP',
    'Utökad temperaturkontroll vid misstänkt temperaturavvikelse på inkommande leverans. Baserad på rutin 12.2.4 Varumottagning v.12.',
    'Kritisk',
    NULL,
    NULL,
    NULL,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Förkyla termometern innan mätning', false, 1),
  ((SELECT id FROM t), 'Mät alla misstänkta pallar i diagonalmönster', true, 2),
  ((SELECT id FROM t), 'Dokumentera varje mätpunkt med foto och text (ex. "pall 1, övre högra hörnet")', true, 3),
  ((SELECT id FROM t), 'Vid kvarstående misstanke: utför destruktiv mätning (sond i produkten)', true, 4),
  ((SELECT id FROM t), 'Rengör termometern med desinfektionsservett mellan produkter', false, 5),
  ((SELECT id FROM t), 'Signera fraktsedeln', false, 6),
  ((SELECT id FROM t), 'Kontakta Butiksservice för reklamation', false, 7),
  ((SELECT id FROM t), 'Dokumentera avvikelsen i egenkontrollsystemet', false, 8),
  ((SELECT id FROM t), 'Förvara reklamerade produkter korrekt och märk tydligt', false, 9);

-- Template 8: Varumottagning — KRAV/EKO/MSC-kontroll
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Varumottagning — KRAV / EKO / MSC-kontroll',
    'Livsmedelssäkerhet',
    'Kontroll av ekologiska, KRAV- och MSC/ASC-certifierade produkter vid mottagning. Baserad på rutin 12.2.3 Varumottagning v.12. Dokumenteras i egenkontrollsystemet minst 1 ggr/vecka.',
    'Medel',
    'FREQ=WEEKLY',
    ARRAY[1,2,3,4,5],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'KRAV/EKO: Bekräfta att leveransnoten anger KRAV/EKO-certifiering', false, 1),
  ((SELECT id FROM t), 'KRAV/EKO: Kontrollorgankod finns på produkten (SE-EKO-NN eller XX-BIO-NN)', false, 2),
  ((SELECT id FROM t), 'KRAV/EKO: Märkning stämmer med order (ekologiska varor levererade)', false, 3),
  ((SELECT id FROM t), 'KRAV/EKO: EU-ekologisk logotyp finns på förförpackade varor', false, 4),
  ((SELECT id FROM t), 'KRAV/EKO: Ursprungsangivelse finns på EU-logon (sv. jord., EU-jord., etc.)', false, 5),
  ((SELECT id FROM t), 'MSC/ASC: Korrekt märkning på fisk och fiskprodukter', false, 6),
  ((SELECT id FROM t), 'MSC/ASC: MSC/ASC-fisk förvarad separat från konventionell fisk vid mottagning', false, 7),
  ((SELECT id FROM t), 'Avvikelse i märkning fotograferad och rapporterad till Butiksservice', true, 8);

-- Template 9: Pantstation — daglig rengöring
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Pantstation — daglig rengöring',
    'Rengöring',
    'Daglig rengöring av pantstation/returstation. Baserad på Arbetsmall rengöring pantstation v.1. Rengöringsmedel beställs via IVT.',
    'Medel',
    'FREQ=DAILY',
    ARRAY[1,2,3,4,5,6,7],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Handtvägsstation: rengör och fyll på med papper och tvål', false, 1),
  ((SELECT id FROM t), 'Golv: sopa och skrubba eller maskinskurra alla fria golvytor', false, 2),
  ((SELECT id FROM t), 'Väggar: spraya med allrengöring, skölj med varmt vatten eller torka av', false, 3),
  ((SELECT id FROM t), 'Pantmaskinens utsida: spraya med allrengöring och torka', false, 4),
  ((SELECT id FROM t), 'Flaskkorg/-behållare: rengör enligt tillverkarens anvisningar', false, 5),
  ((SELECT id FROM t), 'Pantmaskinens insida: rengör enligt tillverkarens anvisningar', false, 6),
  ((SELECT id FROM t), 'Transportband: rengör enligt tillverkarens anvisningar', false, 7),
  ((SELECT id FROM t), 'Kontrollera att stationen är ren och presentabel', true, 8);

-- Template 10: Butik — rengöringsutrustning & kemikalier kontroll
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Butik — rengöringsutrustning & kemikalier',
    'Rengöring',
    'Veckovis kontroll av rengöringsutrustning och kemikaliehantering. Baserad på rutin 5. Rengöring ordning och reda.',
    'Medel',
    'FREQ=WEEKLY',
    ARRAY[1],
    1,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Rengöringsutrustning är ren och hel', false, 1),
  ((SELECT id FROM t), 'All utrustning förvaras på anvisad plats', false, 2),
  ((SELECT id FROM t), 'Moppar och skrapor hängs upp för effektiv torkning', false, 3),
  ((SELECT id FROM t), 'Förvaringsutrymmet är rent och välhållet', false, 4),
  ((SELECT id FROM t), 'Färgkodad/märkt utrustning används korrekt per zon (mat vs. toalett vs. butiksgolv)', false, 5),
  ((SELECT id FROM t), 'Utrustning för livsmedelshantering förvaras separat från säljytan', false, 6),
  ((SELECT id FROM t), 'Kemikalier är tydligt märkta med innehåll', false, 7),
  ((SELECT id FROM t), 'Kemikalier förvaras separerat från livsmedel (ej på bänkskivor/hyllor ovanför)', false, 8),
  ((SELECT id FROM t), 'Produktfakta- och säkerhetsdatablad finns tillgängliga för alla kemikalier', false, 9),
  ((SELECT id FROM t), 'Gamla kemikalier kasserade enligt förpackningens anvisningar', false, 10);

-- Template 11: Butik — diskmaskinskontroll (kvartalsvis)
WITH t AS (
  INSERT INTO checklist_templates (title, category, description, priority, recurrence_rule, recurrence_days, recurrence_interval, due_date_offset)
  VALUES (
    'Butik — diskmaskinskontroll (kvartalsvis)',
    'HACCP',
    'Kvartalsvis kontroll av diskmaskinens sköljtemperatur. Minst +80°C på sköljvattnet. Baserad på rutin 5.4.7 Rengöring ordning och reda.',
    'Hög',
    'FREQ=MONTHLY',
    ARRAY[1],
    3,
    0
  )
  RETURNING id
)
INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
  ((SELECT id FROM t), 'Placera en skål upprätt för att samla vatten under sköljcykeln', false, 1),
  ((SELECT id FROM t), 'Kör en diskningscykel', false, 2),
  ((SELECT id FROM t), 'Mät temperaturen på det kvarvarande vattnet i skålen', false, 3),
  ((SELECT id FROM t), 'Temperaturen är minst +80°C (annars kontakta servicebolag)', false, 4),
  ((SELECT id FROM t), 'Dokumentera resultatet: vem utförde, metod och uppmätt temperatur', false, 5),
  ((SELECT id FROM t), 'Använd tjocka handskar vid hantering av hett vatten', false, 6);
