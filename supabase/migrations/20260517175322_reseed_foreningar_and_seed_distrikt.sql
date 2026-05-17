/*
  # Reseed foreningar with correct list and seed distrikt from stores

  ## Changes
  1. Delete all existing foreningar rows
  2. Insert the 23 correct föreningar
  3. Seed distrikt table from the distinct distrikt_namn values on the stores table
     (13 distinct names found: Fygitala, SH Norr, SH Syd, VH Nord 1–5, VH Syd 1–5)

  ## Notes
  - Any app_users.forening_id or distrikt_id foreign keys pointing to old rows
    will be set to NULL first to avoid constraint violations
  - Distrikt rows have no forening_id set (left NULL) since the mapping is unknown
*/

-- Nullify FK references to old foreningar rows to allow deletion
UPDATE app_users SET forening_id = NULL WHERE forening_id IS NOT NULL;
UPDATE app_users SET distrikt_id = NULL WHERE distrikt_id IS NOT NULL;
UPDATE stores SET forening_id = NULL WHERE forening_id IS NOT NULL;
UPDATE stores SET distrikt_id = NULL WHERE distrikt_id IS NOT NULL;

-- Delete old distrikt then foreningar
DELETE FROM distrikt;
DELETE FROM foreningar;

-- Insert correct foreningar
INSERT INTO foreningar (name, short_code) VALUES
  ('Bjursås Konsumentförening',              'BJURSAS'),
  ('Dalsjöfors, Konsumentföreningen',        'DALSJO'),
  ('Coop Finspång',                          'FINSPANG'),
  ('Forsbacka, Konsumentförening',           'FORSBACKA'),
  ('Frillesås, Konsumentföreningen',         'FRILLESAS'),
  ('Färingsö konsumentförening',             'FARINGO'),
  ('Getinge, Kooperativa Handelsföreningen', 'GETINGE'),
  ('Coop Gotland',                           'GOTLAND'),
  ('Coop Karlshamn',                         'KARLSHAMN'),
  ('Mellersta Nissadalens konsumentförening','NISSDAL'),
  ('Coop Mitt',                              'MITT'),
  ('Möja, Konsumentföreningen',              'MOJA'),
  ('Mörrum, Konsumentföreningen',            'MORRUM'),
  ('Coop Nord',                              'NORD'),
  ('Coop Norrbotten',                        'NORRBOTTEN'),
  ('Sollerö, Konsumentförening',             'SOLLERO'),
  ('Styrsö, Konsumentförening',              'STYRSO'),
  ('Coop Tabergsdalen',                      'TABERGSDALEN'),
  ('Coop Varberg',                           'VARBERG'),
  ('Veberöds konsumtionsförening',           'VEBEROD'),
  ('Coop Värmland',                          'VARMLAND'),
  ('Coop Väst',                              'VAST'),
  ('Coop Östra',                             'OSTRA');

-- Seed distrikt from distinct distrikt_namn values on stores
INSERT INTO distrikt (name) VALUES
  ('Fygitala'),
  ('SH Norr'),
  ('SH Syd'),
  ('VH Nord 1'),
  ('VH Nord 2'),
  ('VH Nord 3'),
  ('VH Nord 4'),
  ('VH Nord 5'),
  ('VH Syd 1'),
  ('VH Syd 2'),
  ('VH Syd 3'),
  ('VH Syd 4'),
  ('VH Syd 5');
