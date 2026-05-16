/*
  # Uppdatera kundrundan med Coop-systemreferenser

  Lägger till beskrivningar på kundrunda-checkpoints med konkreta
  hänvisningar till de system som används i Coop-butikerna:
  - Shoppa / GK Engage / Store Office: prisskyltar
  - Upshop / Zebra TC52: datumkontroll
  - Open Access / Planogram: hyllplacering
  - RDM (Torshälla) / Danfoss (Skogstorp): kylövervakning
  - Tomra: pantmaskin
  - GetCompliant: hygienprotokoll
  - Scan & Pay / Coop-appen: kassazonen
  - Relesys / Coop Direkt: personalinfo
*/

-- PARKERINGSPLATS / UTSIDA BUTIK
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att reklamblad är påfyllda och att digitala reklamblad synkar via Facebook/Instagram och Kivra.' WHERE label = 'Reklamblad påfyllda';
UPDATE kundrunda_checkpoints SET description = 'Kontrollera gatupratare, vepor och A-skyltar. Prismärkning ska stämma mot aktuell kampanj i GK Engage.' WHERE label = 'Gatupratare, vepor och skyltar är hela/aktuella';
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att fasadbelysning fungerar. Felanmäl via IA-systemet om lampbyte behövs.' WHERE label = 'Butikens fasad ren';

-- ENTRÉ
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att Medlemspunkten (reklamskärm + touchskärm med Coop-appen) är påslagen och visar aktuellt innehåll.' WHERE label = 'First Buy på plats';
UPDATE kundrunda_checkpoints SET description = 'Skyltmaterial ska matcha aktuell kampanjperiod i GK Engage. Kontrollera att Shoppa-skyltar är utskrivna och sitter rätt.' WHERE label = 'Aktuellt skyltmaterial & tema sitter uppe';

-- FRUKT OCH GRÖNT
UPDATE kundrunda_checkpoints SET description = 'Skyltning ska stämma med Open Access-planogram och aktuell kampanj i GK Engage. Prismärkning via Shoppa.' WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att Ishida-vågarna (Wraptech) är kalibrerade och att etikettutskrift fungerar korrekt.' WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
UPDATE kundrunda_checkpoints SET description = 'Kontrollera utgångsdatum med Upshop (datumboken) på Zebra TC52. Kassera och dokumentera avvikelser.' WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');

-- BRÖD
UPDATE kundrunda_checkpoints SET description = 'Bakoff-ugnar: Kontrollera att ugnar är igång (ej uppkopplade). Kontrollera bröddisken mot Open Access-planogram.' WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'BRÖD');

-- MEJERI
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att kylmöblerna håller rätt temperatur. Torshälla: Stäm av mot RDM-övervakning. Skogstorp: Stäm av mot Danfoss.' WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');
UPDATE kundrunda_checkpoints SET description = 'Upshop / Zebra TC52: Kontrollera mejeriprodukters datum. Hög prioritet — kort hållbarhet.' WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');

-- FÄRSK (Kött/Chark)
UPDATE kundrunda_checkpoints SET description = 'Kylmöbler: Torshälla — kontrollera att RDM inte visar larm på Wica/Arneg-aggregat. Skogstorp — kontrollera Danfoss-styrning.' WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');
UPDATE kundrunda_checkpoints SET description = 'Upshop / Zebra TC52: Datumkontroll är kritisk för färskvaror. Skriv ut nedprislappar via Zebra-skrivare vid behov.' WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');

-- FRYS
UPDATE kundrunda_checkpoints SET description = 'Kontrollera frysar mot temperaturövervakning. Torshälla: RDM-systemet (Resource Data Management). Skogstorp: Danfoss. Larm → felanmäl direkt.' WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
UPDATE kundrunda_checkpoints SET description = 'Upshop datumkontroll på frysvaror. Kontrollera att lock/dörrar till frysmöbler stängs korrekt för att undvika temperaturavvikelser.' WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');

-- KOLONIAL & NONFOOD
UPDATE kundrunda_checkpoints SET description = 'Hyllplacering ska följa Open Access-planogram. Tillvalsartiklar aktiveras i SAP FnR via Open Access.' WHERE label = 'Gavlar/torg påfyllda';
UPDATE kundrunda_checkpoints SET description = 'Prismärkning via Shoppa (kopplat till GK Engage och SAP). Kontrollera att digitala prislappar stämmer mot kassan (Store Office).' WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');

-- KONFEKTYR
UPDATE kundrunda_checkpoints SET description = 'Kontrollera att Ishida-vågarna för lösgodis (Wraptech) fungerar och är kalibrerade.' WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KONFEKTYR');

-- KASSA
UPDATE kundrunda_checkpoints SET description = 'Store Office (Extenda): Kontrollera att kassorna är i drift. Kontrollera Scan & Pay-flödet i Coop-appen. Digitala kvitton fungerar?' WHERE label = 'Ordning och reda' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KASSA');
UPDATE kundrunda_checkpoints SET description = 'Impulsskyltning ska matcha kampanj i GK Engage. Shoppa-skyltar ska vara aktuella.' WHERE label = 'Impulslådor';
UPDATE kundrunda_checkpoints SET description = 'Last Buy-skyltning ska stämma med aktuell prissättning i Store Office / SAP.' WHERE label = 'Lastbuy';

-- UTANFÖR KASSALINJEN
UPDATE kundrunda_checkpoints SET description = 'Tomra-pantmaskinen: Kontrollera att den tar emot pant korrekt. Kvitton och Coop-app-utbetalning ska fungera. Vid fel — rapportera i StoreFlow.' WHERE label = 'Pantmaskin fungerar';
UPDATE kundrunda_checkpoints SET description = 'Returstation och pantrum: Kontrollera att kärl inte är fulla och att Tomra-maskinen inte har driftstopp. Rent och välkomnande.' WHERE label = 'Returstationen ej fulla kärl, inget skräp';

-- BAKOMLIGGANDE YTOR
UPDATE kundrunda_checkpoints SET description = 'Lagerordning: Kontrollera att mottagna leveranser är inlagda i SAP. Temperaturkänsliga varor ska vara inmättade och placerade korrekt.' WHERE label = 'Lagerordning';
UPDATE kundrunda_checkpoints SET description = 'Lastkaj: Kontrollera att RCO-larmet är aktiverat för bakdörr (Torshälla: M-Card-passersystem). Inga obehöriga varor.' WHERE label = 'Lastkaj';

-- PERSONALYTOR
UPDATE kundrunda_checkpoints SET description = 'Personalytor: Kontrollera att Coop Direkt-skärmen (Starbit) visar aktuell information och inga larm. SoftOne GO: Schema publicerat?' WHERE label = 'Köket rent & fräsch';
