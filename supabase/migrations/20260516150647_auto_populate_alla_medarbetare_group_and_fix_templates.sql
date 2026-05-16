/*
  # Auto-populate "Alla medarbetare" group + fix template recurrence rules

  1. Changes
    - Adds all active users from each store into that store's "Alla medarbetare" group
      (inserts into user_group_members, safe to re-run due to ON CONFLICT DO NOTHING)
    - Fixes template recurrence rules:
      - Temperaturloggning: daily (was weekly every day — simpler to schedule)
      - Kassaavstämning: daily (was weekly every day)
      - Varupåfyllning nattskift: daily (was weekly every day)
      - Leveranskontroll: no change (no recurrence — correct, happens ad-hoc)
      - Personalmöte: monthly (was NULL)
      - Utgångsdatumkontroll: weekly Mon/Wed/Fri (already correct)
      - Veckostädning Frukt & Grönt: weekly Monday (already correct)
      - Veckostädning Kyl & Chark: weekly Tuesday (already correct)
      - Returstation pantrum: weekly Monday (already correct)
      - HACCP: monthly (already correct)

  2. Security
    - user_group_members RLS already exists
*/

-- ── Populate "Alla medarbetare" with all active store users ───────────────────
DO $$
DECLARE
  g_row RECORD;
  us_row RECORD;
BEGIN
  -- For each "Alla medarbetare" group, add all users from that store
  FOR g_row IN
    SELECT id AS group_id, store_id FROM user_groups WHERE name = 'Alla medarbetare'
  LOOP
    FOR us_row IN
      SELECT user_id FROM user_stores WHERE store_id = g_row.store_id
    LOOP
      INSERT INTO user_group_members (group_id, user_id)
      VALUES (g_row.group_id, us_row.user_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ── Fix template recurrence rules ────────────────────────────────────────────

-- Temperaturloggning: daily (remove recurrence_days, simplify to daily)
UPDATE checklist_templates
SET recurrence_rule = 'daily', recurrence_days = NULL
WHERE title = 'Temperaturloggning — Kylar & Frysar'
  AND recurrence_rule = 'weekly';

-- Kassaavstämning: daily
UPDATE checklist_templates
SET recurrence_rule = 'daily', recurrence_days = NULL
WHERE title = 'Kassaavstämning — Daglig stängning'
  AND recurrence_rule = 'weekly';

-- Varupåfyllning nattskift: daily
UPDATE checklist_templates
SET recurrence_rule = 'daily', recurrence_days = NULL
WHERE title = 'Varupåfyllning — Checklista nattskift'
  AND recurrence_rule = 'weekly';

-- Personalmöte: monthly (was NULL)
UPDATE checklist_templates
SET recurrence_rule = 'monthly'
WHERE title = 'Personalmöte — Förberedelsechecklista'
  AND recurrence_rule IS NULL;
