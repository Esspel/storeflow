/*
  # Seed Coop-specifika checklistmallar

  Lägger till mallar anpassade för Coop-butikerna i Torshälla och Skogstorp,
  med explicita referenser till de system som används:
  - Upshop (datumkontroll)
  - GetCompliant (egenkontroll)
  - Rational Connected Cooking (Torshälla)
  - RDM / Danfoss (kylövervakning)
  - SAP FnR / CAO / Blue Yonder (orderhantering)
  - SoftOne GO (HR/lön)
  - Tomra (pantmaskin)
  - Attensi Skills (utbildning)
  - Relesys (personalkommunikation)
  - IA-systemet (arbetsmiljö)
  - Store Office / GK (kassasystem)

  ## Nya mallar
  1. Rational Connected Cooking — daglig kycklingkontroll (Torshälla)
  2. Kylövervakning RDM/Danfoss — larmkontroll
  3. CAO-avvikelsekontroll (SAP / Blue Yonder)
  4. SoftOne GO — schemaavstämning
  5. Tomra — månadsservice pantmaskin
  6. Attensi Skills — utbildningsuppföljning
  7. Store Office — kassakontroll (daglig stängning)
  8. Öppningskontroll — daglig checklista
  9. Upshop datumkontroll — utökad veckovis
  10. GetCompliant — månatlig egenkontrllsgenomgång
*/

DO $$
DECLARE
  torshalla_id uuid := 'efcbf51d-9352-4d76-8127-22f42d951e4e';
  skogstorp_id uuid := '33e9550f-e913-4afb-be0e-bae48b7100b9';
  tmpl_id uuid;
BEGIN

  -- 1. Rational Connected Cooking — daglig kycklingkontroll (Torshälla only)
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Rational — Daglig kycklingkontroll' AND category = 'Varmkök') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Rational — Daglig kycklingkontroll',
      'Daglig kontroll av Rational Connected Cooking-ugnen för grillad kyckling. Kontrollera program, kärntemperatur och rengöringsprotokoll.',
      'Varmkök', 'Hög', 'daily', ARRAY[1,2,3,4,5,6,7], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Rational-ugn: Kontrollera att dagsprogram är korrekt inläst', false, 1),
      (tmpl_id, 'Kyckling: Mät kärntemperatur ≥ 75 °C med termometer', true, 2),
      (tmpl_id, 'Rational-ugn: Rengöring utförd (SelfCooking Center-program)', false, 3),
      (tmpl_id, 'Wraptech/Ishida-våg: Kontrollera kalibrering och etikettutskrift', false, 4),
      (tmpl_id, 'Kontrollera att kycklingdisken är påfylld och prismärkt korrekt', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Var kärntemperaturen godkänd (≥ 75 °C)?', 'yes_no', true, 1),
      (tmpl_id, 'Noterade avvikelser från Rational-ugnen?', 'text', false, 2);
  END IF;

  -- 2. Kylövervakning — larmkontroll (Torshälla: RDM/Wica/Arneg, Skogstorp: Danfoss)
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Kylövervakning — daglig larmkontroll' AND category = 'Kyl/Frys') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Kylövervakning — daglig larmkontroll',
      'Torshälla: Kontrollera RDM (Resource Data Management) för Wica/Arneg-kyl och frysar. Skogstorp: Kontrollera Danfoss-systemet. Stäm av att inga aktiva larm finns.',
      'Kyl/Frys', 'Kritisk', 'daily', ARRAY[1,2,3,4,5,6,7], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Torshälla — RDM: Kontrollera aktiva larm på övervakningsterminal', false, 1),
      (tmpl_id, 'Skogstorp — Danfoss: Kontrollera aktiva larm i styrpanel', false, 2),
      (tmpl_id, 'Kontrollera att alla kylaggregat visar rätt temperatur (kyl ≤ +4 °C, frys ≤ -18 °C)', true, 3),
      (tmpl_id, 'Kontrollera att kyldiskar och frysboxar är stängda/hela', false, 4),
      (tmpl_id, 'Vid larm: Felanmäl till drifttekniker och dokumentera avvikelse i StoreFlow', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Fanns aktiva larm vid kontrolltillfället?', 'yes_no', true, 1),
      (tmpl_id, 'Beskriv eventuella avvikelser och åtgärder', 'text', false, 2);
  END IF;

  -- 3. CAO-avvikelsekontroll (SAP / Blue Yonder / JDA)
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'CAO-avvikelsekontroll (SAP / Blue Yonder)' AND category = 'Lager') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'CAO-avvikelsekontroll (SAP / Blue Yonder)',
      'Daglig genomgång av CAO-förslag (Coop Automat Order) i SAP S/4 med FnR. Kontrollera att orderförslag stämmer och att Blue Yonder/JDA-parametrar är korrekta.',
      'Lager', 'Hög', 'daily', ARRAY[1,2,3,4,5], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'SAP: Logga in och öppna CAO-orderförslag för dagen', false, 1),
      (tmpl_id, 'Granska och godkänn/justera orderförslag för samtliga avdelningar', false, 2),
      (tmpl_id, 'Kontrollera Open Access: Aktiverade tillvalsartiklar stämmer med planogram', false, 3),
      (tmpl_id, 'Säsongsordrar (jul/påsk/halloween via Mitt Coop tidig förhand): Bekräfta status', false, 4),
      (tmpl_id, 'Kontrollera att lagersaldon i Store Office stämmer mot SAP', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Gjordes manuella justeringar av CAO-förslag?', 'yes_no', true, 1),
      (tmpl_id, 'Notera eventuella avvikelser eller artiklar med onormala ordervolymer', 'text', false, 2);
  END IF;

  -- 4. Tomra — månadskontroll pantmaskin
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Tomra — månadskontroll pantmaskin' AND category = 'Drift') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Tomra — månadskontroll pantmaskin',
      'Månadsvis service och kontroll av Tomra-pantmaskinen. Rengöring, felloggar och kontroll av utbetalningsfunktion.',
      'Drift', 'Medel', 'monthly', ARRAY[]::integer[], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Tomra: Kontrollera felloggar sedan förra kontrollen', false, 1),
      (tmpl_id, 'Tomra: Rengör insida, band och sorteringsdel', true, 2),
      (tmpl_id, 'Tomra: Kontrollera att kvittoutskrift och Coop-app-utbetalning fungerar', false, 3),
      (tmpl_id, 'Kontrollera pantrum: Rent, inga påsar kvar, flöde till pressning fungerar', true, 4),
      (tmpl_id, 'Tomra: Testa en provpantning och verifiera korrekt belopp', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Fungerade maskinen utan fel under kontrollen?', 'yes_no', true, 1),
      (tmpl_id, 'Notera eventuella fel eller serviceärenden', 'text', false, 2);
  END IF;

  -- 5. Attensi Skills — månadsvis utbildningsuppföljning
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Attensi Skills — utbildningsuppföljning' AND category = 'Personal') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Attensi Skills — utbildningsuppföljning',
      'Månadsvis uppföljning av personalens Attensi Skills-utbildningar (Frukt & Grönt m.fl.). Kontrollera slutföringsgrader och påminn om utestående moduler.',
      'Personal', 'Medel', 'monthly', ARRAY[]::integer[], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Attensi Skills: Logga in som chef och granska slutföringsrapport', false, 1),
      (tmpl_id, 'Identifiera personal som ej slutfört obligatoriska moduler (Frukt & Grönt)', false, 2),
      (tmpl_id, 'Skicka påminnelse via Relesys till personal med utestående utbildning', false, 3),
      (tmpl_id, 'Kontrollera om nya moduler har publicerats — aktivera relevanta', false, 4),
      (tmpl_id, 'Dokumentera slutföringsgrad denna månad i StoreFlow', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Har all personal slutfört obligatoriska Attensi-moduler?', 'yes_no', true, 1),
      (tmpl_id, 'Antal personal med utestående moduler (ange 0 om ingen)', 'text', true, 2);
  END IF;

  -- 6. SoftOne GO — schemaavstämning veckovis
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'SoftOne GO — veckovis schemaavstämning' AND category = 'Personal') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'SoftOne GO — veckovis schemaavstämning',
      'Veckovis genomgång av SoftOne GO för att stämma av schema, frånvaro och övertid. Kontrollera att kommande veckas schema är publicerat i Relesys.',
      'Personal', 'Hög', 'weekly', ARRAY[5], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'SoftOne GO: Granska frånvaroanmälningar och godkänn/neka', false, 1),
      (tmpl_id, 'SoftOne GO: Kontrollera att kommande veckas schema är komplett', false, 2),
      (tmpl_id, 'SoftOne GO: Kontrollera övertid och eventuella schemakrockar', false, 3),
      (tmpl_id, 'Relesys: Publicera schema om det inte redan är publicerat', false, 4),
      (tmpl_id, 'Kontrollera att timanställdas pass stämmer med bemanningsbehov', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Är kommande veckas schema fullbemannat?', 'yes_no', true, 1),
      (tmpl_id, 'Beskriv eventuella bemanningsluckor och hur de ska fyllas', 'text', false, 2);
  END IF;

  -- 7. IA-systemet — månadsvis arbetsmiljörond
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'IA-systemet — månadsvis arbetsmiljörond' AND category = 'Arbetsmiljö') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'IA-systemet — månadsvis arbetsmiljörond',
      'Månadsvis skyddsrond och uppföljning av rapporterade tillbud i IA-systemet (Prevent). Säkerställ att alla tillbud är hanterade och att åtgärdsplaner är uppdaterade.',
      'Arbetsmiljö', 'Hög', 'monthly', ARRAY[]::integer[], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'IA-systemet: Granska alla öppna tillbud och riskobservationer', false, 1),
      (tmpl_id, 'IA-systemet: Säkerställ att ansvarig är tilldelad och åtgärdsplan finns', false, 2),
      (tmpl_id, 'Skyddsrond: Gå igenom butiken med skyddsombud', false, 3),
      (tmpl_id, 'RCO: Kontrollera att larm- och passersystem fungerar (Torshälla: M-Card)', false, 4),
      (tmpl_id, 'Kontrollera att nödutgångar, brandsläckare och förbandslådor är tillgängliga', true, 5),
      (tmpl_id, 'Rapportera nya tillbud i IA-systemet om sådana uppstått under månaden', false, 6);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Finns öppna tillbud äldre än 30 dagar utan åtgärdsplan?', 'yes_no', true, 1),
      (tmpl_id, 'Sammanfatta observationer från skyddsronden', 'text', true, 2);
  END IF;

  -- 8. Upshop — utökad veckovis datumkontroll
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Upshop — veckovis datumkontroll (utökad)' AND category = 'Livsmedelssäkerhet') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Upshop — veckovis datumkontroll (utökad)',
      'Veckovis utökad datumkontroll med Upshop (datumboken) och Zebra TC52. Kontrollera alla avdelningar och skriv ut markeringslappar via Zebra-skrivare.',
      'Livsmedelssäkerhet', 'Kritisk', 'weekly', ARRAY[1], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Upshop / Zebra TC52: Starta datumkontroll i datumboken', false, 1),
      (tmpl_id, 'Mejeri & Kyl: Kontrollera alla produkter mot bäst-före-datum', false, 2),
      (tmpl_id, 'Chark & Deli: Kontrollera alla produkter, märk ned med Zebra-skrivare', false, 3),
      (tmpl_id, 'Frukt & Grönt: Kontrollera datum och kassera kasserade produkter', true, 4),
      (tmpl_id, 'Torrsortiment: Stickprovskontroll av utgående artiklar', false, 5),
      (tmpl_id, 'Frysar: Kontrollera frysta varor mot datum', false, 6),
      (tmpl_id, 'Kassera och dokumentera alla varor med passerat datum', false, 7),
      (tmpl_id, 'Kontrollera att prismärkningslappar (Shoppa) stämmer för nedsatta varor', false, 8);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Hittades varor med passerat datum?', 'yes_no', true, 1),
      (tmpl_id, 'Antal kasserade artiklar och varugrupp', 'text', false, 2);
  END IF;

  -- 9. GetCompliant — månatlig egenkontrllsgenomgång
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'GetCompliant — månadsvis egenkontroll' AND category = 'HACCP') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'GetCompliant — månadsvis egenkontroll',
      'Månadsvis genomgång av GetCompliant-systemet för egenkontroll. Säkerställ att alla obligatoriska kontroller är dokumenterade och att avvikelser är hanterade.',
      'HACCP', 'Kritisk', 'monthly', ARRAY[]::integer[], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'GetCompliant: Logga in och granska månadsrapport för egenkontroll', false, 1),
      (tmpl_id, 'GetCompliant: Kontrollera att alla dagliga temperaturloggningar är ifyllda', false, 2),
      (tmpl_id, 'GetCompliant: Granska och stäng öppna avvikelser från föregående månad', false, 3),
      (tmpl_id, 'Kontrollera att städprotokoll är signerade och dokumenterade', false, 4),
      (tmpl_id, 'Skadedjurskontroll: Kontrollera fällor och dokumentera i GetCompliant', true, 5),
      (tmpl_id, 'GetCompliant: Säkerställ att personalens HACCP-utbildning är uppdaterad', false, 6);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Är alla obligatoriska GetCompliant-kontroller godkända?', 'yes_no', true, 1),
      (tmpl_id, 'Beskriv eventuella öppna avvikelser och planerade åtgärder', 'text', false, 2);
  END IF;

  -- 10. Foodora & Wolt — daglig leveranskontroll
  IF NOT EXISTS (SELECT 1 FROM checklist_templates WHERE title = 'Foodora & Wolt — daglig plockkontroll' AND category = 'Drift') THEN
    INSERT INTO checklist_templates (title, description, category, priority, recurrence_rule, recurrence_days, due_date_offset)
    VALUES (
      'Foodora & Wolt — daglig plockkontroll',
      'Daglig kontroll för hemleveransorder via Foodora och Wolt. Säkerställ korrekt plockning, temperaturhantering och leveransstatus.',
      'Drift', 'Hög', 'daily', ARRAY[1,2,3,4,5,6,7], 0
    ) RETURNING id INTO tmpl_id;

    INSERT INTO template_stores (template_id, store_id) VALUES (tmpl_id, torshalla_id), (tmpl_id, skogstorp_id);

    INSERT INTO checklist_template_items (template_id, label, requires_photo, sort_order) VALUES
      (tmpl_id, 'Foodora/Wolt-app: Kontrollera inkomna order och acceptera inom tidsgräns', false, 1),
      (tmpl_id, 'Plocklista: Kontrollera att alla artiklar finns i lager (SAP)', false, 2),
      (tmpl_id, 'Kylda och frysta varor: Packa i kylväska, håll kyla under hela plockprocessen', false, 3),
      (tmpl_id, 'Kontrollera att substitutionsregler följs vid utslut', false, 4),
      (tmpl_id, 'Kvittens: Bekräfta leverans i Foodora/Wolt-appen', false, 5);

    INSERT INTO checklist_template_questions (template_id, label, question_type, is_required, sort_order) VALUES
      (tmpl_id, 'Genomfördes alla order utan avvikelse?', 'yes_no', true, 1),
      (tmpl_id, 'Beskriv eventuella problem (utslut, förseningar, reklamationer)', 'text', false, 2);
  END IF;

END $$;
