/*
  # Add checkpoint_id to kundrunda_common_defects and reseed with checkpoint-specific data

  ## Summary
  Common deviations in customer rounds must be relevant to the specific checkpoint
  they belong to. This migration adds a nullable `checkpoint_id` foreign key to
  `kundrunda_common_defects` so each defect can be scoped to one checkpoint.

  Defects with `checkpoint_id = NULL` are treated as store-wide/generic defects
  shown everywhere (backwards compatible). Defects with a specific checkpoint_id
  are only shown when the user is responding to that checkpoint.

  ## Changes
  - New column: `kundrunda_common_defects.checkpoint_id` (uuid, nullable FK → kundrunda_checkpoints)
  - All existing generic defects cleared and replaced with checkpoint-specific ones
  - Each zone's checkpoints get defects relevant to that exact area
*/

-- Add checkpoint_id column (nullable for backwards compat)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kundrunda_common_defects' AND column_name = 'checkpoint_id'
  ) THEN
    ALTER TABLE kundrunda_common_defects
      ADD COLUMN checkpoint_id uuid REFERENCES kundrunda_checkpoints(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Clear all existing generic defects
DELETE FROM kundrunda_common_defects WHERE store_id IS NULL;

-- =====================================================
-- PARKERINGSPLATS / UTSIDA — checkpoint-specific defects
-- =====================================================

-- "Allmän yta ren och skräpfri"
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skräp/fimpar på marken', 1 FROM kundrunda_checkpoints WHERE label = 'Allmän yta ren och skräpfri';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Spill eller fläckar på asfalten', 2 FROM kundrunda_checkpoints WHERE label = 'Allmän yta ren och skräpfri';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Ogräs eller snö ej åtgärdat', 3 FROM kundrunda_checkpoints WHERE label = 'Allmän yta ren och skräpfri';

-- "Gatupratare, vepor och skyltar är hela/aktuella"
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Gammal kampanjanvisning sitter kvar', 1 FROM kundrunda_checkpoints WHERE label = 'Gatupratare, vepor och skyltar är hela/aktuella';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skylt/gatupratare skadad eller smutsig', 2 FROM kundrunda_checkpoints WHERE label = 'Gatupratare, vepor och skyltar är hela/aktuella';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Öppettidsskylt felaktig eller saknas', 3 FROM kundrunda_checkpoints WHERE label = 'Gatupratare, vepor och skyltar är hela/aktuella';

-- "Vagnar och korgar samlade och skräpfria" (parking)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kundvagnar utspridda på parkeringen', 1
FROM kundrunda_checkpoints
WHERE label = 'Vagnar och korgar samlade och skräpfria'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'PARKERINGSPLATS / UTSIDA BUTIK');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skräp i vagnarna', 2
FROM kundrunda_checkpoints
WHERE label = 'Vagnar och korgar samlade och skräpfria'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'PARKERINGSPLATS / UTSIDA BUTIK');

-- =====================================================
-- ENTRÉ — checkpoint-specific defects
-- =====================================================

-- "Städning rent och fräscht" (entré)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Golvet smutsigt/skräpigt vid entrén', 1
FROM kundrunda_checkpoints
WHERE label = 'Städning rent och fräscht'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'ENTRÉ');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Glasdörrar/skyltfönster fläckiga', 2
FROM kundrunda_checkpoints
WHERE label = 'Städning rent och fräscht'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'ENTRÉ');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Spill ej åtgärdat', 3
FROM kundrunda_checkpoints
WHERE label = 'Städning rent och fräscht'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'ENTRÉ');

-- "Aktuellt skyltmaterial & tema sitter uppe"
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Gammal kampanjskylt sitter kvar', 1 FROM kundrunda_checkpoints WHERE label = 'Aktuellt skyltmaterial & tema sitter uppe';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Aktuell kampanjanvisning saknas', 2 FROM kundrunda_checkpoints WHERE label = 'Aktuellt skyltmaterial & tema sitter uppe';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skyltar sitter snett eller är skadade', 3 FROM kundrunda_checkpoints WHERE label = 'Aktuellt skyltmaterial & tema sitter uppe';

-- "First Buy på plats"
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'First Buy-displayer tomma', 1 FROM kundrunda_checkpoints WHERE label = 'First Buy på plats';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'First Buy saknas helt', 2 FROM kundrunda_checkpoints WHERE label = 'First Buy på plats';

-- =====================================================
-- FRUKT OCH GRÖNT — checkpoint-specific defects
-- =====================================================

-- "Städning rent och fräscht" (frukt & grönt)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Torkade blad/rester under/vid disk', 1
FROM kundrunda_checkpoints
WHERE label = 'Städning rent och fräscht'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Golvet runt disken smutsigt', 2
FROM kundrunda_checkpoints
WHERE label = 'Städning rent och fräscht'
  AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');

-- "Frukt eller grönt i dåligt skick" (via generell checkpunkt)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Frukt eller grönt i dåligt skick', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Hål i hyllan — varan saknas', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum', 3 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');

-- "Skyltning" (frukt & grönt)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Felmärkt pris eller varuetikett', 1 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kampanjvara ej exponerad', 2 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Etikett saknas', 3 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');

-- "Vågar rena och fräscha och fungerar" (frukt & grönt)
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Våg smutsig', 1 FROM kundrunda_checkpoints WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Våg ur funktion eller ej kalibrerad', 2 FROM kundrunda_checkpoints WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRUKT OCH GRÖNT');

-- =====================================================
-- MEJERI — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kylmöbel håller inte temperatur (kontrollera RDM/Danfoss)', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kylmöbeln smutsig invändigt', 2 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum i mejeri', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Hål i kylhyllan', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Felmärkt pris i mejeri', 1 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'MEJERI');

-- =====================================================
-- FÄRSK — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kylmöbel håller inte temperatur', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kylmöbeln smutsig — kondensvatten/spill', 2 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum i färskvaror', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Trasig/skadad förpackning i hyllan', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FÄRSK');

-- =====================================================
-- FRYS — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Frys håller inte temperatur (kontrollera RDM/Danfoss)', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Is-/frostbildning inuti frysen', 2 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Fryslock/dörr stänger inte tätt', 3 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum i frysen', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Hål i fryshyllan', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Felmärkt pris vid frysen', 1 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'FRYS');

-- =====================================================
-- KOLONIAL & NONFOOD — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Hyllan dammig eller fettfläckig', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Golvet under hyllorna smutsigt', 2 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum i kolonial', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Varan på fel plats/planogram', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Gaveln/torget ej påfyllt', 1 FROM kundrunda_checkpoints WHERE label = 'Gavlar/torg påfyllda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kampanjvara ej exponerad på gaveln', 2 FROM kundrunda_checkpoints WHERE label = 'Gavlar/torg påfyllda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Felmärkt pris i kolonial', 1 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KOLONIAL & NONFOOD');

-- =====================================================
-- BRÖD — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Bröd torrt eller skadat', 1 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'BRÖD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Passerat bäst-före-datum på bröd', 2 FROM kundrunda_checkpoints WHERE label = 'Generellt säljtryck/hål i hyllan' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'BRÖD');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Smulor/skräp på brödavdelningens golv', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'BRÖD');

-- =====================================================
-- KONFEKTYR — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Lösgodispåsar tomma', 1 FROM kundrunda_checkpoints WHERE label = 'Påsar påfyllda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Påsar saknas på sin plats', 2 FROM kundrunda_checkpoints WHERE label = 'Påsar påfyllda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Godishyllan smutsig/klibbig', 1 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KONFEKTYR');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Godisspill på golvet', 2 FROM kundrunda_checkpoints WHERE label = 'Städning rent och fräscht' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KONFEKTYR');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Slevar smutsiga', 1 FROM kundrunda_checkpoints WHERE label = 'Slevar diskade - påfyllt';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Slevar saknas', 2 FROM kundrunda_checkpoints WHERE label = 'Slevar diskade - påfyllt';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Godisvåg smutsig', 1 FROM kundrunda_checkpoints WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KONFEKTYR');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Godisvåg ur funktion', 2 FROM kundrunda_checkpoints WHERE label = 'Vågar rena och fräscha och fungerar' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KONFEKTYR');

-- =====================================================
-- KASSA — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kassaköen lång — underbemanning', 1 FROM kundrunda_checkpoints WHERE label = 'Ordning och reda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Smutsigt runt kassan', 2 FROM kundrunda_checkpoints WHERE label = 'Ordning och reda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kassakvittorull slut/trasig', 1 FROM kundrunda_checkpoints WHERE label = 'Skyltning (Rätt pris/vara/format/kampanj/placering)' AND zone_id = (SELECT id FROM kundrunda_zones WHERE name = 'KASSA');
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Impulsvaror saknas/tomma', 1 FROM kundrunda_checkpoints WHERE label = 'Impulslådor';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Impulslåda smutsig', 2 FROM kundrunda_checkpoints WHERE label = 'Impulslådor';

-- =====================================================
-- UTANFÖR KASSALINJEN — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Pantrum smutsigt/luktproblem', 1 FROM kundrunda_checkpoints WHERE label = 'Pantrum i allmänhet rent och städat';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Golv i pantrum smutsigt', 2 FROM kundrunda_checkpoints WHERE label = 'Pantrum i allmänhet rent och städat';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Väggar i pantrum smutsiga', 3 FROM kundrunda_checkpoints WHERE label = 'Pantrum i allmänhet rent och städat';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Pantmaskin ur funktion', 1 FROM kundrunda_checkpoints WHERE label = 'Pantmaskin fungerar';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Pantmaskin full/kärl behöver tömmas', 2 FROM kundrunda_checkpoints WHERE label = 'Pantmaskin fungerar';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Returstationen full — kärl behöver tömmas', 1 FROM kundrunda_checkpoints WHERE label = 'Returstationen ej fulla kärl, inget skräp';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skräp runt returstationen', 2 FROM kundrunda_checkpoints WHERE label = 'Returstationen ej fulla kärl, inget skräp';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Kundtoalett ej städad', 1 FROM kundrunda_checkpoints WHERE label = 'Kundtoalett/handfat rent och fräsch';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Toalettpapper/tvål slut', 2 FROM kundrunda_checkpoints WHERE label = 'Kundtoalett/handfat rent och fräsch';

-- =====================================================
-- BAKOMLIGGANDE YTOR — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Lager i oordning — varor ej pallade/märkta', 1 FROM kundrunda_checkpoints WHERE label = 'Lagerordning';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Golvet i lagret smutsigt', 2 FROM kundrunda_checkpoints WHERE label = 'Lagerordning';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Nödutgång i lager blockerad', 3 FROM kundrunda_checkpoints WHERE label = 'Lagerordning';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Lastkajen oordnad eller farlig', 1 FROM kundrunda_checkpoints WHERE label = 'Lastkaj';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Skräp/emballage ej bortplockat vid lastkaj', 2 FROM kundrunda_checkpoints WHERE label = 'Lastkaj';

-- =====================================================
-- PERSONALYTOR — checkpoint-specific defects
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Omklädningsrum i oordning', 1 FROM kundrunda_checkpoints WHERE label = 'Omklädningsrum ordning & reda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Personliga ägodelar förvarade vid öppen mat (hygienproblem)', 2 FROM kundrunda_checkpoints WHERE label = 'Omklädningsrum ordning & reda';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Köket smutsigt', 1 FROM kundrunda_checkpoints WHERE label = 'Köket rent & fräsch';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Disk inte dukad', 2 FROM kundrunda_checkpoints WHERE label = 'Köket rent & fräsch';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Gammal mat i personalköket', 3 FROM kundrunda_checkpoints WHERE label = 'Köket rent & fräsch';

-- =====================================================
-- BELYSNING checkpoints (generic for all zones)
-- =====================================================

INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Lampbyte behövs', 1 FROM kundrunda_checkpoints WHERE label ILIKE 'Belysning fungerar%';
INSERT INTO kundrunda_common_defects (checkpoint_id, label, sort_order)
SELECT id, 'Belysning blinkar', 2 FROM kundrunda_checkpoints WHERE label ILIKE 'Belysning fungerar%';
