/*
  # Add responsible_group_id to incidents + seed default user groups

  1. Changes
    - `incidents` table: add nullable `responsible_group_id` FK → `user_groups`
    - Seed default user groups for each store if none exist:
      - "Alla medarbetare"
      - "Ledning"
      - "Lager"
      - "Kassa"
      - "Färskvaror"

  2. Security
    - RLS already enabled on user_groups; existing policies cover SELECT/INSERT for authenticated users
    - New incident column inherits existing incidents RLS
*/

-- Add responsible_group_id to incidents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'responsible_group_id'
  ) THEN
    ALTER TABLE incidents ADD COLUMN responsible_group_id uuid REFERENCES user_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Seed default groups for stores that have none
DO $$
DECLARE
  store_row RECORD;
  group_names text[] := ARRAY['Alla medarbetare', 'Ledning', 'Lager', 'Kassa', 'Färskvaror'];
  gname text;
BEGIN
  FOR store_row IN SELECT id FROM stores WHERE is_active = true LOOP
    IF NOT EXISTS (SELECT 1 FROM user_groups WHERE store_id = store_row.id LIMIT 1) THEN
      FOREACH gname IN ARRAY group_names LOOP
        INSERT INTO user_groups (name, store_id) VALUES (gname, store_row.id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;
